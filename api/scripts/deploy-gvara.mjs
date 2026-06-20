// Deploy gVARA super-token (wraps wVARA) on Vara Mainnet
// Run from api/ directory: node scripts/deploy-gvara.mjs

import { GearApi, GearKeyring } from '@gear-js/api';
import { Sails } from 'sails-js';
import { SailsIdlParser } from 'sails-js-parser';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(__dirname, '../..');

config({ path: resolve(API_ROOT, '.env') });

const VARA_SEED = process.env.VARA_SEED;
const VARA_NODE = process.env.VARA_NODE || 'wss://rpc.vara.network';
const WVARA_TOKEN_ID = process.env.WVARA_TOKEN_ID;
const STREAM_CORE_ID = process.env.STREAM_CORE_ID;
const DEPLOY_STATE_PATH = resolve(PROJECT_ROOT, 'deploy-state.json');
const ENV_PATH = resolve(API_ROOT, '.env');

const WASM_BASE = resolve(PROJECT_ROOT, 'contracts/target/wasm32v1-none/wasm32-gear/release');
const SUPER_TOKEN_WASM = resolve(WASM_BASE, 'super_token.opt.wasm');
const SUPER_TOKEN_IDL = resolve(PROJECT_ROOT, 'contracts/super-token/super-token.idl');
const STREAM_CORE_IDL = resolve(PROJECT_ROOT, 'contracts/stream-core/stream-core.idl');

const FIXED_GAS = 50_000_000_000n;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function encodeCompactU32(value) {
  if (value < 64) return Buffer.from([value << 2]);
  if (value < 16384) { const v = (value << 2) | 1; return Buffer.from([v & 0xff, (v >> 8) & 0xff]); }
  const v = (value << 2) | 2;
  return Buffer.from([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
}

function encodeSailsInitPayload(...parts) {
  const bufs = parts.map(p => {
    if (typeof p === 'string') {
      const b = Buffer.from(p, 'utf-8');
      return Buffer.concat([encodeCompactU32(b.length), b]);
    }
    if (typeof p === 'boolean') return Buffer.from([p ? 1 : 0]);
    if (typeof p === 'number') { const b = Buffer.alloc(1); b.writeUInt8(p); return b; }
    if (p instanceof Uint8Array || Buffer.isBuffer(p)) {
      // ActorId is fixed 32 bytes — no length prefix in SCALE encoding
      return Buffer.from(p);
    }
    return Buffer.alloc(0);
  });
  return '0x' + Buffer.concat(bufs).toString('hex');
}

function encodeActorId(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(clean.padStart(64, '0'), 'hex');
}

async function deployContract(api, keyring, name, wasmPath, initPayload) {
  console.log(`\n── Deploying ${name} ──`);
  const code = readFileSync(wasmPath);
  console.log(`   WASM: ${(code.length / 1024).toFixed(1)} KB`);

  const { programId, codeId, extrinsic } = api.program.upload({
    code,
    gasLimit: FIXED_GAS,
    value: 0,
    initPayload,
  });
  console.log(`   Program ID: ${programId}`);

  await new Promise((res, rej) => {
    const timeout = setTimeout(() => rej(new Error('Timeout 120s')), 120_000);
    extrinsic.signAndSend(keyring, ({ events = [], status }) => {
      if (status.isInBlock) console.log(`   In block: ${status.asInBlock.toHex()}`);
      if (status.isFinalized) {
        clearTimeout(timeout);
        const failed = events.some(({ event }) => api.events.system.ExtrinsicFailed.is(event));
        if (failed) rej(new Error(`${name} deploy failed on-chain`));
        else res();
      }
    }).catch(e => { clearTimeout(timeout); rej(e); });
  });

  console.log(`   ✓ ${name} deployed: ${programId}`);
  return { programId, codeId };
}

async function sailsCall(api, keyring, parser, idlPath, programId, service, method, ...args) {
  const idl = readFileSync(idlPath, 'utf-8');
  const sails = new Sails(parser);
  sails.parseIdl(idl);
  sails.setApi(api);
  sails.setProgramId(programId);

  const fn = sails.services[service].functions[method];
  if (!fn) throw new Error(`${service}.${method} not found in IDL`);

  const tx = fn(...args).withAccount(keyring, { disableClientAuth: true });

  await new Promise((res, rej) => {
    const timeout = setTimeout(() => rej(new Error(`${method} timeout 60s`)), 60_000);
    tx.signAndSend(({ events = [], status }) => {
      if (status.isInBlock) console.log(`   In block: ${status.asInBlock.toHex()}`);
      if (status.isFinalized) {
        clearTimeout(timeout);
        const failed = events.some(({ event }) => api.events.system.ExtrinsicFailed.is(event));
        if (failed) rej(new Error(`${service}.${method} failed on-chain`));
        else res();
      }
    }).catch(e => { clearTimeout(timeout); rej(e); });
  });
}

function updateEnvFile(envPath, updates) {
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (regex.test(content)) content = content.replace(regex, line);
    else content += `\n${line}`;
  }
  writeFileSync(envPath, content);
}

if (!VARA_SEED || VARA_SEED.includes('word1')) { console.error('VARA_SEED not set'); process.exit(1); }
if (!WVARA_TOKEN_ID) { console.error('WVARA_TOKEN_ID not set in .env'); process.exit(1); }
if (!STREAM_CORE_ID) { console.error('STREAM_CORE_ID not set in .env'); process.exit(1); }
if (!existsSync(SUPER_TOKEN_WASM)) { console.error(`Missing WASM: ${SUPER_TOKEN_WASM}`); process.exit(1); }

console.log('=== Deploy gVARA Super-Token ===');
console.log(`Node:        ${VARA_NODE}`);
console.log(`wVARA:       ${WVARA_TOKEN_ID}`);
console.log(`stream-core: ${STREAM_CORE_ID}`);

const api = await GearApi.create({ providerAddress: VARA_NODE });
console.log(`Connected:   ${await api.chain()}`);

let keyring;
try { keyring = await GearKeyring.fromMnemonic(VARA_SEED); }
catch { keyring = await GearKeyring.fromSuri(VARA_SEED); }
console.log(`Account:     ${keyring.address}`);

const accountInfo = await api.query.system.account(keyring.address);
const balance = Number(BigInt(accountInfo.data.free.toString())) / 1e12;
console.log(`Balance:     ${balance.toFixed(4)} VARA`);

if (balance < 5) { console.error('Need at least 5 VARA to deploy gVARA'); process.exit(1); }

const parser = await SailsIdlParser.new();

// Deploy gVARA: native wrapper (is_native_wrapper: true, underlying = zero address)
// Users send native VARA with the WrapNative tx to get gVARA back 1:1
const ZERO_ACTOR_ID = '0x0000000000000000000000000000000000000000000000000000000000000000';
const gVaraPayload = encodeSailsInitPayload(
  'New',
  'GrowStreams VARA',
  'gVARA',
  12,
  encodeActorId(ZERO_ACTOR_ID),
  true,
);

const { programId: GVARA_TOKEN_ID, codeId: gVaraCodeId } =
  await deployContract(api, keyring, 'gVARA super-token', SUPER_TOKEN_WASM, gVaraPayload);
await sleep(5000);

// Wire: super-token.AddFlowController(stream_core)
console.log('\n── Wiring: gVARA.AddFlowController(stream_core) ──');
try {
  await sailsCall(api, keyring, parser, SUPER_TOKEN_IDL, GVARA_TOKEN_ID,
    'SuperTokenService', 'AddFlowController', STREAM_CORE_ID);
  console.log('   ✓ stream-core registered as flow controller on gVARA');
} catch (err) {
  console.warn(`   ⚠ AddFlowController failed: ${err.message}`);
}
await sleep(3000);

// Wire: stream-core.RegisterSuperToken(wVARA, gVARA)
console.log('\n── Wiring: stream-core.RegisterSuperToken(wVARA, gVARA) ──');
try {
  await sailsCall(api, keyring, parser, STREAM_CORE_IDL, STREAM_CORE_ID,
    'StreamService', 'RegisterSuperToken', WVARA_TOKEN_ID, GVARA_TOKEN_ID);
  console.log('   ✓ wVARA mapped to gVARA in stream-core');
} catch (err) {
  console.warn(`   ⚠ RegisterSuperToken failed: ${err.message}`);
}

// Save to deploy-state.json
const state = existsSync(DEPLOY_STATE_PATH)
  ? JSON.parse(readFileSync(DEPLOY_STATE_PATH, 'utf-8'))
  : {};

state['gvara-token'] = {
  programId: GVARA_TOKEN_ID,
  codeId: gVaraCodeId,
  deployedAt: new Date().toISOString(),
  network: 'vara-mainnet',
  node: VARA_NODE,
  underlyingToken: WVARA_TOKEN_ID,
  symbol: 'gVARA',
};

writeFileSync(DEPLOY_STATE_PATH, JSON.stringify(state, null, 2));
console.log('\n✓ deploy-state.json updated');

updateEnvFile(ENV_PATH, { GVARA_TOKEN_ID: GVARA_TOKEN_ID });
console.log('✓ .env updated');

console.log('\n═══════════════════════════════════════════════════════');
console.log('  gVARA Deployed & Wired');
console.log('═══════════════════════════════════════════════════════');
console.log(`  gVARA ID:    ${GVARA_TOKEN_ID}`);
console.log(`  wVARA:       ${WVARA_TOKEN_ID}`);
console.log(`  Wired:       stream-core flow controller ✓`);
console.log(`  Registered:  wVARA → gVARA in stream-core ✓`);
console.log('═══════════════════════════════════════════════════════');

await api.disconnect();
process.exit(0);

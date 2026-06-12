// Deploy Superfluid contracts to Vara Mainnet
// Deploys: super-token, distribution-pool, liquidation-manager
// Then wires them together:
//   - super-token.AddFlowController(stream_core)
//   - super-token.AddFlowController(liquidation_manager)
//   - stream-core.RegisterSuperToken(grow_token, super_token)
//   - liquidation-manager.SetStreamCore(stream_core)
//
// Run from api/ directory: node scripts/deploy-superfluid.mjs

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

// .env lives in api/ directory
config({ path: resolve(API_ROOT, '.env') });

const VARA_SEED = process.env.VARA_SEED;
const VARA_NODE = process.env.VARA_NODE || 'wss://rpc.vara.network';
const DEPLOY_STATE_PATH = resolve(API_ROOT, 'deploy-state.json');
const ENV_PATH = resolve(API_ROOT, '.env');

// WASM paths — built by: cargo build --release --target wasm32v1-none
const WASM_BASE = resolve(PROJECT_ROOT, 'contracts/target/wasm32v1-none/wasm32-gear/release');
const WASMS = {
  'super-token':         resolve(WASM_BASE, 'super_token.opt.wasm'),
  'distribution-pool':   resolve(WASM_BASE, 'distribution_pool.opt.wasm'),
  'liquidation-manager': resolve(WASM_BASE, 'liquidation_manager.opt.wasm'),
};

// IDL paths for wiring calls
const IDL_PATHS = {
  'super-token':         resolve(PROJECT_ROOT, 'contracts/super-token/super-token.idl'),
  'stream-core':         resolve(PROJECT_ROOT, 'contracts/stream-core/stream-core.idl'),
  'liquidation-manager': resolve(PROJECT_ROOT, 'contracts/liquidation-manager/liquidation-manager.idl'),
};

// Existing mainnet IDs
const STREAM_CORE_ID = process.env.STREAM_CORE_ID;
const GROW_TOKEN_ID  = process.env.GROW_TOKEN_ID;

const FIXED_GAS = 50_000_000_000n; // 50B — proven on mainnet

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    if (typeof p === 'number') {
      const b = Buffer.alloc(1); b.writeUInt8(p); return b;
    }
    if (p instanceof Uint8Array || Buffer.isBuffer(p)) {
      return Buffer.concat([encodeCompactU32(p.length), Buffer.from(p)]);
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
  console.log(`   Init payload: ${typeof initPayload === 'string' ? initPayload : '0x' + Buffer.from(initPayload).toString('hex')}`);

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

async function sendMessage(api, keyring, programId, payload) {
  const extrinsic = api.message.send({
    destination: programId,
    payload,
    gasLimit: FIXED_GAS,
    value: 0,
  });

  await new Promise((res, rej) => {
    const timeout = setTimeout(() => rej(new Error('Message timeout 60s')), 60_000);
    extrinsic.signAndSend(keyring, ({ events = [], status }) => {
      if (status.isFinalized) {
        clearTimeout(timeout);
        const failed = events.some(({ event }) => api.events.system.ExtrinsicFailed.is(event));
        if (failed) rej(new Error('Message failed on-chain'));
        else res();
      }
    }).catch(e => { clearTimeout(timeout); rej(e); });
  });
}

async function sailsCall(api, keyring, parser, idlPath, programId, service, method, ...args) {
  const idl = readFileSync(idlPath, 'utf-8');
  const sails = new Sails(parser);
  sails.parseIdl(idl);
  sails.setApi(api);
  sails.setProgramId(programId);

  const fn = sails.services[service].functions[method];
  if (!fn) throw new Error(`${service}.${method} not found in IDL`);

  // sails-js 0.10 requires withAccount() before signAndSend
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
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += `\n${line}`;
    }
  }
  writeFileSync(envPath, content);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!VARA_SEED || VARA_SEED.includes('word1')) { console.error('VARA_SEED not set'); process.exit(1); }
if (!STREAM_CORE_ID) { console.error('STREAM_CORE_ID not set in .env'); process.exit(1); }
if (!GROW_TOKEN_ID)  { console.error('GROW_TOKEN_ID not set in .env'); process.exit(1); }

for (const [name, p] of Object.entries(WASMS)) {
  if (!existsSync(p)) { console.error(`Missing WASM: ${p}\nRun: cargo build --release --target wasm32v1-none -p ${name}`); process.exit(1); }
}

console.log('=== GrowStreams Superfluid Deploy ===');
console.log(`Node:        ${VARA_NODE}`);
console.log(`stream-core: ${STREAM_CORE_ID}`);
console.log(`grow-token:  ${GROW_TOKEN_ID}`);

const api = await GearApi.create({ providerAddress: VARA_NODE });
console.log(`Connected:   ${await api.chain()}`);

let keyring;
try { keyring = await GearKeyring.fromMnemonic(VARA_SEED); }
catch { keyring = await GearKeyring.fromSuri(VARA_SEED); }
console.log(`Account:     ${keyring.address}`);

const accountInfo = await api.query.system.account(keyring.address);
const balance = Number(BigInt(accountInfo.data.free.toString())) / 1e12;
console.log(`Balance:     ${balance.toFixed(4)} VARA`);

if (balance < 15) { console.error('Need at least 15 VARA to deploy 3 contracts'); process.exit(1); }

const parser = await SailsIdlParser.new();

// ---------------------------------------------------------------------------
// 1. Deploy super-token (wraps grow-token)
// ---------------------------------------------------------------------------
// Constructor: New(name, symbol, decimals, underlying_token, is_native_wrapper)
// For gGROW wrapping grow-token: name="GrowStreams GROW", symbol="gGROW", decimals=18
const superTokenPayload = encodeSailsInitPayload(
  'New',
  'GrowStreams GROW',    // name
  'gGROW',              // symbol
  18,                   // decimals (u8)
  encodeActorId(GROW_TOKEN_ID), // underlying_token (ActorId = 32 bytes)
  false,                // is_native_wrapper
);

const { programId: SUPER_TOKEN_ID, codeId: superTokenCodeId } =
  await deployContract(api, keyring, 'super-token', WASMS['super-token'], superTokenPayload);
await sleep(5000);

// ---------------------------------------------------------------------------
// 2. Deploy distribution-pool
// ---------------------------------------------------------------------------
// Constructor: New()
const poolPayload = '0x' + Buffer.concat([
  (() => { const b = Buffer.from('New', 'utf-8'); return Buffer.concat([encodeCompactU32(b.length), b]); })(),
]).toString('hex');

const { programId: DISTRIBUTION_POOL_ID, codeId: poolCodeId } =
  await deployContract(api, keyring, 'distribution-pool', WASMS['distribution-pool'], poolPayload);
await sleep(5000);

// ---------------------------------------------------------------------------
// 3. Deploy liquidation-manager
// ---------------------------------------------------------------------------
// Constructor: New()
const liqPayload = '0x' + Buffer.concat([
  (() => { const b = Buffer.from('New', 'utf-8'); return Buffer.concat([encodeCompactU32(b.length), b]); })(),
]).toString('hex');

const { programId: LIQUIDATION_MANAGER_ID, codeId: liqCodeId } =
  await deployContract(api, keyring, 'liquidation-manager', WASMS['liquidation-manager'], liqPayload);
await sleep(5000);

// ---------------------------------------------------------------------------
// 4. Wire: super-token.AddFlowController(stream_core)
// ---------------------------------------------------------------------------
console.log('\n── Wiring: super-token.AddFlowController(stream_core) ──');
try {
  await sailsCall(
    api, keyring, parser,
    IDL_PATHS['super-token'], SUPER_TOKEN_ID,
    'SuperTokenService', 'AddFlowController',
    STREAM_CORE_ID,
  );
  console.log('   ✓ stream-core registered as flow controller');
} catch (err) {
  console.warn(`   ⚠ AddFlowController(stream_core) failed: ${err.message}`);
}
await sleep(3000);

// ---------------------------------------------------------------------------
// 5. Wire: super-token.AddFlowController(liquidation_manager)
// ---------------------------------------------------------------------------
console.log('\n── Wiring: super-token.AddFlowController(liquidation_manager) ──');
try {
  await sailsCall(
    api, keyring, parser,
    IDL_PATHS['super-token'], SUPER_TOKEN_ID,
    'SuperTokenService', 'AddFlowController',
    LIQUIDATION_MANAGER_ID,
  );
  console.log('   ✓ liquidation-manager registered as flow controller');
} catch (err) {
  console.warn(`   ⚠ AddFlowController(liquidation_manager) failed: ${err.message}`);
}
await sleep(3000);

// ---------------------------------------------------------------------------
// 6. Wire: stream-core.RegisterSuperToken(grow_token, super_token)
// ---------------------------------------------------------------------------
console.log('\n── Wiring: stream-core.RegisterSuperToken(grow_token, super_token) ──');
try {
  await sailsCall(
    api, keyring, parser,
    IDL_PATHS['stream-core'], STREAM_CORE_ID,
    'StreamService', 'RegisterSuperToken',
    GROW_TOKEN_ID,
    SUPER_TOKEN_ID,
  );
  console.log('   ✓ grow-token mapped to super-token in stream-core');
} catch (err) {
  console.warn(`   ⚠ RegisterSuperToken failed: ${err.message}`);
}
await sleep(3000);

// ---------------------------------------------------------------------------
// 7. Wire: liquidation-manager.SetStreamCore(stream_core)
// ---------------------------------------------------------------------------
console.log('\n── Wiring: liquidation-manager.SetStreamCore(stream_core) ──');
try {
  await sailsCall(
    api, keyring, parser,
    IDL_PATHS['liquidation-manager'], LIQUIDATION_MANAGER_ID,
    'LiquidationService', 'SetStreamCore',
    STREAM_CORE_ID,
  );
  console.log('   ✓ stream-core set on liquidation-manager');
} catch (err) {
  console.warn(`   ⚠ SetStreamCore failed: ${err.message}`);
}

// ---------------------------------------------------------------------------
// 8. Save to deploy-state.json
// ---------------------------------------------------------------------------
const state = existsSync(DEPLOY_STATE_PATH)
  ? JSON.parse(readFileSync(DEPLOY_STATE_PATH, 'utf-8'))
  : {};

const now = new Date().toISOString();
state['super-token'] = {
  programId: SUPER_TOKEN_ID, codeId: superTokenCodeId,
  deployedAt: now, network: 'vara-mainnet', node: VARA_NODE,
  underlyingToken: GROW_TOKEN_ID, symbol: 'gGROW',
};
state['distribution-pool'] = {
  programId: DISTRIBUTION_POOL_ID, codeId: poolCodeId,
  deployedAt: now, network: 'vara-mainnet', node: VARA_NODE,
};
state['liquidation-manager'] = {
  programId: LIQUIDATION_MANAGER_ID, codeId: liqCodeId,
  deployedAt: now, network: 'vara-mainnet', node: VARA_NODE,
  streamCore: STREAM_CORE_ID,
};

writeFileSync(DEPLOY_STATE_PATH, JSON.stringify(state, null, 2));
console.log('\n✓ deploy-state.json updated');

// ---------------------------------------------------------------------------
// 9. Update .env
// ---------------------------------------------------------------------------
updateEnvFile(ENV_PATH, {
  SUPER_TOKEN_ID:         SUPER_TOKEN_ID,
  DISTRIBUTION_POOL_ID:   DISTRIBUTION_POOL_ID,
  LIQUIDATION_MANAGER_ID: LIQUIDATION_MANAGER_ID,
});
console.log('✓ .env updated');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n═══════════════════════════════════════════════════════');
console.log('  Superfluid Deployment Complete');
console.log('═══════════════════════════════════════════════════════');
console.log(`  super-token:         ${SUPER_TOKEN_ID}`);
console.log(`  distribution-pool:   ${DISTRIBUTION_POOL_ID}`);
console.log(`  liquidation-manager: ${LIQUIDATION_MANAGER_ID}`);
console.log('');
console.log('  Wiring:');
console.log(`  ✓ super-token flow controllers: stream-core, liquidation-manager`);
console.log(`  ✓ stream-core super token registry: grow-token → gGROW`);
console.log(`  ✓ liquidation-manager stream-core: set`);
console.log('═══════════════════════════════════════════════════════');

await api.disconnect();
process.exit(0);

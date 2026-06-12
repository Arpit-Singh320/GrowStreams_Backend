// Redeploy stream-core (Phase 2 version with RegisterSuperToken)
// Updates deploy-state.json and .env with new program ID
//
// Run from api/ directory: node scripts/redeploy-stream-core.mjs

import { GearApi, GearKeyring } from '@gear-js/api';
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
const DEPLOY_STATE_PATH = resolve(API_ROOT, 'deploy-state.json');
const ENV_PATH = resolve(API_ROOT, '.env');

const WASM_PATH = resolve(
  PROJECT_ROOT,
  'contracts/target/wasm32v1-none/wasm32-gear/release/stream_core.opt.wasm'
);

const FIXED_GAS = 50_000_000_000n;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function encodeCompactU32(value) {
  if (value < 64) return Buffer.from([value << 2]);
  if (value < 16384) { const v = (value << 2) | 1; return Buffer.from([v & 0xff, (v >> 8) & 0xff]); }
  const v = (value << 2) | 2;
  return Buffer.from([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
}

function encodeSailsNew() {
  const b = Buffer.from('New', 'utf-8');
  return '0x' + Buffer.concat([encodeCompactU32(b.length), b]).toString('hex');
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

if (!VARA_SEED) { console.error('VARA_SEED not set'); process.exit(1); }
if (!existsSync(WASM_PATH)) {
  console.error(`WASM not found: ${WASM_PATH}`);
  console.error('Run: cargo build --release --target wasm32v1-none -p stream-core');
  process.exit(1);
}

console.log('=== Redeploying stream-core (Phase 2) ===');
console.log(`Node: ${VARA_NODE}`);

const api = await GearApi.create({ providerAddress: VARA_NODE });
console.log(`Connected: ${await api.chain()}`);

let keyring;
try { keyring = await GearKeyring.fromMnemonic(VARA_SEED); }
catch { keyring = await GearKeyring.fromSuri(VARA_SEED); }
console.log(`Account: ${keyring.address}`);

const accountInfo = await api.query.system.account(keyring.address);
const balance = Number(BigInt(accountInfo.data.free.toString())) / 1e12;
console.log(`Balance: ${balance.toFixed(4)} VARA`);

const code = readFileSync(WASM_PATH);
console.log(`WASM: ${(code.length / 1024).toFixed(1)} KB`);

const initPayload = encodeSailsNew();
console.log(`Init payload: ${initPayload}`);

const { programId, codeId, extrinsic } = api.program.upload({
  code,
  gasLimit: FIXED_GAS,
  value: 0,
  initPayload,
});
console.log(`New Program ID: ${programId}`);

await new Promise((res, rej) => {
  const timeout = setTimeout(() => rej(new Error('Timeout 120s')), 120_000);
  extrinsic.signAndSend(keyring, ({ events = [], status }) => {
    if (status.isInBlock) console.log(`In block: ${status.asInBlock.toHex()}`);
    if (status.isFinalized) {
      clearTimeout(timeout);
      const failed = events.some(({ event }) => api.events.system.ExtrinsicFailed.is(event));
      if (failed) rej(new Error('stream-core deploy failed on-chain'));
      else res();
    }
  }).catch(e => { clearTimeout(timeout); rej(e); });
});

console.log(`\n✓ stream-core redeployed: ${programId}`);

// Update deploy-state.json
const state = existsSync(DEPLOY_STATE_PATH)
  ? JSON.parse(readFileSync(DEPLOY_STATE_PATH, 'utf-8'))
  : {};

state['stream-core'] = {
  programId, codeId,
  deployedAt: new Date().toISOString(),
  network: 'vara-mainnet',
  node: VARA_NODE,
  note: 'Phase 2 — super token registry',
};
writeFileSync(DEPLOY_STATE_PATH, JSON.stringify(state, null, 2));
console.log('✓ deploy-state.json updated');

// Update .env
updateEnvFile(ENV_PATH, { STREAM_CORE_ID: programId });
console.log('✓ .env updated');

console.log('\nNext: run wire-superfluid.mjs to wire all contracts together.');
console.log(`New STREAM_CORE_ID: ${programId}`);

await api.disconnect();
process.exit(0);

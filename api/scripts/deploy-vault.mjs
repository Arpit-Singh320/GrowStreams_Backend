// Deploy token-vault to Vara testnet
// Run from api/ directory: node scripts/deploy-vault.mjs
import { GearApi, GearKeyring } from '@gear-js/api';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

config({ path: resolve(PROJECT_ROOT, '.env') });

const VARA_SEED = process.env.VARA_SEED;
const VARA_NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const WASM_PATH = resolve(PROJECT_ROOT, 'artifacts/token_vault.opt.wasm');
const DEPLOY_STATE_PATH = resolve(PROJECT_ROOT, 'deploy-state.json');

function encodeCompactU32(value) {
  if (value < 64) return Buffer.from([value << 2]);
  if (value < 16384) { const v = (value << 2) | 1; return Buffer.from([v & 0xff, (v >> 8) & 0xff]); }
  const v = (value << 2) | 2;
  return Buffer.from([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
}

function encodeSailsInitPayload(constructorName) {
  const nameBytes = Buffer.from(constructorName, 'utf-8');
  return '0x' + Buffer.concat([encodeCompactU32(nameBytes.length), nameBytes]).toString('hex');
}

if (!VARA_SEED || VARA_SEED.includes('word1 word2')) {
  console.error('Error: VARA_SEED not set in .env');
  process.exit(1);
}
if (!existsSync(WASM_PATH)) {
  console.error(`Error: ${WASM_PATH} not found. Build first.`);
  process.exit(1);
}

console.log('=== Deploying token-vault V3 ===');
console.log(`Node: ${VARA_NODE}`);

const api = await GearApi.create({ providerAddress: VARA_NODE });
console.log(`Connected: ${await api.chain()}`);

let keyring;
try { keyring = await GearKeyring.fromMnemonic(VARA_SEED); } catch { keyring = await GearKeyring.fromSuri(VARA_SEED); }
console.log(`Account: ${keyring.address}`);

const accountInfo = await api.query.system.account(keyring.address);
const balance = Number(BigInt(accountInfo.data.free.toString())) / 1e12;
console.log(`Balance: ${balance.toFixed(4)} VARA`);

const code = readFileSync(WASM_PATH);
console.log(`WASM size: ${(code.length / 1024).toFixed(1)} KB`);

const initPayload = encodeSailsInitPayload('New');
console.log(`Init payload: ${initPayload}`);

let gasLimit;
try {
  const gasInfo = await api.program.calculateGas.initUpload(keyring.addressRaw, code, initPayload, 0, true);
  gasLimit = gasInfo.min_limit;
  console.log(`Gas limit: ${gasLimit.toString()}`);
} catch (e) {
  console.log(`Gas calc failed: ${e.message}, using fallback`);
  gasLimit = 500_000_000_000n;
}

const { programId, codeId, extrinsic } = api.program.upload({ code, gasLimit, value: 0, initPayload });
console.log(`Program ID: ${programId}`);

await new Promise((res, rej) => {
  const timeout = setTimeout(() => rej(new Error('Timeout 120s')), 120_000);
  extrinsic.signAndSend(keyring, ({ events = [], status }) => {
    if (status.isInBlock) console.log(`In block: ${status.asInBlock.toHex()}`);
    if (status.isFinalized) {
      clearTimeout(timeout);
      const failed = events.some(({ event }) => api.events.system.ExtrinsicFailed.is(event));
      if (failed) rej(new Error('Extrinsic failed'));
      else res();
    }
  }).catch(e => { clearTimeout(timeout); rej(e); });
});

console.log(`\n✓ token-vault deployed: ${programId}`);

// Update deploy-state.json
const state = existsSync(DEPLOY_STATE_PATH) ? JSON.parse(readFileSync(DEPLOY_STATE_PATH, 'utf-8')) : {};
state['token-vault'] = { programId, codeId, deployedAt: new Date().toISOString(), network: 'vara-testnet', node: VARA_NODE };
writeFileSync(DEPLOY_STATE_PATH, JSON.stringify(state, null, 2));
console.log(`Saved to deploy-state.json`);

await api.disconnect();
process.exit(0);

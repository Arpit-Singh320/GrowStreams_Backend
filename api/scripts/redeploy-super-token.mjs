// Redeploy super-token using sails-js ctors (correct encoding)
// Run from api/ directory: node scripts/redeploy-super-token.mjs

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
const DEPLOY_STATE_PATH = resolve(API_ROOT, 'deploy-state.json');
const ENV_PATH = resolve(API_ROOT, '.env');

const WASM_PATH = resolve(
  PROJECT_ROOT,
  'contracts/target/wasm32v1-none/wasm32-gear/release/super_token.opt.wasm'
);
const IDL_PATH = resolve(PROJECT_ROOT, 'contracts/super-token/super-token.idl');

const GROW_TOKEN_ID = process.env.GROW_TOKEN_ID;

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

if (!VARA_SEED)       { console.error('VARA_SEED not set'); process.exit(1); }
if (!GROW_TOKEN_ID)   { console.error('GROW_TOKEN_ID not set'); process.exit(1); }
if (!existsSync(WASM_PATH)) { console.error(`WASM not found: ${WASM_PATH}`); process.exit(1); }

console.log('=== Redeploying super-token ===');
console.log(`Node:         ${VARA_NODE}`);
console.log(`grow-token:   ${GROW_TOKEN_ID}`);

const api = await GearApi.create({ providerAddress: VARA_NODE });
console.log(`Connected:    ${await api.chain()}`);

let keyring;
try { keyring = await GearKeyring.fromMnemonic(VARA_SEED); }
catch { keyring = await GearKeyring.fromSuri(VARA_SEED); }
console.log(`Account:      ${keyring.address}`);

const accountInfo = await api.query.system.account(keyring.address);
const balance = Number(BigInt(accountInfo.data.free.toString())) / 1e12;
console.log(`Balance:      ${balance.toFixed(4)} VARA`);

const parser = await SailsIdlParser.new();
const idl = readFileSync(IDL_PATH, 'utf-8');
const sails = new Sails(parser);
sails.parseIdl(idl);
sails.setApi(api);

const code = readFileSync(WASM_PATH);
console.log(`WASM:         ${(code.length / 1024).toFixed(1)} KB`);

// Use sails-js ctor for correct encoding:
// New(name: str, symbol: str, decimals: u8, underlying_token: actor_id, is_native_wrapper: bool)
const tx = sails.ctors['New']
  .fromCode(code, 'GrowStreams GROW', 'gGROW', 18, GROW_TOKEN_ID, false)
  .withAccount(keyring, { disableClientAuth: true })
  .withGas(50_000_000_000n);

console.log(`Program ID:   ${tx.programId}`);
console.log('Sending...');

const { blockHash, programId, isFinalized } = await tx.signAndSend();
console.log(`In block:     ${blockHash}`);
await isFinalized;

const SUPER_TOKEN_ID = programId ?? tx.programId;
console.log(`\n✓ super-token deployed: ${SUPER_TOKEN_ID}`);

// Update state
const state = existsSync(DEPLOY_STATE_PATH)
  ? JSON.parse(readFileSync(DEPLOY_STATE_PATH, 'utf-8'))
  : {};

state['super-token'] = {
  programId: SUPER_TOKEN_ID,
  deployedAt: new Date().toISOString(),
  network: 'vara-mainnet',
  node: VARA_NODE,
  underlyingToken: GROW_TOKEN_ID,
  symbol: 'gGROW',
};
writeFileSync(DEPLOY_STATE_PATH, JSON.stringify(state, null, 2));
console.log('✓ deploy-state.json updated');

updateEnvFile(ENV_PATH, { SUPER_TOKEN_ID });
console.log('✓ .env updated');
console.log('\nNext: run wire-superfluid.mjs');

await api.disconnect();
process.exit(0);

// Migrate to buffered super-token + flow-aware stream-core (the gVARA solvency fix)
// =============================================================================
//
// WHY: The previous super-token let a receiver's balance grow without bound
// (deposit 50 gVARA → balance ran past 736 and rising). The new contracts make
// the stream's `deposited` an escrowed buffer that hard-caps receiver accrual,
// so Σ balance_of ≤ total_supply. The super-token's flow interface changed
// (UpdateFlow → StartFlow/SetFlowRate/AddFlowBuffer/StopFlow), so BOTH
// stream-core and the gVARA super-token must be redeployed.
//
// SAFE TO RUN ONLY WHEN: the live gVARA super-token holds balances for the
// deployer/test wallet alone. A fresh deploy starts with empty state — any other
// holder's balance would be stranded in the old contract. This script does NOT
// migrate balances. Confirm sole ownership before running.
//
// SEQUENCE (all signed by VARA_SEED, the admin/deployer):
//   1. Redeploy stream-core                       → new STREAM_CORE_ID
//   2. stream-core.SetTokenVault(TOKEN_VAULT_ID)   (restore lost config)
//   3. Deploy fresh gVARA super-token (wraps wVARA)→ new GVARA_TOKEN_ID
//   4. gVARA.AddFlowController(new stream-core)
//   5. gVARA.AddFlowController(LIQUIDATION_MANAGER_ID)   (if set)
//   6. stream-core.RegisterSuperToken(wVARA → new gVARA)
//   7. liquidation-manager.SetStreamCore(new stream-core) (if set)
//   8. Persist new IDs to .env + deploy-state.json
//
// Run from api/ directory:
//   node scripts/migrate-buffered-streams.mjs            (dry run — prints plan)
//   node scripts/migrate-buffered-streams.mjs --execute  (broadcasts txs)

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

const EXECUTE = process.argv.includes('--execute');

const VARA_SEED = process.env.VARA_SEED;
const VARA_NODE = process.env.VARA_NODE || 'wss://rpc.vara.network';
const ENV_PATH = resolve(API_ROOT, '.env');
const DEPLOY_STATE_PATH = existsSync(resolve(API_ROOT, 'deploy-state.json'))
  ? resolve(API_ROOT, 'deploy-state.json')
  : resolve(PROJECT_ROOT, 'deploy-state.json');

const WVARA_TOKEN_ID         = process.env.WVARA_TOKEN_ID;
const TOKEN_VAULT_ID         = process.env.TOKEN_VAULT_ID;
const LIQUIDATION_MANAGER_ID = process.env.LIQUIDATION_MANAGER_ID;

// Build output moved to wasm32-gear/release with newer sails-rs/cargo;
// fall back to the legacy path if the new one is absent.
function wasmPath(name) {
  const neu = resolve(PROJECT_ROOT, `contracts/target/wasm32-gear/release/${name}.opt.wasm`);
  const old = resolve(PROJECT_ROOT, `contracts/target/wasm32v1-none/wasm32-gear/release/${name}.opt.wasm`);
  return existsSync(neu) ? neu : old;
}

const STREAM_CORE_WASM = wasmPath('stream_core');
const GVARA_WASM       = wasmPath('super_token');

const STREAM_CORE_IDL = resolve(PROJECT_ROOT, 'contracts/stream-core/stream-core.idl');
const SUPER_TOKEN_IDL = resolve(PROJECT_ROOT, 'contracts/super-token/super-token.idl');
const LIQ_IDL         = resolve(PROJECT_ROOT, 'contracts/liquidation-manager/liquidation-manager.idl');

const FIXED_GAS = 50_000_000_000n;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

// --- validation --------------------------------------------------------------
function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }
if (!VARA_SEED || VARA_SEED.includes('word1')) fail('VARA_SEED not set');
if (!WVARA_TOKEN_ID) fail('WVARA_TOKEN_ID not set');
if (!TOKEN_VAULT_ID) fail('TOKEN_VAULT_ID not set (stream-core needs its vault restored)');
if (!existsSync(STREAM_CORE_WASM)) fail(`stream-core WASM missing: ${STREAM_CORE_WASM}\nBuild: (cd contracts/stream-core && cargo build --release)`);
if (!existsSync(GVARA_WASM)) fail(`super-token WASM missing: ${GVARA_WASM}\nBuild: (cd contracts/super-token && cargo build --release)`);

console.log('═══════════════════════════════════════════════════════');
console.log('  Migrate → buffered gVARA streaming (solvency fix)');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Mode:                ${EXECUTE ? 'EXECUTE (broadcasts txs)' : 'DRY RUN (no txs)'}`);
console.log(`  Node:                ${VARA_NODE}`);
console.log(`  wVARA:               ${WVARA_TOKEN_ID}`);
console.log(`  token-vault:         ${TOKEN_VAULT_ID}`);
console.log(`  liquidation-manager: ${LIQUIDATION_MANAGER_ID || '(not set — will skip step 5,7)'}`);
console.log(`  stream-core WASM:    ${STREAM_CORE_WASM}`);
console.log(`  super-token WASM:    ${GVARA_WASM}`);
console.log('───────────────────────────────────────────────────────');

if (!EXECUTE) {
  console.log('Planned steps:');
  console.log('  1. Redeploy stream-core (new ID)');
  console.log('  2. stream-core.SetTokenVault(token-vault)');
  console.log('  3. Deploy fresh gVARA super-token (wraps wVARA, native)');
  console.log('  4. gVARA.AddFlowController(new stream-core)');
  console.log('  5. gVARA.AddFlowController(liquidation-manager)' + (LIQUIDATION_MANAGER_ID ? '' : '  [SKIPPED]'));
  console.log('  6. stream-core.RegisterSuperToken(wVARA → new gVARA)');
  console.log('  7. liquidation-manager.SetStreamCore(new stream-core)' + (LIQUIDATION_MANAGER_ID ? '' : '  [SKIPPED]'));
  console.log('  8. Persist STREAM_CORE_ID + GVARA_TOKEN_ID to .env and deploy-state.json');
  console.log('\nRe-run with --execute to broadcast. Ensure the wallet holds ≥ 8 VARA.');
  process.exit(0);
}

// --- execute -----------------------------------------------------------------
const api = await GearApi.create({ providerAddress: VARA_NODE });
console.log(`Connected: ${await api.chain()}`);

let keyring;
try { keyring = await GearKeyring.fromMnemonic(VARA_SEED); }
catch { keyring = await GearKeyring.fromSuri(VARA_SEED); }
console.log(`Account: ${keyring.address}`);

const accountInfo = await api.query.system.account(keyring.address);
const balance = Number(BigInt(accountInfo.data.free.toString())) / 1e12;
console.log(`Balance: ${balance.toFixed(4)} VARA`);
if (balance < 8) fail('Need at least ~8 VARA to redeploy two contracts and wire them');

const parser = await SailsIdlParser.new();

async function deployContract(name, wasmFile, idlPath, ctorArgs) {
  console.log(`\n── Deploy ${name} ──`);
  const code = readFileSync(wasmFile);
  console.log(`   WASM: ${(code.length / 1024).toFixed(1)} KB`);
  const sails = new Sails(parser);
  sails.parseIdl(readFileSync(idlPath, 'utf-8'));
  sails.setApi(api);

  const tx = sails.ctors['New']
    .fromCode(code, ...ctorArgs)
    .withAccount(keyring, { disableClientAuth: true })
    .withGas(FIXED_GAS);
  console.log(`   Program ID: ${tx.programId}`);

  const { blockHash, programId, isFinalized } = await tx.signAndSend();
  console.log(`   In block: ${blockHash}`);
  await isFinalized;
  const id = programId ?? tx.programId;
  console.log(`   ✓ ${name}: ${id}`);
  return id;
}

async function call(programId, idlPath, service, method, ...args) {
  const sails = new Sails(parser);
  sails.parseIdl(readFileSync(idlPath, 'utf-8'));
  sails.setApi(api);
  sails.setProgramId(programId);
  const camel = method.charAt(0).toLowerCase() + method.slice(1);
  const fn = sails.services[service].functions[method]
    ?? sails.services[service].functions[camel];
  if (!fn) throw new Error(`${service}.${method} not found in ${idlPath}`);
  const tx = fn(...args).withAccount(keyring, { disableClientAuth: true }).withGas(FIXED_GAS);
  const { blockHash, isFinalized } = await tx.signAndSend();
  console.log(`   In block: ${blockHash}`);
  await isFinalized;
}

// 1. Redeploy stream-core (constructor: New())
const STREAM_CORE_ID = await deployContract('stream-core', STREAM_CORE_WASM, STREAM_CORE_IDL, []);
await sleep(5000);

// 2. Restore token vault on the fresh stream-core
console.log('\n── stream-core.SetTokenVault(token-vault) ──');
try { await call(STREAM_CORE_ID, STREAM_CORE_IDL, 'StreamService', 'SetTokenVault', TOKEN_VAULT_ID); console.log('   ✓ vault restored'); }
catch (e) { console.warn(`   ⚠ SetTokenVault failed: ${e.message}`); }
await sleep(4000);

// 3. Deploy fresh gVARA super-token (native wrapper of wVARA/native VARA)
//    Constructor: New(name, symbol, decimals, underlying_token=zero, is_native_wrapper=true)
const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
const GVARA_TOKEN_ID = await deployContract(
  'gVARA super-token', GVARA_WASM, SUPER_TOKEN_IDL,
  ['GrowStreams VARA', 'gVARA', 12, ZERO, true],
);
await sleep(5000);

// 4. gVARA.AddFlowController(new stream-core)
console.log('\n── gVARA.AddFlowController(stream-core) ──');
try { await call(GVARA_TOKEN_ID, SUPER_TOKEN_IDL, 'SuperTokenService', 'AddFlowController', STREAM_CORE_ID); console.log('   ✓'); }
catch (e) { console.warn(`   ⚠ failed: ${e.message}`); }
await sleep(4000);

// 5. gVARA.AddFlowController(liquidation-manager)
if (LIQUIDATION_MANAGER_ID) {
  console.log('\n── gVARA.AddFlowController(liquidation-manager) ──');
  try { await call(GVARA_TOKEN_ID, SUPER_TOKEN_IDL, 'SuperTokenService', 'AddFlowController', LIQUIDATION_MANAGER_ID); console.log('   ✓'); }
  catch (e) { console.warn(`   ⚠ failed: ${e.message}`); }
  await sleep(4000);
}

// 6. stream-core.RegisterSuperToken(wVARA → new gVARA)
console.log('\n── stream-core.RegisterSuperToken(wVARA → gVARA) ──');
try { await call(STREAM_CORE_ID, STREAM_CORE_IDL, 'StreamService', 'RegisterSuperToken', WVARA_TOKEN_ID, GVARA_TOKEN_ID); console.log('   ✓'); }
catch (e) { console.warn(`   ⚠ failed: ${e.message}`); }
await sleep(4000);

// 7. liquidation-manager.SetStreamCore(new stream-core)
if (LIQUIDATION_MANAGER_ID) {
  console.log('\n── liquidation-manager.SetStreamCore(stream-core) ──');
  try { await call(LIQUIDATION_MANAGER_ID, LIQ_IDL, 'LiquidationService', 'SetStreamCore', STREAM_CORE_ID); console.log('   ✓'); }
  catch (e) { console.warn(`   ⚠ failed: ${e.message}`); }
}

// 8. Persist
const state = existsSync(DEPLOY_STATE_PATH) ? JSON.parse(readFileSync(DEPLOY_STATE_PATH, 'utf-8')) : {};
const now = new Date().toISOString();
state['stream-core'] = { ...(state['stream-core'] || {}), programId: STREAM_CORE_ID, deployedAt: now, network: 'vara-mainnet', node: VARA_NODE, note: 'Buffered flow-aware redeploy (solvency fix)' };
state['gvara-token'] = { ...(state['gvara-token'] || {}), programId: GVARA_TOKEN_ID, deployedAt: now, network: 'vara-mainnet', node: VARA_NODE, underlyingToken: WVARA_TOKEN_ID, symbol: 'gVARA', note: 'Buffered accrual (caps receiver at deposited)' };
writeFileSync(DEPLOY_STATE_PATH, JSON.stringify(state, null, 2));
console.log('\n✓ deploy-state.json updated');

updateEnvFile(ENV_PATH, { STREAM_CORE_ID, GVARA_TOKEN_ID });
console.log('✓ .env updated (STREAM_CORE_ID, GVARA_TOKEN_ID)');

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Migration complete');
console.log(`  stream-core: ${STREAM_CORE_ID}`);
console.log(`  gVARA:       ${GVARA_TOKEN_ID}`);
console.log('  Next: restart the API so it picks up the new IDs, then');
console.log('  re-wrap test VARA and verify a 50 gVARA stream caps at 50.');
console.log('═══════════════════════════════════════════════════════');

await api.disconnect();
process.exit(0);

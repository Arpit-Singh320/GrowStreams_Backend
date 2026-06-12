// Wire Superfluid contracts — run AFTER deploy-superfluid.mjs
// Reads IDs from deploy-state.json and .env, then sends 4 wiring transactions.
//
// Run from api/ directory: node scripts/wire-superfluid.mjs

import { GearApi, GearKeyring } from '@gear-js/api';
import { Sails } from 'sails-js';
import { SailsIdlParser } from 'sails-js-parser';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(__dirname, '../..');

config({ path: resolve(API_ROOT, '.env') });

const VARA_SEED = process.env.VARA_SEED;
const VARA_NODE = process.env.VARA_NODE || 'wss://rpc.vara.network';

const STREAM_CORE_ID       = process.env.STREAM_CORE_ID;
const GROW_TOKEN_ID        = process.env.GROW_TOKEN_ID;
const SUPER_TOKEN_ID       = process.env.SUPER_TOKEN_ID;
const DISTRIBUTION_POOL_ID = process.env.DISTRIBUTION_POOL_ID;
const LIQUIDATION_MANAGER_ID = process.env.LIQUIDATION_MANAGER_ID;

const IDL_PATHS = {
  'super-token':         resolve(PROJECT_ROOT, 'contracts/super-token/super-token.idl'),
  'stream-core':         resolve(PROJECT_ROOT, 'contracts/stream-core/stream-core.idl'),
  'liquidation-manager': resolve(PROJECT_ROOT, 'contracts/liquidation-manager/liquidation-manager.idl'),
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sailsCall(api, keyring, parser, idlPath, programId, service, method, ...args) {
  const idl = readFileSync(idlPath, 'utf-8');
  const sails = new Sails(parser);
  sails.parseIdl(idl);
  sails.setApi(api);
  sails.setProgramId(programId);

  // sails-js stores functions with camelCase keys (e.g. AddFlowController → addFlowController)
  const camel = method.charAt(0).toLowerCase() + method.slice(1);
  const fn = sails.services[service].functions[method]
    ?? sails.services[service].functions[camel];
  if (!fn) {
    const available = Object.keys(sails.services[service]?.functions || {});
    throw new Error(`${service}.${method} not found in IDL. Available: ${available.join(', ')}`);
  }

  // Force fixed gas — skip calculateGas RPC which fails on newly deployed programs
  const tx = fn(...args)
    .withAccount(keyring, { disableClientAuth: true })
    .withGas(50_000_000_000n);

  // sails-js signAndSend() returns a promise that resolves at inBlock
  const { blockHash, isFinalized } = await tx.signAndSend();
  console.log(`   In block: ${blockHash}`);
  await isFinalized;
}

// Validate
if (!VARA_SEED)               { console.error('VARA_SEED not set'); process.exit(1); }
if (!STREAM_CORE_ID)          { console.error('STREAM_CORE_ID not set'); process.exit(1); }
if (!GROW_TOKEN_ID)           { console.error('GROW_TOKEN_ID not set'); process.exit(1); }
if (!SUPER_TOKEN_ID)          { console.error('SUPER_TOKEN_ID not set — run deploy-superfluid.mjs first'); process.exit(1); }
if (!LIQUIDATION_MANAGER_ID)  { console.error('LIQUIDATION_MANAGER_ID not set — run deploy-superfluid.mjs first'); process.exit(1); }

console.log('=== GrowStreams Superfluid Wiring ===');
console.log(`Node:                ${VARA_NODE}`);
console.log(`stream-core:         ${STREAM_CORE_ID}`);
console.log(`grow-token:          ${GROW_TOKEN_ID}`);
console.log(`super-token:         ${SUPER_TOKEN_ID}`);
console.log(`distribution-pool:   ${DISTRIBUTION_POOL_ID}`);
console.log(`liquidation-manager: ${LIQUIDATION_MANAGER_ID}`);

const api = await GearApi.create({ providerAddress: VARA_NODE });
console.log(`Connected: ${await api.chain()}`);

let keyring;
try { keyring = await GearKeyring.fromMnemonic(VARA_SEED); }
catch { keyring = await GearKeyring.fromSuri(VARA_SEED); }
console.log(`Account: ${keyring.address}`);

const parser = await SailsIdlParser.new();

// 1. super-token.AddFlowController(stream_core)
console.log('\n── 1/4  super-token.AddFlowController(stream_core) ──');
try {
  await sailsCall(api, keyring, parser,
    IDL_PATHS['super-token'], SUPER_TOKEN_ID,
    'SuperTokenService', 'AddFlowController', STREAM_CORE_ID);
  console.log('   ✓ done');
} catch (err) { console.error(`   ✗`, err?.message ?? err); }
await sleep(4000);

// 2. super-token.AddFlowController(liquidation_manager)
console.log('\n── 2/4  super-token.AddFlowController(liquidation_manager) ──');
try {
  await sailsCall(api, keyring, parser,
    IDL_PATHS['super-token'], SUPER_TOKEN_ID,
    'SuperTokenService', 'AddFlowController', LIQUIDATION_MANAGER_ID);
  console.log('   ✓ done');
} catch (err) { console.error(`   ✗`, err?.message ?? err); }
await sleep(4000);

// 3. stream-core.RegisterSuperToken(grow_token, super_token)
console.log('\n── 3/4  stream-core.RegisterSuperToken(grow_token → super_token) ──');
try {
  await sailsCall(api, keyring, parser,
    IDL_PATHS['stream-core'], STREAM_CORE_ID,
    'StreamService', 'RegisterSuperToken', GROW_TOKEN_ID, SUPER_TOKEN_ID);
  console.log('   ✓ done');
} catch (err) { console.error(`   ✗`, err?.message ?? err); }
await sleep(4000);

// 4. liquidation-manager.SetStreamCore(stream_core)
console.log('\n── 4/4  liquidation-manager.SetStreamCore(stream_core) ──');
try {
  await sailsCall(api, keyring, parser,
    IDL_PATHS['liquidation-manager'], LIQUIDATION_MANAGER_ID,
    'LiquidationService', 'SetStreamCore', STREAM_CORE_ID);
  console.log('   ✓ done');
} catch (err) { console.error(`   ✗`, err?.message ?? err); }

console.log('\n═══════════════════════════════════════════════');
console.log('  Wiring complete.');
console.log('  Verify on-chain:');
console.log(`    GET /api/solvency/config`);
console.log(`    GET /api/streams/super-token/${GROW_TOKEN_ID}`);
console.log('═══════════════════════════════════════════════');

await api.disconnect();
process.exit(0);

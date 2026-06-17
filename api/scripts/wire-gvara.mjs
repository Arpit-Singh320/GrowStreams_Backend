// Wire gVARA: AddFlowController + RegisterSuperToken
// Run from api/ directory: node scripts/wire-gvara.mjs

import { GearApi, GearKeyring } from '@gear-js/api';
import { Sails } from 'sails-js';
import { SailsIdlParser } from 'sails-js-parser';
import { readFileSync } from 'fs';
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
const GVARA_TOKEN_ID = process.env.GVARA_TOKEN_ID;

const SUPER_TOKEN_IDL = resolve(PROJECT_ROOT, 'contracts/super-token/super-token.idl');
const STREAM_CORE_IDL = resolve(PROJECT_ROOT, 'contracts/stream-core/stream-core.idl');
const FIXED_GAS = 50_000_000_000n;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

if (!VARA_SEED) { console.error('VARA_SEED not set'); process.exit(1); }
if (!GVARA_TOKEN_ID) { console.error('GVARA_TOKEN_ID not set in .env'); process.exit(1); }
if (!STREAM_CORE_ID) { console.error('STREAM_CORE_ID not set in .env'); process.exit(1); }
if (!WVARA_TOKEN_ID) { console.error('WVARA_TOKEN_ID not set in .env'); process.exit(1); }

console.log('=== Wire gVARA ===');
console.log(`gVARA:       ${GVARA_TOKEN_ID}`);
console.log(`wVARA:       ${WVARA_TOKEN_ID}`);
console.log(`stream-core: ${STREAM_CORE_ID}`);

const api = await GearApi.create({ providerAddress: VARA_NODE });
console.log(`Connected:   ${await api.chain()}`);

let keyring;
try { keyring = await GearKeyring.fromMnemonic(VARA_SEED); }
catch { keyring = await GearKeyring.fromSuri(VARA_SEED); }
console.log(`Account:     ${keyring.address}`);

const parser = await SailsIdlParser.new();

async function sailsCall(programId, idlPath, service, method, ...args) {
  const idl = readFileSync(idlPath, 'utf-8');
  const sails = new Sails(parser);
  sails.parseIdl(idl);
  sails.setApi(api);
  sails.setProgramId(programId);

  const camel = method.charAt(0).toLowerCase() + method.slice(1);
  const fn = sails.services[service].functions[method]
    ?? sails.services[service].functions[camel];
  if (!fn) throw new Error(`${service}.${method} not found`);

  const tx = fn(...args)
    .withAccount(keyring, { disableClientAuth: true })
    .withGas(FIXED_GAS);

  const { blockHash, isFinalized } = await tx.signAndSend();
  console.log(`   In block: ${blockHash}`);
  await isFinalized;
}

// 1. gVARA.AddFlowController(stream_core)
console.log('\n── gVARA.AddFlowController(stream_core) ──');
try {
  await sailsCall(GVARA_TOKEN_ID, SUPER_TOKEN_IDL, 'SuperTokenService', 'AddFlowController', STREAM_CORE_ID);
  console.log('   ✓ stream-core added as flow controller on gVARA');
} catch (err) {
  console.warn(`   ⚠ AddFlowController failed: ${err.message}`);
}

await sleep(5000);

// 2. stream-core.RegisterSuperToken(wVARA, gVARA)
console.log('\n── stream-core.RegisterSuperToken(wVARA, gVARA) ──');
try {
  await sailsCall(STREAM_CORE_ID, STREAM_CORE_IDL, 'StreamService', 'RegisterSuperToken', WVARA_TOKEN_ID, GVARA_TOKEN_ID);
  console.log('   ✓ wVARA → gVARA registered in stream-core');
} catch (err) {
  console.warn(`   ⚠ RegisterSuperToken failed: ${err.message}`);
}

console.log('\n✓ gVARA wiring complete');
await api.disconnect();
process.exit(0);

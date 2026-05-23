/**
 * GrowStreams — Deploy wVARA (Wrapped VARA VFT) to Vara Mainnet
 *
 * Usage:
 *   node scripts/deploy-js/deploy-wvara.mjs
 *
 * After deploying, this script:
 *   1. Deploys the wvara.opt.wasm contract
 *   2. Saves the program ID to deploy-state.json as "wvara"
 *   3. Prints the env var to add to Railway
 */

import { GearApi, GearKeyring } from '@gear-js/api';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

config({ path: resolve(PROJECT_ROOT, 'api/.env') });

const VARA_SEED = process.env.VARA_SEED;
const VARA_NODE = process.env.VARA_NODE || 'wss://rpc.vara.network';

if (!VARA_SEED) {
  console.error('❌ VARA_SEED not set in api/.env');
  process.exit(1);
}

const DEPLOY_STATE_PATH = resolve(PROJECT_ROOT, 'deploy-state.json');
const WASM_PATH = resolve(PROJECT_ROOT, 'artifacts', 'wvara.opt.wasm');

// ─── SCALE helpers ──────────────────────────────────────────────────────────

function encodeCompactU32(value) {
  if (value < 64) return Buffer.from([value << 2]);
  if (value < 16384) {
    const v = (value << 2) | 1;
    return Buffer.from([v & 0xff, (v >> 8) & 0xff]);
  }
  if (value < 1073741824) {
    const v = (value << 2) | 2;
    return Buffer.from([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
  }
  throw new Error('Value too large');
}

function encodeString(str) {
  const bytes = Buffer.from(str, 'utf-8');
  const lenPrefix = encodeCompactU32(bytes.length);
  return Buffer.concat([lenPrefix, bytes]).toString('hex');
}

function encodeSailsInitPayload(constructorName) {
  const nameBytes = Buffer.from(constructorName, 'utf-8');
  const lenPrefix = encodeCompactU32(nameBytes.length);
  const payload = Buffer.concat([lenPrefix, nameBytes]);
  return '0x' + payload.toString('hex');
}

// ─── Deploy ─────────────────────────────────────────────────────────────────

async function deploy(api, account, wasmPath, initPayload) {
  if (!existsSync(wasmPath)) throw new Error(`WASM not found: ${wasmPath}`);
  const code = readFileSync(wasmPath);
  console.log(`   Size: ${(code.length / 1024).toFixed(1)} KB`);

  const gasLimit = 50_000_000_000n;

  const { programId, codeId, extrinsic } = api.program.upload({
    code,
    initPayload,
    gasLimit,
    value: 0,
  });

  console.log(`   Program ID: ${programId}`);
  console.log(`   Code ID:    ${codeId}`);

  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; reject(new Error('Timeout after 180s')); }
    }, 180_000);

    extrinsic.signAndSend(account, ({ events = [], status }) => {
      if (status.isInBlock) console.log(`   📦 In block: ${status.asInBlock.toHex()}`);
      if (status.isFinalized) {
        console.log(`   ✅ Finalized: ${status.asFinalized.toHex()}`);
        clearTimeout(timeout);
        let failed = false;
        events.forEach(({ event }) => {
          if (api.events.system.ExtrinsicFailed.is(event)) {
            const [dispatchError] = event.data;
            let info;
            if (dispatchError.isModule) {
              const decoded = api.registry.findMetaError(dispatchError.asModule);
              info = `${decoded.section}.${decoded.name}`;
            } else {
              info = dispatchError.toString();
            }
            console.error(`   ❌ Failed: ${info}`);
            failed = true;
            if (!resolved) { resolved = true; reject(new Error(info)); }
          }
        });
        if (!failed && !resolved) { resolved = true; resolve({ programId, codeId }); }
      }
    }).catch(err => { clearTimeout(timeout); if (!resolved) { resolved = true; reject(err); } });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const isMainnet = VARA_NODE.includes('rpc.vara.network');

  console.log('╔════════════════════════════════════════════╗');
  console.log('║   GrowStreams — Deploy wVARA to Mainnet   ║');
  console.log('╚════════════════════════════════════════════╝\n');
  console.log(`🌐 Node:    ${VARA_NODE}`);
  console.log(`🎯 Network: ${isMainnet ? 'MAINNET' : 'TESTNET'}`);

  let keyring;
  try {
    keyring = await GearKeyring.fromMnemonic(VARA_SEED);
  } catch {
    keyring = await GearKeyring.fromSuri(VARA_SEED);
  }
  console.log(`👤 Account: ${keyring.address}\n`);

  const api = await GearApi.create({ providerAddress: VARA_NODE });
  await api.chain();

  // Balance check
  const accountInfo = await api.query.system.account(keyring.address);
  const free = Number(BigInt(accountInfo.data.free.toString())) / 1e12;
  console.log(`💰 Balance: ${free.toFixed(4)} VARA\n`);
  if (free < 10) {
    console.error('❌ Need at least 10 VARA');
    process.exit(1);
  }

  const initPayload = encodeSailsInitPayload('New');
  console.log(`🚀 Deploying wVARA...`);
  console.log(`   WASM: ${WASM_PATH}`);

  const result = await deploy(api, keyring, WASM_PATH, initPayload);

  // Save to deploy-state.json
  let state = {};
  if (existsSync(DEPLOY_STATE_PATH)) {
    state = JSON.parse(readFileSync(DEPLOY_STATE_PATH, 'utf-8'));
  }
  state['wvara'] = {
    programId: result.programId,
    codeId: result.codeId,
    deployedAt: new Date().toISOString(),
    network: isMainnet ? 'vara-mainnet' : 'vara-testnet',
    node: VARA_NODE,
  };
  writeFileSync(DEPLOY_STATE_PATH, JSON.stringify(state, null, 2));
  console.log('\n💾 Saved to deploy-state.json');

  // Final balance
  const finalInfo = await api.query.system.account(keyring.address);
  const finalBal = Number(BigInt(finalInfo.data.free.toString())) / 1e12;
  console.log(`💰 Final balance: ${finalBal.toFixed(4)} VARA`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   DEPLOYMENT COMPLETE                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n✅ wVARA Program ID: ${result.programId}`);
  console.log('\n📋 Add to Railway env vars:');
  console.log(`WVARA_TOKEN_ID=${result.programId}`);
  console.log('\n🔍 Verify on explorer:');
  console.log(`   https://idea.gear-tech.io/programs/${result.programId}?node=wss%3A%2F%2Frpc.vara.network`);

  await api.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});

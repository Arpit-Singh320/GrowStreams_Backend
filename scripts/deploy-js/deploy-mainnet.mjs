/**
 * GrowStreams — Deploy ALL contracts to Vara Mainnet
 *
 * Usage:
 *   node scripts/deploy-js/deploy-mainnet.mjs [contract-name]
 *
 * Examples:
 *   node scripts/deploy-js/deploy-mainnet.mjs          # deploy all 8 contracts
 *   node scripts/deploy-js/deploy-mainnet.mjs quest-seeds   # deploy single contract
 *
 * Prerequisites:
 *   - api/.env must have VARA_SEED with mainnet-funded wallet (1500+ VARA)
 *   - artifacts/ folder must contain all .opt.wasm files (run cargo build first)
 *   - VARA_NODE must be set to wss://rpc.vara.network (or defaults to it)
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

if (!VARA_SEED || VARA_SEED.includes('word1 word2') || VARA_SEED.includes('<your')) {
  console.error('❌ VARA_SEED not set in api/.env');
  process.exit(1);
}

// ─── Artifacts (all 8 contracts) ─────────────────────────────────────────────
const ARTIFACTS_DIR = resolve(PROJECT_ROOT, 'artifacts');

const CONTRACTS = {
  'permission-manager': { wasm: 'permission_manager.opt.wasm', constructor: 'New', args: 'none' },
  'identity-registry':  { wasm: 'identity_registry.opt.wasm',  constructor: 'New', args: 'none' },
  'grow-token':         { wasm: 'grow_token.opt.wasm',         constructor: 'New', args: 'grow-token' },
  'quest-seeds':        { wasm: 'quest_seeds.opt.wasm',        constructor: 'New', args: 'quest-seeds' },
  'token-vault':        { wasm: 'token_vault.opt.wasm',        constructor: 'New', args: 'none' },
  'stream-core':        { wasm: 'stream_core.opt.wasm',        constructor: 'New', args: 'none' },
  'splits-router':      { wasm: 'splits_router.opt.wasm',      constructor: 'New', args: 'none' },
  'bounty-adapter':     { wasm: 'bounty_adapter.opt.wasm',     constructor: 'New', args: 'none' },
};

const DEPLOY_STATE_PATH = resolve(PROJECT_ROOT, 'deploy-state.json');

// ─── SCALE encoding helpers ──────────────────────────────────────────────────

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
  throw new Error('Value too large for compact encoding');
}

function encodeString(str) {
  const bytes = Buffer.from(str, 'utf-8');
  const lenPrefix = encodeCompactU32(bytes.length);
  return Buffer.concat([lenPrefix, bytes]).toString('hex');
}

function encodeU8(value) {
  return Buffer.from([value]).toString('hex');
}

function encodeSailsInitPayload(constructorName, argsHex = '') {
  const nameBytes = Buffer.from(constructorName, 'utf-8');
  const lenPrefix = encodeCompactU32(nameBytes.length);
  const payload = Buffer.concat([lenPrefix, nameBytes, Buffer.from(argsHex, 'hex')]);
  return '0x' + payload.toString('hex');
}

function buildInitPayload(contract, adminHex) {
  const { constructor, args } = contract;

  if (args === 'none') {
    return encodeSailsInitPayload(constructor, '');
  }

  if (args === 'quest-seeds') {
    // Constructor: New(name: String, symbol: String, decimals: u8, admin: ActorId)
    const argsHex = encodeString('Seeds') + encodeString('SEEDS') + encodeU8(0) + adminHex;
    return encodeSailsInitPayload(constructor, argsHex);
  }

  if (args === 'grow-token') {
    // Constructor: New(name: String, symbol: String, decimals: u8, admin: ActorId)
    const argsHex = encodeString('GrowStreams Token') + encodeString('GROW') + encodeU8(18) + adminHex;
    return encodeSailsInitPayload(constructor, argsHex);
  }

  return encodeSailsInitPayload(constructor, '');
}

// ─── Deploy logic ────────────────────────────────────────────────────────────

function loadDeployState() {
  if (existsSync(DEPLOY_STATE_PATH)) {
    return JSON.parse(readFileSync(DEPLOY_STATE_PATH, 'utf-8'));
  }
  return {};
}

function saveDeployState(state) {
  writeFileSync(DEPLOY_STATE_PATH, JSON.stringify(state, null, 2));
}

async function deployContract(api, account, name, wasmPath, initPayload) {
  console.log(`\n🚀 Deploying ${name}...`);
  console.log(`   WASM: ${wasmPath}`);
  console.log(`   Init: ${initPayload.slice(0, 60)}...`);

  if (!existsSync(wasmPath)) {
    throw new Error(`WASM not found: ${wasmPath}`);
  }

  const code = readFileSync(wasmPath);
  console.log(`   Size: ${(code.length / 1024).toFixed(1)} KB`);

  // Use fixed gas limit — gas calc RPC sends entire WASM binary over WebSocket
  // which exceeds mainnet RPC message size limits and causes disconnection.
  // 50B gas is generous for all contracts (typical init needs ~2-5B).
  const gasLimit = 50_000_000_000n;
  console.log(`   Gas limit: ${gasLimit.toString()} (fixed)`);

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
      if (!resolved) {
        resolved = true;
        reject(new Error('Deployment timed out after 180 seconds'));
      }
    }, 180_000);

    extrinsic.signAndSend(account, ({ events = [], status }) => {
      if (status.isInBlock) {
        console.log(`   📦 In block: ${status.asInBlock.toHex()}`);
      }

      if (status.isFinalized) {
        console.log(`   ✅ Finalized: ${status.asFinalized.toHex()}`);
        clearTimeout(timeout);

        let failed = false;
        events.forEach(({ event }) => {
          if (api.events.system.ExtrinsicFailed.is(event)) {
            const [dispatchError] = event.data;
            let errorInfo;
            if (dispatchError.isModule) {
              const decoded = api.registry.findMetaError(dispatchError.asModule);
              errorInfo = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
            } else {
              errorInfo = dispatchError.toString();
            }
            console.error(`   ❌ Extrinsic failed: ${errorInfo}`);
            failed = true;
            if (!resolved) {
              resolved = true;
              reject(new Error(errorInfo));
            }
          }
        });

        if (!failed && !resolved) {
          resolved = true;
          resolve({ programId, codeId });
        }
      }
    }).catch((err) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const target = process.argv[2] || 'all';
  const validTargets = ['all', ...Object.keys(CONTRACTS)];

  if (!validTargets.includes(target)) {
    console.error(`Unknown target: ${target}`);
    console.error(`Usage: node deploy-mainnet.mjs [${validTargets.join('|')}]`);
    process.exit(1);
  }

  const isMainnet = VARA_NODE.includes('rpc.vara.network');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║    GrowStreams — Vara Mainnet Contract Deployment         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`🌐 Node:    ${VARA_NODE}`);
  console.log(`🎯 Network: ${isMainnet ? 'MAINNET' : 'TESTNET'}`);
  console.log(`📦 Target:  ${target}`);
  console.log('');

  if (!isMainnet) {
    console.warn('⚠️  WARNING: VARA_NODE is not mainnet (wss://rpc.vara.network).');
    console.warn('   Set VARA_NODE=wss://rpc.vara.network in api/.env for mainnet deploy.\n');
  }

  // Keyring (once)
  let keyring;
  try {
    keyring = await GearKeyring.fromMnemonic(VARA_SEED);
  } catch {
    keyring = await GearKeyring.fromSuri(VARA_SEED);
  }

  const address = keyring.address;
  const adminHex = Buffer.from(keyring.addressRaw).toString('hex');
  console.log(`👤 Account: ${address}`);
  console.log(`🔑 Admin:   0x${adminHex}\n`);

  // Helper: create fresh API connection
  async function connect() {
    const api = await GearApi.create({ providerAddress: VARA_NODE });
    await api.chain();
    return api;
  }

  // Initial balance check
  {
    const api = await connect();
    const accountInfo = await api.query.system.account(address);
    const free = accountInfo.data.free;
    const balanceVara = Number(BigInt(free.toString())) / 1e12;
    console.log(`💰 Balance: ${balanceVara.toFixed(4)} VARA\n`);
    if (balanceVara < 100) {
      console.error('❌ Insufficient balance! Need at least 100 VARA for deployment.');
      process.exit(1);
    }
    await api.disconnect();
  }

  // Deploy each contract with a FRESH connection
  const state = loadDeployState();
  const contractNames = target === 'all' ? Object.keys(CONTRACTS) : [target];

  let successCount = 0;
  let failCount = 0;

  for (const name of contractNames) {
    const contract = CONTRACTS[name];
    const wasmPath = resolve(ARTIFACTS_DIR, contract.wasm);
    const initPayload = buildInitPayload(contract, adminHex);

    let api;
    try {
      console.log(`\n   Connecting for ${name}...`);
      api = await connect();

      const result = await deployContract(api, keyring, name, wasmPath, initPayload);
      if (result) {
        state[name] = {
          programId: result.programId,
          codeId: result.codeId,
          deployedAt: new Date().toISOString(),
          network: isMainnet ? 'vara-mainnet' : 'vara-testnet',
          node: VARA_NODE,
        };
        saveDeployState(state);
        console.log(`   💾 Saved to deploy-state.json`);
        successCount++;
      }
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
      failCount++;
    } finally {
      if (api) {
        try { await api.disconnect(); } catch {}
      }
    }

    // Small delay between deploys to avoid rate limiting
    if (contractNames.indexOf(name) < contractNames.length - 1) {
      console.log('   ⏳ Waiting 5s before next deploy...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`   Deployment Summary: ${successCount} succeeded, ${failCount} failed`);
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Deployed Program IDs:');
  for (const name of Object.keys(CONTRACTS)) {
    if (state[name]) {
      console.log(`  ${name.padEnd(22)} ${state[name].programId}`);
    }
  }

  // Generate env vars snippet
  console.log('\n📋 Copy these to Railway env vars:\n');
  console.log(`VARA_NODE=${VARA_NODE}`);
  if (state['stream-core']) console.log(`STREAM_CORE_ID=${state['stream-core'].programId}`);
  if (state['token-vault']) console.log(`TOKEN_VAULT_ID=${state['token-vault'].programId}`);
  if (state['splits-router']) console.log(`SPLITS_ROUTER_ID=${state['splits-router'].programId}`);
  if (state['permission-manager']) console.log(`PERMISSION_MANAGER_ID=${state['permission-manager'].programId}`);
  if (state['bounty-adapter']) console.log(`BOUNTY_ADAPTER_ID=${state['bounty-adapter'].programId}`);
  if (state['identity-registry']) console.log(`IDENTITY_REGISTRY_ID=${state['identity-registry'].programId}`);
  if (state['grow-token']) console.log(`GROW_TOKEN_ID=${state['grow-token'].programId}`);
  if (state['quest-seeds']) console.log(`QUEST_SEEDS_ID=${state['quest-seeds'].programId}`);

  console.log('\n📌 Verify on explorer:');
  if (isMainnet) {
    console.log('   https://vara.subscan.io/');
    console.log('   https://idea.gear-tech.io/programs?node=wss%3A%2F%2Frpc.vara.network');
  } else {
    console.log('   https://idea.gear-tech.io/programs?node=wss%3A%2F%2Ftestnet.vara.network');
  }

  // Final balance
  {
    const api = await connect();
    const finalInfo = await api.query.system.account(address);
    const finalBalance = Number(BigInt(finalInfo.data.free.toString())) / 1e12;
    console.log(`\n💰 Final balance: ${finalBalance.toFixed(4)} VARA`);
    await api.disconnect();
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

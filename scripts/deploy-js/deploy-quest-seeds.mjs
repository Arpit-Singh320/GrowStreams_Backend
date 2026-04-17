import { GearApi, GearKeyring } from '@gear-js/api';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

config({ path: resolve(PROJECT_ROOT, 'api/.env') });

const VARA_SEED = process.env.VARA_SEED;
const VARA_NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';

if (!VARA_SEED || VARA_SEED.includes('word1 word2') || VARA_SEED.includes('<your')) {
  console.error('❌ Error: VARA_SEED not set in api/.env');
  console.error('   Set your 12-word mnemonic seed phrase to deploy contracts.');
  process.exit(1);
}

// Encode a Sails constructor init payload
function encodeSailsInitPayload(constructorName, argsHex) {
  const nameBytes = Buffer.from(constructorName, 'utf-8');
  const lenPrefix = encodeCompactU32(nameBytes.length);
  const payload = Buffer.concat([lenPrefix, nameBytes, Buffer.from(argsHex, 'hex')]);
  return '0x' + payload.toString('hex');
}

function encodeCompactU32(value) {
  if (value < 64) {
    return Buffer.from([value << 2]);
  } else if (value < 16384) {
    const v = (value << 2) | 1;
    return Buffer.from([v & 0xff, (v >> 8) & 0xff]);
  } else if (value < 1073741824) {
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

const DEPLOY_STATE_PATH = resolve(PROJECT_ROOT, 'deploy-state.json');

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
  console.log(`   Init payload: ${initPayload.slice(0, 60)}...`);

  const code = readFileSync(wasmPath);
  const gas = await api.program.calculateGas.initUpload(
    account.decodedAddress,
    code,
    initPayload,
    0,
    true
  );

  console.log(`   Gas limit: ${gas.min_limit.toString()}`);

  const { programId, codeId, salt, extrinsic } = api.program.upload({
    code,
    initPayload,
    gasLimit: gas.min_limit,
  });

  await new Promise((resolve, reject) => {
    extrinsic.signAndSend(account, ({ events, status }) => {
      console.log(`   Status: ${status.type}`);
      if (status.isFinalized) {
        events.forEach(({ event }) => {
          if (event.method === 'ExtrinsicFailed') {
            reject(new Error('Extrinsic failed'));
          }
        });
        console.log(`   ✅ Deployed: ${programId}`);
        console.log(`   Code ID: ${codeId}`);
        resolve();
      }
    });
  });

  return { programId, codeId };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       GrowStreams Quest-Seeds Contract Deployment         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`🌐 Connecting to ${VARA_NODE}...`);
  const api = await GearApi.create({ providerAddress: VARA_NODE });
  const chain = await api.chain();
  console.log(`✅ Connected to ${chain}\n`);

  let keyring;
  try {
    keyring = await GearKeyring.fromMnemonic(VARA_SEED);
  } catch {
    keyring = await GearKeyring.fromSuri(VARA_SEED);
  }

  console.log(`👤 Deploying from: ${keyring.address}`);
  const balance = await api.balance.findOut(keyring.address);
  console.log(`💰 Balance: ${balance.toString()}\n`);

  const wasmPath = resolve(PROJECT_ROOT, 'contracts/target/wasm32-unknown-unknown/release/quest_seeds.opt.wasm');
  
  if (!existsSync(wasmPath)) {
    console.error(`❌ WASM not found: ${wasmPath}`);
    console.error('   Run: cd contracts && cargo build --release -p quest-seeds');
    process.exit(1);
  }

  // Constructor: New(name: String, symbol: String, decimals: u8, admin: ActorId)
  const name = 'Seeds';
  const symbol = 'SEEDS';
  const decimals = 0;
  const admin = keyring.decodedAddress;

  const argsHex = 
    encodeString(name) +
    encodeString(symbol) +
    encodeU8(decimals) +
    admin;

  const initPayload = encodeSailsInitPayload('New', argsHex);

  const { programId, codeId } = await deployContract(
    api,
    keyring,
    'quest-seeds',
    wasmPath,
    initPayload
  );

  const deployState = loadDeployState();
  deployState['quest-seeds'] = {
    programId,
    codeId,
    deployedAt: new Date().toISOString(),
    network: 'vara-testnet',
    node: VARA_NODE,
  };
  saveDeployState(deployState);

  console.log('\n✅ Deployment complete!');
  console.log(`\n📝 Update your api/.env with:`);
  console.log(`   QUEST_SEEDS_ID=${programId}`);
  console.log(`\n📄 deploy-state.json updated.\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Deployment failed:', err);
  process.exit(1);
});

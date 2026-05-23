import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

console.log('=== On-Chain Mint Test ===\n');

// Step 1: Connect to Vara
console.log('1. Connecting to Vara node:', process.env.VARA_NODE);
const { connect, getContract, getKeyring, getApi, command } = await import('./src/sails-client.mjs');

let connected = false;
try {
  await connect();
  connected = true;
  console.log('   ✅ Connected to Vara');
} catch (err) {
  console.error('   ❌ Connection failed:', err.message);
  process.exit(1);
}

// Step 2: Check keyring
const keyring = getKeyring();
if (!keyring) {
  console.error('   ❌ No keyring — VARA_SEED not set');
  process.exit(1);
}
console.log('2. Relayer wallet:', keyring.address);

// Step 3: Check relayer VARA balance
const api = getApi();
try {
  const { data: { free } } = await api.query.system.account(keyring.address);
  const vara = (BigInt(free.toString()) / BigInt(1e12)).toString();
  console.log(`3. Relayer balance: ${vara} VARA`);
  if (BigInt(free.toString()) < BigInt(1e12)) {
    console.error('   ❌ Balance too low — need at least 1 VARA');
    process.exit(1);
  }
  console.log('   ✅ Balance OK');
} catch (err) {
  console.error('   ❌ Balance check failed:', err.message);
  process.exit(1);
}

// Step 4: Check questSeeds contract loaded
const seedsContract = getContract('questSeeds');
if (!seedsContract) {
  console.error('4. ❌ questSeeds contract not loaded — QUEST_SEEDS_ID env var missing?');
  console.log('   QUEST_SEEDS_ID =', process.env.QUEST_SEEDS_ID || '(not set)');
  process.exit(1);
}
console.log('4. ✅ questSeeds contract loaded');

// Step 5: Attempt a test mint of 1 XP to the relayer itself
console.log('\n5. Attempting test mint of 1 XP to relayer wallet...');
try {
  const { decodeAddress } = await import('@polkadot/util-crypto');
  const publicKey = decodeAddress(keyring.address);
  const walletHex = '0x' + Buffer.from(publicKey).toString('hex');

  const mintResult = await Promise.race([
    command('questSeeds', 'Mint', walletHex, 1, 'test:mint-check'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout after 60s')), 60_000)),
  ]);

  console.log('   ✅ Mint SUCCESS');
  console.log('   Block hash:', mintResult.blockHash);
  console.log('   Result:', JSON.stringify(mintResult.result));
} catch (err) {
  console.error('   ❌ Mint FAILED:', err.message);
  process.exit(1);
}

console.log('\n=== All checks passed — on-chain minting is working ✅ ===');
await api.disconnect();
process.exit(0);

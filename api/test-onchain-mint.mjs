import { GearApi, GearKeyring } from '@gear-js/api';
import { Sails } from 'sails-js';
import { SailsIdlParser } from 'sails-js-parser';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const VARA_NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const VARA_SEED = process.env.VARA_SEED;
const QUEST_SEEDS_ID = process.env.QUEST_SEEDS_ID;

async function testOnChainMint() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Test On-Chain Seeds Minting                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Step 1: Check environment variables
  console.log('📋 Step 1: Checking environment variables...');
  if (!VARA_SEED) {
    console.error('❌ VARA_SEED not set!');
    process.exit(1);
  }
  if (!QUEST_SEEDS_ID) {
    console.error('❌ QUEST_SEEDS_ID not set!');
    process.exit(1);
  }
  console.log(`✅ VARA_SEED: ${VARA_SEED.split(' ').slice(0, 3).join(' ')}... (${VARA_SEED.split(' ').length} words)`);
  console.log(`✅ QUEST_SEEDS_ID: ${QUEST_SEEDS_ID.slice(0, 20)}...`);
  console.log(`✅ VARA_NODE: ${VARA_NODE}\n`);

  // Step 2: Connect to VARA network
  console.log('🌐 Step 2: Connecting to VARA network...');
  let api;
  try {
    api = await GearApi.create({ providerAddress: VARA_NODE });
    const chain = await api.chain();
    console.log(`✅ Connected to ${chain}\n`);
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
    process.exit(1);
  }

  // Step 3: Load keyring from seed
  console.log('🔑 Step 3: Loading keyring from seed...');
  let keyring;
  try {
    keyring = await GearKeyring.fromMnemonic(VARA_SEED);
    console.log(`✅ Keyring loaded (mnemonic): ${keyring.address}\n`);
  } catch (mnemonicErr) {
    console.warn(`⚠️  Mnemonic failed: ${mnemonicErr.message}`);
    console.log('   Trying SURI format...');
    try {
      keyring = await GearKeyring.fromSuri(VARA_SEED);
      console.log(`✅ Keyring loaded (SURI): ${keyring.address}\n`);
    } catch (suriErr) {
      console.error(`❌ Both mnemonic and SURI failed!`);
      console.error(`   Mnemonic error: ${mnemonicErr.message}`);
      console.error(`   SURI error: ${suriErr.message}`);
      process.exit(1);
    }
  }

  // Step 4: Load contract IDL
  console.log('📖 Step 4: Loading quest-seeds contract IDL...');
  let sails;
  try {
    const idlPath = resolve(__dirname, 'idl/quest-seeds.idl');
    const idl = readFileSync(idlPath, 'utf-8');
    const parser = await SailsIdlParser.new();
    sails = new Sails(parser);
    sails.parseIdl(idl);
    sails.setApi(api);
    sails.setProgramId(QUEST_SEEDS_ID);
    console.log(`✅ IDL loaded and parsed\n`);
  } catch (err) {
    console.error(`❌ IDL loading failed: ${err.message}`);
    process.exit(1);
  }

  // Step 5: Check if contract exists on-chain
  console.log('🔍 Step 5: Verifying contract exists on-chain...');
  try {
    const program = await api.programStorage.getProgram(QUEST_SEEDS_ID);
    if (!program) {
      console.error(`❌ Contract not found at ${QUEST_SEEDS_ID}`);
      process.exit(1);
    }
    console.log(`✅ Contract found on-chain\n`);
  } catch (err) {
    console.error(`❌ Contract verification failed: ${err.message}`);
    process.exit(1);
  }

  // Step 6: Attempt test mint
  console.log('💎 Step 6: Attempting test mint...');
  const testWallet = keyring.address; // Mint to self for testing
  const testAmount = 1;
  const testReason = 'test:diagnostic';

  try {
    const service = sails.services.SeedsService;
    if (!service) {
      console.error(`❌ SeedsService not found in IDL`);
      console.log('   Available services:', Object.keys(sails.services));
      process.exit(1);
    }

    const mintFn = service.functions.Mint;
    if (!mintFn) {
      console.error(`❌ Mint function not found in SeedsService`);
      console.log('   Available functions:', Object.keys(service.functions));
      process.exit(1);
    }

    console.log(`   Minting ${testAmount} Seeds to ${testWallet}...`);
    const tx = mintFn(testWallet, testAmount, testReason);
    tx.withAccount(keyring);
    
    console.log('   Calculating gas...');
    await tx.calculateGas();
    
    console.log('   Signing and sending transaction...');
    const { response, blockHash } = await tx.signAndSend();
    
    console.log(`✅ Transaction sent! Block hash: ${blockHash}`);
    
    try {
      const result = await response();
      console.log(`✅ Transaction confirmed!`);
      console.log(`   Result:`, result);
    } catch (decodeErr) {
      console.warn(`⚠️  Response decode warning: ${decodeErr.message.slice(0, 100)}`);
    }

    console.log(`\n🎉 SUCCESS! On-chain minting is working!`);
    console.log(`\n📊 Summary:`);
    console.log(`   Recipient: ${testWallet}`);
    console.log(`   Amount: ${testAmount} Seeds`);
    console.log(`   Reason: ${testReason}`);
    console.log(`   Block Hash: ${blockHash}`);
    console.log(`\n🔗 View on VARA Idea:`);
    console.log(`   https://idea.gear-tech.io/programs/${QUEST_SEEDS_ID}?node=${VARA_NODE}`);

  } catch (err) {
    console.error(`\n❌ Mint failed: ${err.message}`);
    console.error(`\nFull error:`, err);
    process.exit(1);
  }

  process.exit(0);
}

testOnChainMint().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});

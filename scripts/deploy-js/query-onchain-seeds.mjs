import { GearApi } from '@gear-js/api';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../api/.env') });

const VARA_NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const QUEST_SEEDS_ID = process.env.QUEST_SEEDS_ID;

if (!QUEST_SEEDS_ID) {
  console.error('❌ QUEST_SEEDS_ID not set in .env');
  process.exit(1);
}

async function queryOnChainSeeds(wallet) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Query On-Chain Seeds Balance (VARA Network)         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`🌐 Connecting to ${VARA_NODE}...`);
  const api = await GearApi.create({ providerAddress: VARA_NODE });
  const chain = await api.chain();
  console.log(`✅ Connected to ${chain}\n`);

  console.log(`📄 Quest-Seeds Contract: ${QUEST_SEEDS_ID}`);
  console.log(`👤 Querying wallet: ${wallet}\n`);

  try {
    // Load the IDL
    const idlPath = resolve(__dirname, '../../api/idl/quest-seeds.idl');
    const idlContent = readFileSync(idlPath, 'utf-8');
    
    // Parse the Sails IDL to find the query method
    console.log('📖 Reading contract IDL...');
    
    // For Seeds token (fungible token), the standard query is BalanceOf
    // Let's try to query the balance
    const program = await api.programStorage.getProgram(QUEST_SEEDS_ID);
    
    if (!program) {
      console.error('❌ Contract not found on-chain');
      process.exit(1);
    }
    
    console.log('✅ Contract found on-chain\n');
    
    // Query using the Sails pattern
    // The Seeds contract should have a BalanceOf query
    const stateReply = await api.programState.read(
      { programId: QUEST_SEEDS_ID },
      idlContent
    );
    
    console.log('📊 Contract State:');
    console.log(JSON.stringify(stateReply, null, 2));
    
  } catch (err) {
    console.error('❌ Query failed:', err.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure QUEST_SEEDS_ID is correct in .env');
    console.error('2. Ensure contract is deployed to VARA testnet');
    console.error('3. Check that the IDL file matches the deployed contract');
  }

  process.exit(0);
}

// Alternative: Show recent transactions for the contract
async function showRecentTransactions() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Recent On-Chain Activity (Quest-Seeds Contract)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`🔗 View all transactions on Subscan:`);
  console.log(`   https://vara.subscan.io/account/${QUEST_SEEDS_ID}\n`);
  
  console.log(`📊 Contract Details:`);
  console.log(`   Program ID: ${QUEST_SEEDS_ID}`);
  console.log(`   Network: VARA Testnet`);
  console.log(`   Explorer: https://idea.gear-tech.io/programs/${QUEST_SEEDS_ID}?node=wss://testnet.vara.network\n`);
  
  console.log(`💡 To verify Seeds minting:`);
  console.log(`   1. Go to Subscan: https://vara.subscan.io/account/${QUEST_SEEDS_ID}`);
  console.log(`   2. Click on "Extrinsics" tab`);
  console.log(`   3. Look for "Mint" transactions`);
  console.log(`   4. Each transaction shows: recipient wallet, amount, timestamp\n`);
  
  console.log(`📝 Share this with VARA team:`);
  console.log(`   Contract Address: ${QUEST_SEEDS_ID}`);
  console.log(`   Network: VARA Testnet (wss://testnet.vara.network)`);
  console.log(`   Token: Seeds (SEEDS)`);
  console.log(`   Decimals: 0`);
  console.log(`   Use Case: Quest reward system for GrowStreams`);
  console.log(`   Subscan: https://vara.subscan.io/account/${QUEST_SEEDS_ID}`);
}

const wallet = process.argv[2];

if (wallet) {
  queryOnChainSeeds(wallet).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
} else {
  showRecentTransactions();
}

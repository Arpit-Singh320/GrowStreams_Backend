#!/usr/bin/env node
// Quick script to check WUSDC, WUSDT, and all token balances for a wallet on Vara testnet
import { config } from 'dotenv';
config();

import { connect } from '../src/sails-client.mjs';
import { getVftBalance, getAllBalances } from '../src/services/token-service.mjs';

const WALLET = process.argv[2] || 'kGiaMA7wophBP4BuJRyCUPTrkrgMfYFL78KaZmAF44WYjuPM2';

async function main() {
  console.log(`\n=== Wallet Balance Check ===`);
  console.log(`Wallet: ${WALLET}\n`);

  console.log('Connecting to Vara testnet...');
  await connect();
  console.log('Connected!\n');

  // Check individual wrapped stablecoin balances
  const tokens = ['WUSDC', 'WUSDT', 'WETH', 'WBTC', 'VARA', 'GROW'];

  for (const symbol of tokens) {
    try {
      const result = await getVftBalance(symbol, WALLET);
      const balNum = parseFloat(result.balance);
      const status = balNum > 0 ? '✅' : '⚠️';
      console.log(`${status} ${result.symbol.padEnd(6)} ${result.balance} (raw: ${result.balanceRaw}, decimals: ${result.decimals})`);
    } catch (err) {
      console.log(`❌ ${symbol.padEnd(6)} Error: ${err.message}`);
    }
  }

  // Also get all balances via the service
  console.log('\n--- All Balances (via getAllBalances) ---');
  try {
    const all = await getAllBalances(WALLET);
    for (const b of all) {
      console.log(`   ${b.symbol.padEnd(6)} ${b.balance}`);
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }

  console.log('\n=== Done ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

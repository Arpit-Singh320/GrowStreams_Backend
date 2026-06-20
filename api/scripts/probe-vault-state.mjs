import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { query as contractQuery } from './src/sails-client.mjs';

async function main() {
  try {
    console.log('=== Vault per-token balances ===');
    const config = await contractQuery('tokenVault', 'GetConfig');
    console.log('GetConfig.total_tokens_held:', config?.total_tokens_held);
    
    // Query individual token balances via BalanceOf
    const vaultAddress = '0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef';
    
    const tokens = [
      { symbol: 'wVARA', program: '0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d' },
      { symbol: 'gVARA', program: '0x71de1ef1f4dec1a4fe862aa6c92747c8499bbf1af128625749027392709f4a72' },
    ];
    
    for (const t of tokens) {
      try {
        const bal = await contractQuery(t.program, 'BalanceOf', vaultAddress);
        console.log(`${t.symbol} BalanceOf(vault):`, bal);
      } catch (e) {
        console.log(`${t.symbol} BalanceOf failed:`, e.message);
      }
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

main();

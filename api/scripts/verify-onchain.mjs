import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { query as contractQuery, getApi } from './api/src/sails-client.mjs';

async function main() {
  const vault = '0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef';
  const wvara = '0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d';
  const gvara = '0x71de1ef1f4dec1a4fe862aa6c92747c8499bbf1af128625749027392709f4a72';

  console.log('=== On-Chain Verification ===\n');
  console.log('Vault Contract:', vault);
  console.log('Explorer: https://explorer.vara.network/address/' + vault);
  console.log();

  // 1. Native VARA balance
  try {
    const api = getApi();
    const account = await api.query.system.account(vault);
    const native = account?.data?.free?.toString() || '0';
    console.log('1. Native VARA (system.account.free):');
    console.log('   Raw:', native);
    console.log('   Display:', (Number(native) / 1e12).toFixed(6), 'VARA');
  } catch (e) {
    console.log('1. Native VARA: Failed -', e.message);
  }
  console.log();

  // 2. wVARA BalanceOf(vault)
  try {
    const wvarabal = await contractQuery(wvara, 'BalanceOf', vault);
    console.log('2. wVARA BalanceOf(vault):');
    console.log('   Raw:', wvarabal?.toString());
    console.log('   Display:', (Number(wvarabal) / 1e12).toFixed(6), 'VARA');
  } catch (e) {
    console.log('2. wVARA: Failed -', e.message);
  }
  console.log();

  // 3. gVARA BalanceOf(vault)
  try {
    const gvarabal = await contractQuery(gvara, 'BalanceOf', vault);
    console.log('3. gVARA BalanceOf(vault):');
    console.log('   Raw:', gvarabal?.toString());
    console.log('   Display:', (Number(gvarabal) / 1e12).toFixed(6), 'VARA');
  } catch (e) {
    console.log('3. gVARA: Failed -', e.message);
  }

  process.exit(0);
}

main();

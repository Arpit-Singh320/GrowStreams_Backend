#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });

import { connect, query, getContract } from './src/sails-client.mjs';

const STREAM_CORE_ID = process.env.STREAM_CORE_ID || '0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659';
const TOKEN_VAULT_ID = process.env.TOKEN_VAULT_ID || '0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9';
const GVARA_TOKEN_ID = process.env.GVARA_TOKEN_ID || '0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee';
const WVARA_TOKEN_ID = process.env.WVARA_TOKEN_ID || '0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d';
const GROW_TOKEN_ID = process.env.GROW_TOKEN_ID || '0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163';
const BOUNTY_ADAPTER_ID = process.env.BOUNTY_ADAPTER_ID || '0x7697bb2e8655e6cd7294389a0289355f48fd5459914d2a735c9966dad548bd4f';
const DISTRIBUTION_POOL_ID = process.env.DISTRIBUTION_POOL_ID || '0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70';
const IDENTITY_REGISTRY_ID = process.env.IDENTITY_REGISTRY_ID || '0x6f413156308663798a77507cf0ea6e79bdbf53add3579ccd4317fc320acf7f29';
const LIQUIDATION_MANAGER_ID = process.env.LIQUIDATION_MANAGER_ID || '0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3';
const PERMISSION_MANAGER_ID = process.env.PERMISSION_MANAGER_ID || '0x52f4299e964dab5e97c91cdd10e2d6e635b19696ab8389889aabceba3de9e581';
const QUEST_SEEDS_ID = process.env.QUEST_SEEDS_ID || '0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d';
const SPLITS_ROUTER_ID = process.env.SPLITS_ROUTER_ID || '0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45';
const SUPER_TOKEN_ID = process.env.SUPER_TOKEN_ID || '0x4a9718de4055470963104a4c08e5154ad0c2c48a699996b59e861de9393bf347';
const TREASURY_ADDRESS = '0x868111d85b4c429dbf5f2d54111c580cd9bc12a53ac377760d89bfe2813e7410';

async function main() {
  console.log('Connecting to Vara network...');
  await connect();

  console.log('\n=== StreamCore Queries ===');
  console.log('Program ID:', STREAM_CORE_ID);

  try {
    const totalStreams = await query('streamCore', 'TotalStreams');
    console.log('Total Streams:', totalStreams);
  } catch (err) {
    console.error('TotalStreams query failed:', err.message);
  }

  try {
    const activeStreams = await query('streamCore', 'ActiveStreams');
    console.log('Active Streams:', activeStreams);
  } catch (err) {
    console.error('ActiveStreams query failed:', err.message);
  }

  try {
    const config = await query('streamCore', 'GetConfig');
    console.log('Config:', JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('GetConfig query failed:', err.message);
  }

  console.log('\n=== TokenVault Queries ===');
  console.log('Program ID:', TOKEN_VAULT_ID);

  try {
    const vaultConfig = await query('tokenVault', 'GetConfig');
    console.log('Vault Config:', JSON.stringify(vaultConfig, null, 2));
  } catch (err) {
    console.error('GetConfig query failed:', err.message);
  }

  try {
    const isPaused = await query('tokenVault', 'IsPaused');
    console.log('Is Paused:', isPaused);
  } catch (err) {
    console.error('IsPaused query failed:', err.message);
  }

  try {
    // Query stream allocation for stream 1
    const streamAllocation = await query('tokenVault', 'GetStreamAllocation', 1);
    console.log('Stream 1 Allocation:', streamAllocation);
  } catch (err) {
    console.error('GetStreamAllocation query failed:', err.message);
  }

  console.log('\n=== Contract Wiring Analysis ===');
  const streamCoreConfig = await query('streamCore', 'GetConfig');
  const vaultConfig = await query('tokenVault', 'GetConfig');

  console.log('StreamCore Config:');
  console.log('  token_vault:', streamCoreConfig.token_vault);
  console.log('  Expected:', TOKEN_VAULT_ID);
  console.log('  Match:', streamCoreConfig.token_vault === TOKEN_VAULT_ID ? '✓' : '✗');

  console.log('\nTokenVault Config:');
  console.log('  stream_core:', vaultConfig.stream_core);
  console.log('  Expected:', STREAM_CORE_ID);
  console.log('  Match:', vaultConfig.stream_core === STREAM_CORE_ID ? '✓' : '✗');

  if (streamCoreConfig.token_vault !== TOKEN_VAULT_ID || vaultConfig.stream_core !== STREAM_CORE_ID) {
    console.log('\n⚠️  CONTRACTS NOT PROPERLY WIRED');
    console.log('To fix: Call SetTokenVault on StreamCore and SetStreamCore on TokenVault');
  }

  console.log('\n=== gVARA (SuperToken) Queries ===');
  console.log('Program ID:', GVARA_TOKEN_ID);

  try {
    const totalSupply = await query('gvaraToken', 'TotalSupply');
    console.log('Total Supply:', totalSupply);
  } catch (err) {
    console.error('TotalSupply query failed:', err.message);
  }

  try {
    const vaultBalance = await query('gvaraToken', 'BalanceOf', TOKEN_VAULT_ID);
    console.log('Vault BalanceOf(TokenVault):', vaultBalance);
  } catch (err) {
    console.error('Vault BalanceOf query failed:', err.message);
  }

  try {
    const meta = await query('gvaraToken', 'GetMeta');
    console.log('Meta:', JSON.stringify(meta, null, 2));
  } catch (err) {
    console.error('GetMeta query failed:', err.message);
  }

  try {
    const isPaused = await query('gvaraToken', 'IsPaused');
    console.log('Is Paused:', isPaused);
  } catch (err) {
    console.error('IsPaused query failed:', err.message);
  }

  try {
    const isNativeWrapper = await query('gvaraToken', 'IsNativeWrapper');
    console.log('Is Native Wrapper:', isNativeWrapper);
  } catch (err) {
    console.error('IsNativeWrapper query failed:', err.message);
  }

  try {
    const underlyingToken = await query('gvaraToken', 'UnderlyingToken');
    console.log('Underlying Token:', underlyingToken);
  } catch (err) {
    console.error('UnderlyingToken query failed:', err.message);
  }

  console.log('\n=== wVARA Queries ===');
  console.log('Program ID:', WVARA_TOKEN_ID);

  // Set program ID for wVARA contract
  const wvaraContract = getContract('wvara');
  if (wvaraContract) {
    wvaraContract.setProgramId(WVARA_TOKEN_ID);
    console.log('Set wVARA program ID');
  }

  try {
    const wvaraTotalSupply = await query('wvara', 'TotalSupply');
    console.log('Total Supply:', wvaraTotalSupply);
  } catch (err) {
    console.error('TotalSupply query failed:', err.message);
  }

  try {
    const vaultBalance = await query('wvara', 'BalanceOf', TOKEN_VAULT_ID);
    console.log('Vault BalanceOf(TokenVault):', vaultBalance);
  } catch (err) {
    console.error('Vault BalanceOf query failed:', err.message);
  }

  try {
    const wvaraMeta = await query('wvara', 'GetMeta');
    console.log('Meta:', JSON.stringify(wvaraMeta, null, 2));
  } catch (err) {
    console.error('GetMeta query failed:', err.message);
  }

  try {
    const wvaraName = await query('wvara', 'Name');
    console.log('Name:', wvaraName);
  } catch (err) {
    console.error('Name query failed:', err.message);
  }

  try {
    const wvaraSymbol = await query('wvara', 'Symbol');
    console.log('Symbol:', wvaraSymbol);
  } catch (err) {
    console.error('Symbol query failed:', err.message);
  }

  try {
    const wvaraDecimals = await query('wvara', 'Decimals');
    console.log('Decimals:', wvaraDecimals);
  } catch (err) {
    console.error('Decimals query failed:', err.message);
  }

  console.log('\n=== GrowToken Queries ===');
  console.log('Program ID:', GROW_TOKEN_ID);

  try {
    const growTotalSupply = await query('growToken', 'TotalSupply');
    console.log('Total Supply:', growTotalSupply);
  } catch (err) {
    console.error('TotalSupply query failed:', err.message);
  }

  try {
    const growMeta = await query('growToken', 'GetMeta');
    console.log('Meta:', JSON.stringify(growMeta, null, 2));
  } catch (err) {
    console.error('GetMeta query failed:', err.message);
  }

  console.log('\n=== SuperToken Queries ===');
  console.log('Program ID:', SUPER_TOKEN_ID);

  try {
    const superTotalSupply = await query('superToken', 'TotalSupply');
    console.log('Total Supply:', superTotalSupply);
  } catch (err) {
    console.error('TotalSupply query failed:', err.message);
  }

  try {
    const superMeta = await query('superToken', 'GetMeta');
    console.log('Meta:', JSON.stringify(superMeta, null, 2));
  } catch (err) {
    console.error('GetMeta query failed:', err.message);
  }

  console.log('\n=== DistributionPool Queries ===');
  console.log('Program ID:', DISTRIBUTION_POOL_ID);

  try {
    const poolConfig = await query('distributionPool', 'GetConfig');
    console.log('Config:', JSON.stringify(poolConfig, null, 2));
  } catch (err) {
    console.error('GetConfig query failed:', err.message);
  }

  console.log('\n=== IdentityRegistry Queries ===');
  console.log('Program ID:', IDENTITY_REGISTRY_ID);

  try {
    const identityConfig = await query('identityRegistry', 'GetConfig');
    console.log('Config:', JSON.stringify(identityConfig, null, 2));
  } catch (err) {
    console.error('GetConfig query failed:', err.message);
  }

  console.log('\n=== PermissionManager Queries ===');
  console.log('Program ID:', PERMISSION_MANAGER_ID);

  try {
    const permConfig = await query('permissionManager', 'GetConfig');
    console.log('Config:', JSON.stringify(permConfig, null, 2));
  } catch (err) {
    console.error('GetConfig query failed:', err.message);
  }

  console.log('\n=== BountyAdapter Queries ===');
  console.log('Program ID:', BOUNTY_ADAPTER_ID);

  try {
    const bountyConfig = await query('bountyAdapter', 'GetConfig');
    console.log('Config:', JSON.stringify(bountyConfig, null, 2));
  } catch (err) {
    console.error('GetConfig query failed:', err.message);
  }

  console.log('\n=== LiquidationManager Queries ===');
  console.log('Program ID:', LIQUIDATION_MANAGER_ID);

  try {
    const liquidationConfig = await query('liquidationManager', 'GetConfig');
    console.log('Config:', JSON.stringify(liquidationConfig, null, 2));
  } catch (err) {
    console.error('GetConfig query failed:', err.message);
  }

  console.log('\n=== QuestSeeds Queries ===');
  console.log('Program ID:', QUEST_SEEDS_ID);

  try {
    const seedsConfig = await query('questSeeds', 'GetConfig');
    console.log('Config:', JSON.stringify(seedsConfig, null, 2));
  } catch (err) {
    console.error('GetConfig query failed:', err.message);
  }

  console.log('\n=== SplitsRouter Queries ===');
  console.log('Program ID:', SPLITS_ROUTER_ID);

  try {
    const splitsConfig = await query('splitsRouter', 'GetConfig');
    console.log('Config:', JSON.stringify(splitsConfig, null, 2));
  } catch (err) {
    console.error('GetConfig query failed:', err.message);
  }

  console.log('\n=== Fee Collection Analysis ===');
  console.log('Treasury Address:', TREASURY_ADDRESS);
  console.log('Fee Rate:', '250 bps (2.5%) from StreamCore config');

  console.log('\n=== Treasury Balances ===');

  // Check treasury's gVARA balance
  try {
    const treasuryGvaraBalance = await query('gvaraToken', 'BalanceOf', TREASURY_ADDRESS);
    console.log('Treasury gVARA Balance:', treasuryGvaraBalance);
  } catch (err) {
    console.error('Treasury gVARA balance query failed:', err.message);
  }

  // Check treasury's wVARA balance
  try {
    const treasuryWvaraBalance = await query('wvara', 'BalanceOf', TREASURY_ADDRESS);
    console.log('Treasury wVARA Balance:', treasuryWvaraBalance);
  } catch (err) {
    console.error('Treasury wVARA balance query failed:', err.message);
  }

  // Check treasury's GROW balance
  try {
    const treasuryGrowBalance = await query('growToken', 'BalanceOf', TREASURY_ADDRESS);
    console.log('Treasury GROW Balance:', treasuryGrowBalance);
  } catch (err) {
    console.error('Treasury GROW balance query failed:', err.message);
  }

  console.log('\n=== Fee Collection Mechanism ===');
  console.log('Fees are collected when:');
  console.log('1. Stream is created (initial_deposit * fee_bps / 10000)');
  console.log('2. Additional deposit is made (amount * fee_bps / 10000)');
  console.log('3. Fees are routed to treasury address in the same token');
  console.log('4. SuperToken emits FeeCollected events for tracking');
  console.log('5. TokenVault emits FeeCollected events for vault path');

  console.log('\n=== Where to See Fees ===');
  console.log('1. On-chain events (explorer): SuperTokenService.FeeCollected');
  console.log('2. Treasury balance queries (above)');
  console.log('3. Analytics endpoint: /summary (if properly indexed)');
  console.log('4. Database: onchain_events table (if event indexer running)');

  console.log('\n=== Treasury Balance Analysis ===');
  console.log('Treasury balances include ALL tokens held (fees + initial minting):');
  console.log('- Run this script to see current treasury balances');
  console.log('- Some tokens may have been minted directly to treasury (e.g., GROW)');
  console.log('- To see actual fees, track FeeCollected events on the explorer');
  console.log('- Use fetch-fee-events.mjs for explorer instructions');

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * topup-balance.mjs
 *
 * Tops up the executable balance of the stream-core-eth Mirror program
 * by approving and calling Mirror.executableBalanceTopUp(amount) with wVARA.
 *
 * Run AFTER: node scripts/deploy-js/create-program.mjs
 *
 * Usage:
 *   node scripts/deploy-js/topup-balance.mjs
 *
 * Required .env vars:
 *   ETH_PRIVATE_KEY           — deployer private key
 *   VARA_ETH_RPC              — https://hoodi-reth-rpc.gear-tech.io
 *   VARA_ETH_CHAIN_ID         — 560048
 *   VARA_ETH_ROUTER           — Hoodi Router address (to get wVARA address)
 *   STREAM_CORE_ETH_MIRROR    — from create-program.mjs
 *
 * Optional:
 *   VARA_ETH_TOPUP            — amount in wVARA base units (default: 1000000000000 = 1 wVARA)
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const envPath = existsSync(resolve(ROOT, 'api/.env'))
  ? resolve(ROOT, 'api/.env')
  : resolve(ROOT, '.env');
loadEnv({ path: envPath });

const required = ['ETH_PRIVATE_KEY', 'VARA_ETH_RPC', 'VARA_ETH_CHAIN_ID', 'VARA_ETH_ROUTER', 'STREAM_CORE_ETH_MIRROR'];
for (const k of required) {
  if (!process.env[k]) { console.error(`Error: ${k} not set in .env`); process.exit(1); }
}

const { ETH_PRIVATE_KEY, VARA_ETH_RPC, VARA_ETH_CHAIN_ID, VARA_ETH_ROUTER, STREAM_CORE_ETH_MIRROR } = process.env;
const chainId = parseInt(VARA_ETH_CHAIN_ID, 10);
const topupAmount = BigInt(process.env.VARA_ETH_TOPUP || '1000000000000');

const ROUTER_ABI = [
  {
    type: 'function',
    name: 'wrappedVara',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
];

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
];

const MIRROR_ABI = [
  {
    type: 'function',
    name: 'executableBalanceTopUp',
    inputs: [{ name: 'value', type: 'uint128' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
];

const hoodiChain = {
  id: chainId,
  name: 'Vara.eth Hoodi Testnet',
  nativeCurrency: { name: 'Hoodi ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [VARA_ETH_RPC] } },
};

const account = privateKeyToAccount(
  ETH_PRIVATE_KEY.startsWith('0x') ? ETH_PRIVATE_KEY : `0x${ETH_PRIVATE_KEY}`
);
const publicClient = createPublicClient({ chain: hoodiChain, transport: http(VARA_ETH_RPC) });
const walletClient = createWalletClient({ account, chain: hoodiChain, transport: http(VARA_ETH_RPC) });

console.log('=== Top up executable balance for stream-core-eth Mirror ===');
console.log('Mirror  :', STREAM_CORE_ETH_MIRROR);
console.log('Amount  :', topupAmount.toString(), 'wVARA base units (', Number(topupAmount) / 1e12, 'wVARA)');
console.log('Sender  :', account.address);
console.log('');

// Get wVARA address from Router
console.log('Getting wVARA address from Router...');
const wvaraAddr = await publicClient.readContract({
  address: VARA_ETH_ROUTER,
  abi: ROUTER_ABI,
  functionName: 'wrappedVara',
});
console.log('wVARA   :', wvaraAddr);

// Check wVARA balance
const balance = await publicClient.readContract({
  address: wvaraAddr,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [account.address],
});
console.log('Balance :', balance.toString(), 'wVARA base units');

if (balance < topupAmount) {
  console.error('');
  console.error(`Error: Insufficient wVARA balance. Have ${balance}, need ${topupAmount}.`);
  console.error('Get wVARA from the Hoodi testnet faucet or bridge.');
  process.exit(1);
}

// Step 1: Approve Mirror to spend wVARA
console.log('');
console.log('Step 1: Approving Mirror to spend wVARA...');
const approveTx = await walletClient.writeContract({
  address: wvaraAddr,
  abi: ERC20_ABI,
  functionName: 'approve',
  args: [STREAM_CORE_ETH_MIRROR, topupAmount],
});
console.log('  Approve tx:', approveTx);
await publicClient.waitForTransactionReceipt({ hash: approveTx });
console.log('  Approved.');

// Step 2: Call executableBalanceTopUp on Mirror
console.log('');
console.log('Step 2: Calling Mirror.executableBalanceTopUp...');
const topupTx = await walletClient.writeContract({
  address: STREAM_CORE_ETH_MIRROR,
  abi: MIRROR_ABI,
  functionName: 'executableBalanceTopUp',
  args: [topupAmount],
});
console.log('  Top-up tx:', topupTx);
await publicClient.waitForTransactionReceipt({ hash: topupTx });
console.log('  Done.');

console.log('');
console.log('=== Executable balance topped up ===');
console.log('');
console.log('Next: node scripts/deploy-js/init-stream-core-eth.mjs');

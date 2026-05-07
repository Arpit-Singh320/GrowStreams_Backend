#!/usr/bin/env node
/**
 * deploy-eth.mjs — Deploy StreamEscrow.sol to Vara.eth Hoodi testnet.
 *
 * Run AFTER scripts/deploy-eth.sh has deployed stream-core-eth and you have
 * set STREAM_CORE_ETH_MIRROR in .env.
 *
 * Usage:
 *   node scripts/deploy-js/deploy-eth.mjs
 *
 * Required .env vars:
 *   ETH_PRIVATE_KEY          — deployer wallet private key
 *   VARA_ETH_RPC             — https://hoodi-reth-rpc.gear-tech.io
 *   VARA_ETH_CHAIN_ID        — 560048
 *   VARA_ETH_TOKEN           — USDC address on Hoodi
 *   STREAM_CORE_ETH_MIRROR   — Mirror address from deploy-eth.sh output
 */

import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

// ── Validate env ─────────────────────────────────────────────────────────────
const required = ['ETH_PRIVATE_KEY', 'VARA_ETH_RPC', 'VARA_ETH_CHAIN_ID', 'VARA_ETH_TOKEN', 'STREAM_CORE_ETH_MIRROR'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Error: ${key} is not set in .env`);
    process.exit(1);
  }
}

const {
  ETH_PRIVATE_KEY,
  VARA_ETH_RPC,
  VARA_ETH_CHAIN_ID,
  VARA_ETH_TOKEN,
  STREAM_CORE_ETH_MIRROR,
} = process.env;

const chainId = parseInt(VARA_ETH_CHAIN_ID, 10);

// ── Viem chain definition ─────────────────────────────────────────────────────
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

console.log('=== GrowStreams — Deploy StreamEscrow.sol ===');
console.log('Network  :', hoodiChain.name, `(chainId ${chainId})`);
console.log('Deployer :', account.address);
console.log('Token    :', VARA_ETH_TOKEN);
console.log('Mirror   :', STREAM_CORE_ETH_MIRROR);
console.log('');

// ── StreamEscrow ABI (constructor only needed for deployment) ─────────────────
const STREAM_ESCROW_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: '_token',         type: 'address' },
      { name: '_streamCoreAbi', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'admin',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
];

// ── StreamEscrow bytecode ─────────────────────────────────────────────────────
// Compile StreamEscrow.sol first with:
//   cd contracts/vara-eth/stream-escrow
//   npx solc --bin StreamEscrow.sol -o build/
// Then paste the bytecode below, OR use hardhat/foundry for compilation.
//
// For a quick testnet deploy without local solc, use Remix IDE:
//   https://remix.ethereum.org  →  compile StreamEscrow.sol  →  copy bytecode
//
// Placeholder — replace with actual compiled bytecode:
const STREAM_ESCROW_BYTECODE = process.env.STREAM_ESCROW_BYTECODE || null;

if (!STREAM_ESCROW_BYTECODE) {
  console.log('── Bytecode not found in env ──');
  console.log('');
  console.log('Option A (Remix IDE — easiest):');
  console.log('  1. Open https://remix.ethereum.org');
  console.log('  2. Paste contracts/vara-eth/stream-escrow/StreamEscrow.sol');
  console.log('  3. Compile (Solidity 0.8.24)');
  console.log('  4. Copy "Bytecode" from Remix → set STREAM_ESCROW_BYTECODE in .env');
  console.log('  5. Re-run: node scripts/deploy-js/deploy-eth.mjs');
  console.log('');
  console.log('Option B (foundry):');
  console.log('  forge build --root contracts/vara-eth/stream-escrow');
  console.log('  Then read: contracts/vara-eth/stream-escrow/out/StreamEscrow.sol/StreamEscrow.json');
  console.log('');
  console.log('Option C (solc):');
  console.log('  cd contracts/vara-eth/stream-escrow');
  console.log('  solc --bin StreamEscrow.sol');
  process.exit(0);
}

// ── Deploy ────────────────────────────────────────────────────────────────────
console.log('Deploying StreamEscrow...');

const hash = await walletClient.deployContract({
  abi: STREAM_ESCROW_ABI,
  bytecode: STREAM_ESCROW_BYTECODE.startsWith('0x')
    ? STREAM_ESCROW_BYTECODE
    : `0x${STREAM_ESCROW_BYTECODE}`,
  args: [VARA_ETH_TOKEN, STREAM_CORE_ETH_MIRROR],
});

console.log('  Tx hash:', hash);
console.log('  Waiting for receipt...');

const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (!receipt.contractAddress) {
  console.error('Error: contractAddress not in receipt. Deploy may have failed.');
  console.error('Receipt:', receipt);
  process.exit(1);
}

const escrowAddress = receipt.contractAddress;

console.log('');
console.log('=== StreamEscrow deployed ===');
console.log('  Address   :', escrowAddress);
console.log('  Block     :', receipt.blockNumber.toString());
console.log('  Gas used  :', receipt.gasUsed.toString());
console.log('');
console.log('Add to .env:');
console.log(`  STREAM_ESCROW_ADDRESS="${escrowAddress}"`);
console.log('');

// ── Persist to deploy-state.json ─────────────────────────────────────────────
const stateFile = resolve(__dirname, '../../deploy-state.json');
let state = {};
try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}

state['stream-escrow'] = {
  address: escrowAddress,
  token: VARA_ETH_TOKEN,
  mirror: STREAM_CORE_ETH_MIRROR,
  network: 'vara-eth-hoodi',
  deployedAt: new Date().toISOString(),
  txHash: hash,
};

writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('Saved to deploy-state.json');
console.log('');
console.log('Next: set STREAM_ESCROW_ADDRESS in .env, then run the API server.');

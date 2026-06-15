#!/usr/bin/env node
/**
 * deploy-eth.mjs — Compile (if needed) and deploy StreamEscrow.sol to Vara.eth Hoodi.
 *
 * Run AFTER:
 *   1. node scripts/deploy-js/compile-escrow.mjs  (deploys StreamCoreEthAbi, sets STREAM_CORE_ETH_ABI)
 *   2. bash scripts/deploy-eth.sh                 (uploads WASM, creates program, tops up balance)
 *   3. node scripts/deploy-js/init-stream-core-eth.mjs  (sends Initialize message)
 *
 * Usage:
 *   node scripts/deploy-js/deploy-eth.mjs
 *
 * Required .env vars:
 *   ETH_PRIVATE_KEY        — deployer wallet private key
 *   VARA_ETH_RPC           — https://hoodi-reth-rpc.gear-tech.io
 *   VARA_ETH_CHAIN_ID      — 560048
 *   VARA_ETH_TOKEN         — ERC-20 token address on Hoodi (e.g. test USDC)
 *   STREAM_CORE_ETH_ABI    — StreamCoreEthAbi address from compile-escrow.mjs
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const envPath = existsSync(resolve(ROOT, 'api/.env'))
  ? resolve(ROOT, 'api/.env')
  : resolve(ROOT, '.env');
loadEnv({ path: envPath });

// ── Validate env ──────────────────────────────────────────────────────────────
const required = [
  'ETH_PRIVATE_KEY', 'VARA_ETH_RPC', 'VARA_ETH_CHAIN_ID',
  'VARA_ETH_TOKEN', 'STREAM_CORE_ETH_ABI',
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Error: ${key} is not set in .env`);
    process.exit(1);
  }
}

const { ETH_PRIVATE_KEY, VARA_ETH_RPC, VARA_ETH_CHAIN_ID, VARA_ETH_TOKEN, STREAM_CORE_ETH_ABI } = process.env;
const chainId = parseInt(VARA_ETH_CHAIN_ID, 10);

// ── Load compiled StreamEscrow bytecode from build/ ──────────────────────────
const BUILD_FILE = resolve(ROOT, 'contracts/vara-eth/stream-escrow/build/StreamEscrow.json');
if (!existsSync(BUILD_FILE)) {
  console.error('Error: Compiled StreamEscrow.json not found at:');
  console.error(' ', BUILD_FILE);
  console.error('Run first: node scripts/deploy-js/compile-escrow.mjs');
  process.exit(1);
}
const { abi: STREAM_ESCROW_ABI, bytecode: STREAM_ESCROW_BYTECODE } = JSON.parse(readFileSync(BUILD_FILE, 'utf8'));

// ── Viem setup ────────────────────────────────────────────────────────────────
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
console.log('Network      :', hoodiChain.name, `(chainId ${chainId})`);
console.log('Deployer     :', account.address);
console.log('Token        :', VARA_ETH_TOKEN);
console.log('ABI Contract :', STREAM_CORE_ETH_ABI);
console.log('');

// ── Deploy StreamEscrow ───────────────────────────────────────────────────────
// Constructor: (address _token, address _streamCoreAbi)
// _streamCoreAbi is the StreamCoreEthAbi contract address (not the Mirror).
// The Mirror is the ABI contract's underlying program, which the ABI contract proxies.
console.log('Deploying StreamEscrow...');

const hash = await walletClient.deployContract({
  abi: STREAM_ESCROW_ABI,
  bytecode: STREAM_ESCROW_BYTECODE,
  args: [VARA_ETH_TOKEN, STREAM_CORE_ETH_ABI],
});

console.log('  Tx hash:', hash);
console.log('  Waiting for receipt...');
const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (!receipt.contractAddress) {
  console.error('Error: contractAddress not in receipt. Deploy may have failed.');
  console.error('Receipt status:', receipt.status);
  process.exit(1);
}

const escrowAddress = receipt.contractAddress;

console.log('');
console.log('=== StreamEscrow deployed ===');
console.log('  Address  :', escrowAddress);
console.log('  Block    :', receipt.blockNumber.toString());
console.log('  Gas used :', receipt.gasUsed.toString());
console.log('');

// ── Update .env ───────────────────────────────────────────────────────────────
let envContent = readFileSync(envPath, 'utf8');
const escrowLine = `STREAM_ESCROW_ADDRESS="${escrowAddress}"`;
if (envContent.includes('STREAM_ESCROW_ADDRESS=')) {
  envContent = envContent.replace(/STREAM_ESCROW_ADDRESS=.*/, escrowLine);
} else {
  envContent += `\n${escrowLine}\n`;
}
writeFileSync(envPath, envContent);
console.log(`Updated .env: STREAM_ESCROW_ADDRESS="${escrowAddress}"`);

// ── Persist to deploy-state.json ──────────────────────────────────────────────
const stateFile = resolve(ROOT, 'deploy-state.json');
let state = {};
try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
state['stream-escrow'] = {
  address: escrowAddress,
  token: VARA_ETH_TOKEN,
  abiContract: STREAM_CORE_ETH_ABI,
  network: 'vara-eth-hoodi',
  deployedAt: new Date().toISOString(),
  txHash: hash,
};
writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('Saved to deploy-state.json');
console.log('');
console.log('=== Phase 3 complete ===');
console.log('All Vara.eth contracts deployed on Hoodi testnet.');
console.log('');
console.log('Add STREAM_ESCROW_ADDRESS to api/.env if not already done, then restart the API server.');

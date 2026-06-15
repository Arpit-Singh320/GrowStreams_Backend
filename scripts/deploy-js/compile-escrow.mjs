#!/usr/bin/env node
/**
 * compile-escrow.mjs
 *
 * Compiles StreamCoreEth.sol (ABI interface contract) and StreamEscrow.sol
 * using solc-js (no local solc binary required), then deploys StreamCoreEthAbi
 * to Hoodi testnet and writes the address to .env + deploy-state.json.
 *
 * Run BEFORE scripts/deploy-eth.sh.
 *
 * Usage:
 *   node scripts/deploy-js/compile-escrow.mjs
 *
 * Required .env vars:
 *   ETH_PRIVATE_KEY   — deployer wallet private key
 *   VARA_ETH_RPC      — https://hoodi-reth-rpc.gear-tech.io
 *   VARA_ETH_CHAIN_ID — 560048
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import solc from 'solc';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Try root .env first, fall back to api/.env
const envPath = existsSync(resolve(ROOT, '.env'))
  ? resolve(ROOT, '.env')
  : resolve(ROOT, 'api/.env');
loadEnv({ path: envPath });

const required = ['ETH_PRIVATE_KEY', 'VARA_ETH_RPC', 'VARA_ETH_CHAIN_ID'];
for (const k of required) {
  if (!process.env[k]) { console.error(`Error: ${k} not set in .env`); process.exit(1); }
}

const { ETH_PRIVATE_KEY, VARA_ETH_RPC, VARA_ETH_CHAIN_ID } = process.env;
const chainId = parseInt(VARA_ETH_CHAIN_ID, 10);

const CONTRACTS_DIR = resolve(ROOT, 'contracts/vara-eth/stream-escrow');
const STREAM_CORE_ETH_SOL = readFileSync(resolve(CONTRACTS_DIR, 'StreamCoreEth.sol'), 'utf8');
const STREAM_ESCROW_SOL   = readFileSync(resolve(CONTRACTS_DIR, 'StreamEscrow.sol'),  'utf8');

// ── Compile ────────────────────────────────────────────────────────────────
console.log('=== Compiling Solidity contracts ===');

const input = {
  language: 'Solidity',
  sources: {
    'StreamCoreEth.sol': { content: STREAM_CORE_ETH_SOL },
    'StreamEscrow.sol':  { content: STREAM_ESCROW_SOL  },
  },
  settings: {
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    optimizer: { enabled: true, runs: 200 },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter(e => e.severity === 'error');
  if (errors.length > 0) {
    console.error('Compilation errors:');
    errors.forEach(e => console.error(' ', e.formattedMessage));
    process.exit(1);
  }
  output.errors.filter(e => e.severity === 'warning').forEach(w => {
    console.warn('Warning:', w.message);
  });
}

const abiContract   = output.contracts['StreamCoreEth.sol']['StreamCoreEthAbi'];
const escrowContract = output.contracts['StreamEscrow.sol']['StreamEscrow'];

if (!abiContract || !escrowContract) {
  console.error('Error: Could not find compiled contracts in output.');
  console.error('Found:', Object.keys(output.contracts));
  process.exit(1);
}

console.log('  StreamCoreEthAbi bytecode:', abiContract.evm.bytecode.object.length / 2, 'bytes');
console.log('  StreamEscrow bytecode    :', escrowContract.evm.bytecode.object.length / 2, 'bytes');

// Save bytecodes and ABIs to build/ for reference
const BUILD_DIR = resolve(CONTRACTS_DIR, 'build');
writeFileSync(resolve(BUILD_DIR, 'StreamCoreEthAbi.json'), JSON.stringify({
  abi: abiContract.abi,
  bytecode: '0x' + abiContract.evm.bytecode.object,
}, null, 2));
writeFileSync(resolve(BUILD_DIR, 'StreamEscrow.json'), JSON.stringify({
  abi: escrowContract.abi,
  bytecode: '0x' + escrowContract.evm.bytecode.object,
}, null, 2));
console.log('  Saved to contracts/vara-eth/stream-escrow/build/');

// ── Deploy StreamCoreEthAbi to Hoodi ──────────────────────────────────────
console.log('');
console.log('=== Deploying StreamCoreEthAbi to Hoodi testnet ===');

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

console.log('Deployer:', account.address);

const hash = await walletClient.deployContract({
  abi: abiContract.abi,
  bytecode: `0x${abiContract.evm.bytecode.object}`,
  args: [],
});

console.log('Tx hash:', hash);
console.log('Waiting for receipt...');
const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (!receipt.contractAddress) {
  console.error('Error: contractAddress not in receipt.');
  process.exit(1);
}

const abiAddress = receipt.contractAddress;
console.log('');
console.log('StreamCoreEthAbi deployed at:', abiAddress);
console.log('Block:', receipt.blockNumber.toString());

// ── Update .env ────────────────────────────────────────────────────────────
let envContent = readFileSync(envPath, 'utf8');
const abiLine = `STREAM_CORE_ETH_ABI="${abiAddress}"`;

if (envContent.includes('STREAM_CORE_ETH_ABI=')) {
  envContent = envContent.replace(/STREAM_CORE_ETH_ABI=.*/, abiLine);
} else {
  envContent += `\n${abiLine}\n`;
}
writeFileSync(envPath, envContent);
console.log(`Updated ${envPath}: STREAM_CORE_ETH_ABI="${abiAddress}"`);

// ── Update deploy-state.json ───────────────────────────────────────────────
const stateFile = resolve(ROOT, 'deploy-state.json');
let state = {};
try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
state['stream-core-eth-abi'] = {
  address: abiAddress,
  network: 'vara-eth-hoodi',
  deployedAt: new Date().toISOString(),
  txHash: hash,
};
writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('Saved to deploy-state.json');

console.log('');
console.log('=== Done ===');
console.log('Next: bash scripts/deploy-eth.sh   (upload WASM + create-with-abi)');

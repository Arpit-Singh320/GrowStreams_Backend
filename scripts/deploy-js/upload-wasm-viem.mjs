#!/usr/bin/env node
/**
 * upload-wasm-viem.mjs
 * Upload WASM to Vara.eth via EIP-4844 blob transaction using viem
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';
import { createPublicClient, createWalletClient, http, parseGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { kzg } from 'viem';
import * as cKzg from 'c-kzg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const envPath = existsSync(resolve(ROOT, 'api/.env'))
  ? resolve(ROOT, 'api/.env')
  : resolve(ROOT, '.env');
loadEnv({ path: envPath });

const required = ['ETH_PRIVATE_KEY', 'VARA_ETH_RPC', 'VARA_ETH_CHAIN_ID', 'VARA_ETH_ROUTER'];
for (const k of required) {
  if (!process.env[k]) { console.error(`Error: ${k} not set in .env`); process.exit(1); }
}

const { ETH_PRIVATE_KEY, VARA_ETH_RPC, VARA_ETH_CHAIN_ID, VARA_ETH_ROUTER } = process.env;
const chainId = parseInt(VARA_ETH_CHAIN_ID, 10);
const networkName = process.env.VARA_ETH_NETWORK_NAME || (chainId === 1 ? 'Ethereum Mainnet' : `Vara.eth chain ${chainId}`);

const targetChain = {
  id: chainId,
  name: networkName,
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [VARA_ETH_RPC] } },
};

const account = privateKeyToAccount(
  ETH_PRIVATE_KEY.startsWith('0x') ? ETH_PRIVATE_KEY : `0x${ETH_PRIVATE_KEY}`
);

const publicClient = createPublicClient({ chain: targetChain, transport: http(VARA_ETH_RPC) });
const walletClient = createWalletClient({ 
  account, 
  chain: targetChain, 
  transport: http(VARA_ETH_RPC),
  kzg: cKzg
});

console.log('=== Upload WASM to Vara.eth via EIP-4844 blob ===');
console.log('Network :', networkName, `(chainId ${chainId})`);
console.log('Router  :', VARA_ETH_ROUTER);
console.log('Sender  :', account.address);
console.log('');

// Read WASM file
const wasmPath = resolve(ROOT, 'contracts/vara-eth/target/wasm32v1-none/wasm32-gear/release/stream_core_eth.opt.wasm');
if (!existsSync(wasmPath)) {
  console.error('Error: WASM file not found at:', wasmPath);
  process.exit(1);
}

const wasmBytes = readFileSync(wasmPath);
console.log('WASM size:', wasmBytes.length, 'bytes');

// Pad to 131072 bytes (EIP-4844 blob size)
const BLOB_SIZE = 131072;
const blobData = new Uint8Array(BLOB_SIZE);
blobData.set(wasmBytes);
console.log('Blob size:', blobData.length, 'bytes (padded)');

// Router ABI for requestCodeValidation
const ROUTER_ABI = [
  {
    type: 'function',
    name: 'requestCodeValidation',
    inputs: [{ name: 'blobTxHash', type: 'bytes32' }],
    outputs: [{ name: 'codeId', type: 'bytes32' }],
    stateMutability: 'payable',
  },
];

console.log('');
console.log('Sending EIP-4844 blob transaction...');
console.log('This will cost ~0.002 ETH for blob gas + 1,500 wVARA validation fee');
console.log('');

try {
  // Send blob transaction
  // The blob itself carries the WASM data
  // We call requestCodeValidation with the blob tx hash
  
  const hash = await walletClient.sendTransaction({
    to: VARA_ETH_ROUTER,
    data: '0x', // Empty calldata — blob carries the WASM
    blobs: [blobData],
    kzg: cKzg,
    maxFeePerBlobGas: parseGwei('30'), // 30 gwei blob gas
  });

  console.log('Blob tx hash:', hash);
  console.log('Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Block:', receipt.blockNumber.toString());
  console.log('Status:', receipt.status === 'success' ? 'Success' : 'Failed');

  if (receipt.status !== 'success') {
    console.error('Transaction failed');
    process.exit(1);
  }

  // Now call requestCodeValidation with the blob tx hash
  console.log('');
  console.log('Requesting code validation...');
  
  const validationHash = await walletClient.writeContract({
    address: VARA_ETH_ROUTER,
    abi: ROUTER_ABI,
    functionName: 'requestCodeValidation',
    args: [hash],
  });

  console.log('Validation tx:', validationHash);
  const validationReceipt = await publicClient.waitForTransactionReceipt({ hash: validationHash });
  
  // Extract codeId from logs
  const codeId = validationReceipt.logs[0]?.topics[1] || '0x0';
  
  console.log('');
  console.log('Code ID:', codeId);

  // Update .env
  let envContent = readFileSync(envPath, 'utf8');
  envContent = envContent.replace(
    /^STREAM_CORE_ETH_CODE_ID=.*$/m,
    `STREAM_CORE_ETH_CODE_ID=${codeId}`
  );
  writeFileSync(envPath, envContent);
  console.log(`Updated ${envPath}: STREAM_CORE_ETH_CODE_ID="${codeId}"`);

  // Update deploy-state.json
  const stateFile = resolve(ROOT, 'deploy-state.json');
  let state = {};
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
  state['stream-core-eth'] = {
    ...(state['stream-core-eth'] || {}),
    codeId,
    network: chainId === 1 ? 'ethereum-mainnet' : `vara-eth-${chainId}`,
    uploadedAt: new Date().toISOString(),
    blobTxHash: hash,
    validationTxHash: validationHash,
  };
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log('Saved to deploy-state.json');

  console.log('');
  console.log('=== Upload complete ===');
  console.log('Next: node scripts/deploy-js/create-program.mjs');

} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}

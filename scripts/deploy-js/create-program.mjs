#!/usr/bin/env node
/**
 * create-program.mjs
 *
 * Calls Router.createProgramWithAbiInterface(codeId, salt, 0x0, abiInterface)
 * directly via viem — no ethexe binary required for this step.
 *
 * Run AFTER: node scripts/deploy-js/upload-wasm.mjs (STREAM_CORE_ETH_CODE_ID set)
 *
 * Usage:
 *   node scripts/deploy-js/create-program.mjs
 *
 * Required .env vars:
 *   ETH_PRIVATE_KEY        — deployer private key
 *   ETH_ADDRESS            — deployer EVM address
 *   VARA_ETH_RPC           — https://hoodi-reth-rpc.gear-tech.io
 *   VARA_ETH_CHAIN_ID      — 560048
 *   VARA_ETH_ROUTER        — Hoodi Router contract address
 *   STREAM_CORE_ETH_CODE_ID — from upload-wasm.mjs
 *   STREAM_CORE_ETH_ABI    — from compile-escrow.mjs
 *
 * On success writes STREAM_CORE_ETH_MIRROR and STREAM_CORE_ETH_PROGRAM_ID to .env.
 */

import { createWalletClient, createPublicClient, http, parseEventLogs } from 'viem';
import { randomBytes } from 'crypto';
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

const required = [
  'ETH_PRIVATE_KEY', 'VARA_ETH_RPC', 'VARA_ETH_CHAIN_ID',
  'VARA_ETH_ROUTER', 'STREAM_CORE_ETH_CODE_ID', 'STREAM_CORE_ETH_ABI',
];
for (const k of required) {
  if (!process.env[k]) { console.error(`Error: ${k} not set in .env`); process.exit(1); }
}

const {
  ETH_PRIVATE_KEY, VARA_ETH_RPC, VARA_ETH_CHAIN_ID,
  VARA_ETH_ROUTER, STREAM_CORE_ETH_CODE_ID, STREAM_CORE_ETH_ABI,
} = process.env;

const chainId = parseInt(VARA_ETH_CHAIN_ID, 10);

const ROUTER_ABI = [
  {
    type: 'function',
    name: 'createProgramWithAbiInterface',
    inputs: [
      { name: 'codeId',              type: 'bytes32' },
      { name: 'salt',                type: 'bytes32' },
      { name: 'overrideInitializer', type: 'address' },
      { name: 'abiInterface',        type: 'address' },
    ],
    outputs: [{ name: 'mirror', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'ProgramCreated',
    inputs: [
      { name: 'actorId', type: 'address', indexed: false },
      { name: 'codeId',  type: 'bytes32', indexed: true  },
    ],
  },
];

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
const publicClient  = createPublicClient({ chain: targetChain, transport: http(VARA_ETH_RPC) });
const walletClient  = createWalletClient({ account, chain: targetChain, transport: http(VARA_ETH_RPC) });

// Random salt — deterministic program address per (codeId, salt)
const salt = `0x${randomBytes(32).toString('hex')}`;

console.log('=== Create stream-core-eth program with ABI interface ===');
console.log('Router   :', VARA_ETH_ROUTER);
console.log('CodeId   :', STREAM_CORE_ETH_CODE_ID);
console.log('ABI      :', STREAM_CORE_ETH_ABI);
console.log('Salt     :', salt);
console.log('Sender   :', account.address);
console.log('');

const hash = await walletClient.writeContract({
  address: VARA_ETH_ROUTER,
  abi: ROUTER_ABI,
  functionName: 'createProgramWithAbiInterface',
  args: [
    STREAM_CORE_ETH_CODE_ID,
    salt,
    '0x0000000000000000000000000000000000000000', // overrideInitializer = 0 → msg.sender
    STREAM_CORE_ETH_ABI,
  ],
});

console.log('Tx hash:', hash);
console.log('Waiting for receipt...');
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log('Block:', receipt.blockNumber.toString());

// Parse ProgramCreated event to get mirror address
let mirrorAddr = '';
try {
  const logs = parseEventLogs({ abi: ROUTER_ABI, logs: receipt.logs, eventName: 'ProgramCreated' });
  if (logs.length > 0) mirrorAddr = logs[0].args.actorId;
} catch {}

// Fallback: last 0x address in receipt logs
if (!mirrorAddr) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== VARA_ETH_ROUTER.toLowerCase()) {
      mirrorAddr = log.address;
    }
  }
}

if (!mirrorAddr) {
  console.error('Could not parse Mirror address from ProgramCreated event.');
  console.error('Check the tx on Hoodi explorer and set STREAM_CORE_ETH_MIRROR manually.');
  console.error('Tx:', hash);
  process.exit(1);
}

// Mirror address IS the program ID on Vara.eth (actorId == mirror address)
const programId = mirrorAddr;

console.log('');
console.log('=== Program created ===');
console.log('Mirror / Program ID:', mirrorAddr);
console.log('');

// Write to .env
let envContent = readFileSync(envPath, 'utf8');
const updates = {
  STREAM_CORE_ETH_MIRROR: mirrorAddr,
  STREAM_CORE_ETH_PROGRAM_ID: programId,
};
for (const [key, val] of Object.entries(updates)) {
  const line = `${key}=${val}`;
  if (new RegExp(`^${key}=`, 'm').test(envContent)) {
    envContent = envContent.replace(new RegExp(`^${key}=.*`, 'm'), line);
  } else {
    envContent += `\n${line}\n`;
  }
}
writeFileSync(envPath, envContent);
console.log('Written STREAM_CORE_ETH_MIRROR and STREAM_CORE_ETH_PROGRAM_ID to .env');

// Write to deploy-state.json
const stateFile = resolve(ROOT, 'deploy-state.json');
let state = {};
try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
state['stream-core-eth'] = {
  ...(state['stream-core-eth'] || {}),
  programId,
  mirror: mirrorAddr,
  abiContract: STREAM_CORE_ETH_ABI,
  salt,
  network: chainId === 1 ? 'ethereum-mainnet' : `vara-eth-${chainId}`,
  createdAt: new Date().toISOString(),
  createTxHash: hash,
};
writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('Saved to deploy-state.json');
console.log('');
console.log('Next steps:');
console.log('  1. node scripts/deploy-js/topup-balance.mjs       (top up wVARA executable balance)');
console.log('  2. node scripts/deploy-js/init-stream-core-eth.mjs (send Initialize message)');
console.log('  3. node scripts/deploy-js/deploy-eth.mjs           (deploy StreamEscrow.sol)');

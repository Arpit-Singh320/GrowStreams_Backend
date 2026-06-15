#!/usr/bin/env node
/**
 * init-stream-core-eth.mjs
 *
 * Calls the StreamCoreEthAbi.initialize() on Vara.eth (Hoodi) to initialise
 * the deployed stream-core-eth program.
 *
 * The ABI contract forwards the call to the Mirror which delivers it to the
 * Vara.eth runtime — no raw SCALE encoding needed.
 *
 * Run AFTER:
 *   - node scripts/deploy-js/topup-balance.mjs  (wVARA executable balance topped up)
 *
 * Usage:
 *   node scripts/deploy-js/init-stream-core-eth.mjs
 *
 * Required .env vars:
 *   ETH_PRIVATE_KEY         — deployer wallet private key
 *   VARA_ETH_RPC            — https://hoodi-reth-rpc.gear-tech.io
 *   VARA_ETH_CHAIN_ID       — 560048
 *   STREAM_CORE_ETH_ABI     — ABI contract address from compile-escrow.mjs
 *   ETH_ADDRESS             — deployer EVM address (becomes admin)
 *
 * Optional:
 *   MIN_BUFFER_SECONDS      — default 3600 (1 hour)
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

const required = [
  'ETH_PRIVATE_KEY', 'VARA_ETH_RPC', 'VARA_ETH_CHAIN_ID',
  'STREAM_CORE_ETH_ABI', 'ETH_ADDRESS',
];
for (const k of required) {
  if (!process.env[k]) { console.error(`Error: ${k} not set in .env`); process.exit(1); }
}

const {
  ETH_PRIVATE_KEY, VARA_ETH_RPC, VARA_ETH_CHAIN_ID,
  STREAM_CORE_ETH_ABI, ETH_ADDRESS,
} = process.env;

const chainId = parseInt(VARA_ETH_CHAIN_ID, 10);
const MIN_BUFFER_SECONDS = parseInt(process.env.MIN_BUFFER_SECONDS || '3600', 10);

// Admin: EVM address padded to uint8[32] (big-endian, left-padded with zeros)
// EVM address is 20 bytes → bytes32 = 12 zero bytes + 20 addr bytes
const adminHex = ETH_ADDRESS.startsWith('0x') ? ETH_ADDRESS.slice(2) : ETH_ADDRESS;
const adminPadded = '00'.repeat(12) + adminHex.toLowerCase();
const adminArr = Array.from(Buffer.from(adminPadded, 'hex')); // uint8[32]

// StreamCoreEthAbi.initialize(bool _callReply, uint8[32] admin, uint64 minBufferSeconds)
const ABI_INITIALIZE = [
  {
    type: 'function',
    name: 'initialize',
    inputs: [
      { name: '_callReply',       type: 'bool'       },
      { name: 'admin',            type: 'uint8[32]'  },
      { name: 'minBufferSeconds', type: 'uint64'     },
    ],
    outputs: [{ name: 'messageId', type: 'bytes32' }],
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

console.log('=== Initialize stream-core-eth via ABI contract ===');
console.log('ABI contract     :', STREAM_CORE_ETH_ABI);
console.log('Admin (EVM addr) :', ETH_ADDRESS);
console.log('MinBufferSeconds :', MIN_BUFFER_SECONDS);
console.log('Sender           :', account.address);
console.log('');

const hash = await walletClient.writeContract({
  address: STREAM_CORE_ETH_ABI,
  abi: ABI_INITIALIZE,
  functionName: 'initialize',
  args: [
    false,              // _callReply: false (fire-and-forget, no callback needed)
    adminArr,           // admin: uint8[32]
    MIN_BUFFER_SECONDS, // minBufferSeconds: uint64
  ],
});

console.log('Tx hash:', hash);
console.log('Waiting for receipt...');
const receipt = await publicClient.waitForTransactionReceipt({ hash });

console.log('');
console.log('=== Initialize tx confirmed ===');
console.log('Block    :', receipt.blockNumber.toString());
console.log('Gas used :', receipt.gasUsed.toString());
console.log('Status   :', receipt.status);
console.log('');
console.log('The Vara.eth runtime will process this in the next committed batch.');
console.log('');

// Save to deploy-state.json
const stateFile = resolve(ROOT, 'deploy-state.json');
let state = {};
try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
if (state['stream-core-eth']) {
  state['stream-core-eth'].initializedAt = new Date().toISOString();
  state['stream-core-eth'].initTxHash = hash;
  state['stream-core-eth'].admin = ETH_ADDRESS;
  state['stream-core-eth'].minBufferSeconds = MIN_BUFFER_SECONDS.toString();
} else {
  state['stream-core-eth-init'] = {
    txHash: hash,
    admin: ETH_ADDRESS,
    minBufferSeconds: MIN_BUFFER_SECONDS.toString(),
    initializedAt: new Date().toISOString(),
  };
}
writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('Saved to deploy-state.json');
console.log('');
console.log('Next: node scripts/deploy-js/deploy-eth.mjs   (deploy StreamEscrow.sol)');

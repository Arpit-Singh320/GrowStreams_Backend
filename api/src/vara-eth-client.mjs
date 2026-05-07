/**
 * Vara.eth client — viem-based interactions with Vara.eth programs via Mirror/ABI interface.
 *
 * Skill reference: vara-eth-app-builder (TypeScript flow, Mirror interaction)
 * Network reference: varaeth-extension-notes.md (Hoodi testnet)
 *
 * Required env vars:
 *   VARA_ETH_RPC             — Vara.eth JSON-RPC endpoint (default: Hoodi testnet)
 *   VARA_ETH_CHAIN_ID        — Chain ID as integer (default: 560048 for Hoodi)
 *   ETH_PRIVATE_KEY          — Private key (0x...) for the relayer/admin wallet
 *   STREAM_CORE_ETH_MIRROR   — Mirror address of the stream-core-eth Vara.eth program
 *   STREAM_ESCROW_ADDRESS    — Deployed StreamEscrow.sol address (set after deploy-eth.mjs)
 *   VARA_ETH_QUEST_SEEDS_MIRROR — Mirror address of the questSeeds Vara.eth program (optional)
 */

import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ---------------------------------------------------------------------------
// Vara.eth Hoodi testnet chain definition
// ---------------------------------------------------------------------------
const VARA_ETH_RPC = process.env.VARA_ETH_RPC || 'https://hoodi-reth-rpc.gear-tech.io';
const VARA_ETH_CHAIN_ID = parseInt(process.env.VARA_ETH_CHAIN_ID || '560048', 10);

const varaEthChain = defineChain({
  id: VARA_ETH_CHAIN_ID,
  name: 'Vara.eth Hoodi',
  nativeCurrency: { name: 'Hoodi Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [VARA_ETH_RPC] },
  },
  blockExplorers: {
    default: { name: 'Hoodi Etherscan', url: 'https://hoodi.etherscan.io' },
  },
});

// ---------------------------------------------------------------------------
// Minimal Mirror ABI for sendMessage (Gear/Vara.eth Mirror contract)
// Mirror exposes sendMessage(payload, valueToProgram) and state read helpers.
// ---------------------------------------------------------------------------
const MIRROR_ABI = [
  {
    inputs: [
      { internalType: 'bytes', name: 'payload', type: 'bytes' },
      { internalType: 'uint128', name: 'value', type: 'uint128' },
    ],
    name: 'sendMessage',
    outputs: [{ internalType: 'bytes32', name: 'messageId', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'executableBalance',
    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'stateHash',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// ---------------------------------------------------------------------------
// Client singletons
// ---------------------------------------------------------------------------
let publicClient = null;
let walletClient = null;
let relayerAccount = null;

function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({ chain: varaEthChain, transport: http(VARA_ETH_RPC) });
  }
  return publicClient;
}

function getWalletClient() {
  if (walletClient) return walletClient;

  const relayerKey = process.env.ETH_PRIVATE_KEY;
  if (!relayerKey) {
    throw new Error('[vara-eth] ETH_PRIVATE_KEY not set — cannot send transactions');
  }

  relayerAccount = privateKeyToAccount(relayerKey);
  walletClient = createWalletClient({
    account: relayerAccount,
    chain: varaEthChain,
    transport: http(VARA_ETH_RPC),
  });

  console.log(`[vara-eth] Relayer account: ${relayerAccount.address}`);
  return walletClient;
}

// ---------------------------------------------------------------------------
// Encode a Sails payload manually for the SeedsService.Mint call.
// Vara.eth Mirror.sendMessage takes raw SCALE-encoded Sails payloads as bytes.
//
// Sails wire format: SCALE(service_name) + SCALE(method_name) + SCALE(args...)
// For "SeedsService" "Mint" (to: [u8;32], amount: u128, reason: String):
//   - service: "SeedsService"
//   - method:  "Mint"
//   - args:    (to as bytes32, amount as u128 LE, reason as SCALE string)
//
// Note: This is a best-effort helper. Verify against the actual generated IDL
// before using in production. Use sails-js IDL v2 parser for type-safe encoding.
// ---------------------------------------------------------------------------
function encodeScaleString(str) {
  const bytes = Buffer.from(str, 'utf8');
  const len = bytes.length;
  // SCALE compact encoding for length
  const compact = Buffer.alloc(len < 64 ? 1 : len < 16384 ? 2 : 4);
  if (len < 64) compact.writeUInt8(len << 2, 0);
  else if (len < 16384) compact.writeUInt16LE((len << 2) | 1, 0);
  else compact.writeUInt32LE((len << 2) | 2, 0);
  return Buffer.concat([compact, bytes]);
}

function encodeU128Le(value) {
  const buf = Buffer.alloc(16);
  const bigVal = BigInt(value);
  buf.writeBigUInt64LE(bigVal & BigInt('0xFFFFFFFFFFFFFFFF'), 0);
  buf.writeBigUInt64LE(bigVal >> BigInt(64), 8);
  return buf;
}

function encodeSailsPayload(service, method, ...argBuffers) {
  const parts = [
    encodeScaleString(service),
    encodeScaleString(method),
    ...argBuffers,
  ];
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// mintSeedsEvm — mint Seeds to a 0x address via Vara.eth questSeeds Mirror
// ---------------------------------------------------------------------------
export async function mintSeedsEvm(evmAddress, amount, reason) {
  const mirrorAddr = process.env.VARA_ETH_QUEST_SEEDS_MIRROR;
  if (!mirrorAddr) {
    throw new Error('[vara-eth] VARA_ETH_QUEST_SEEDS_MIRROR not configured — skipping EVM mint');
  }

  // Pad 20-byte EVM address to 32 bytes (ActorId) for Sails [u8; 32] param
  const addrBytes = Buffer.from(evmAddress.replace(/^0x/, '').padStart(64, '0'), 'hex');
  const amountBytes = encodeU128Le(amount);
  const reasonBytes = encodeScaleString(reason);

  const payload = encodeSailsPayload('SeedsService', 'Mint', addrBytes, amountBytes, reasonBytes);

  const client = getWalletClient();

  const txHash = await client.writeContract({
    address: mirrorAddr,
    abi: MIRROR_ABI,
    functionName: 'sendMessage',
    args: ['0x' + payload.toString('hex'), BigInt(0)],
    value: BigInt(0),
  });

  console.log(`[vara-eth] Seeds mint sent: txHash=${txHash}`);
  return { txHash };
}

// ---------------------------------------------------------------------------
// checkStreamExists — query Vara.eth streamCore Mirror state for a given sender
// Used by quest-stream-monitor to verify ONCHAIN_STREAM quest for EVM users.
// ---------------------------------------------------------------------------
// ABI for the generated StreamCoreEth interface (read-only methods called on Mirror)
const STREAM_CORE_ETH_ABI = [
  {
    inputs: [{ internalType: 'bytes32', name: 'sender', type: 'bytes32' }],
    name: 'StreamServiceGetSenderStreams',
    outputs: [{ internalType: 'uint64[]', name: '', type: 'uint64[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint64', name: 'streamId', type: 'uint64' }],
    name: 'StreamServiceStreamExists',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint64', name: 'streamId', type: 'uint64' }, { internalType: 'uint64', name: 'nowSecs', type: 'uint64' }],
    name: 'StreamServiceWithdrawableBalance',
    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * checkStreamExists — returns true if the EVM address has at least one stream
 * registered in the stream-core-eth program.
 * Queries via the generated ABI interface on the Mirror address.
 */
export async function checkStreamExists(evmAddress) {
  const mirrorAddr = process.env.STREAM_CORE_ETH_MIRROR;
  if (!mirrorAddr) {
    console.warn('[vara-eth] STREAM_CORE_ETH_MIRROR not configured — stream check skipped');
    return false;
  }

  const client = getPublicClient();

  // Pad 20-byte EVM address to bytes32 (Vara.eth ActorId format)
  const senderBytes32 = `0x${evmAddress.replace(/^0x/, '').padStart(64, '0')}`;

  const streams = await client.readContract({
    address: mirrorAddr,
    abi: STREAM_CORE_ETH_ABI,
    functionName: 'StreamServiceGetSenderStreams',
    args: [senderBytes32],
  });

  return Array.isArray(streams) && streams.length > 0;
}

// ---------------------------------------------------------------------------
// getRelayerBalance — check relayer ETH balance for gas health monitoring
// ---------------------------------------------------------------------------
export async function getRelayerBalance() {
  const relayerKey = process.env.ETH_PRIVATE_KEY;
  if (!relayerKey) return null;

  const account = privateKeyToAccount(relayerKey);
  const client = getPublicClient();
  const balance = await client.getBalance({ address: account.address });
  return { address: account.address, balanceWei: balance.toString() };
}

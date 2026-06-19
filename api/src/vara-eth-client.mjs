/**
 * Vara.eth client — viem-based interactions with Vara.eth programs via Mirror/ABI interface.
 *
 * Skill reference: vara-eth-app-builder (TypeScript flow, Mirror interaction)
 * Network reference: varaeth-extension-notes.md (Hoodi testnet)
 *
 * Required env vars:
 *   VARA_ETH_RPC             — Vara.eth JSON-RPC endpoint (default: Ethereum mainnet)
 *   VARA_ETH_CHAIN_ID        — Chain ID as integer (default: 1 for Ethereum mainnet)
 *   ETH_PRIVATE_KEY          — Private key (0x...) for the relayer/admin wallet
 *   STREAM_CORE_ETH_MIRROR   — Mirror address of the stream-core-eth Vara.eth program
 *   STREAM_ESCROW_ADDRESS    — Deployed StreamEscrow.sol address (set after deploy-eth.mjs)
 *   VARA_ETH_QUEST_SEEDS_MIRROR — Mirror address of the questSeeds Vara.eth program (optional)
 */

import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ---------------------------------------------------------------------------
// Vara.eth chain definition (Ethereum Mainnet)
// ---------------------------------------------------------------------------
const VARA_ETH_RPC = process.env.VARA_ETH_RPC || 'https://mainnet-reth-rpc.gear-tech.io';
const VARA_ETH_CHAIN_ID = parseInt(process.env.VARA_ETH_CHAIN_ID || '1', 10);
const VARA_ETH_NETWORK_NAME = process.env.VARA_ETH_NETWORK_NAME || (VARA_ETH_CHAIN_ID === 1 ? 'Ethereum Mainnet' : `Vara.eth chain ${VARA_ETH_CHAIN_ID}`);

const varaEthChain = defineChain({
  id: VARA_ETH_CHAIN_ID,
  name: VARA_ETH_NETWORK_NAME,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [VARA_ETH_RPC] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://etherscan.io' },
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

// ---------------------------------------------------------------------------
// ERC-20 ABI (minimal — used for token approve + balanceOf)
// ---------------------------------------------------------------------------
const ERC20_ABI = [
  {
    type: 'function', name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'allowance',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'approve',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'decimals',
    inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view',
  },
];

// ---------------------------------------------------------------------------
// StreamEscrow ABI (deposit, withdraw, stop, claimable)
// ---------------------------------------------------------------------------
const STREAM_ESCROW_ABI = [
  {
    type: 'function', name: 'deposit',
    inputs: [
      { name: 'receiverBytes32', type: 'bytes32' },
      { name: 'flowRate',        type: 'uint128' },
      { name: 'amount',          type: 'uint128' },
    ],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'addDeposit',
    inputs: [{ name: 'streamId', type: 'uint64' }, { name: 'amount', type: 'uint128' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'withdraw',
    inputs: [{ name: 'streamId', type: 'uint64' }, { name: 'amount', type: 'uint128' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'stopStream',
    inputs: [{ name: 'streamId', type: 'uint64' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'claim',
    inputs: [], outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'claimable',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'streamDepositor',
    inputs: [{ name: 'streamId', type: 'uint64' }],
    outputs: [{ type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'token',
    inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'streamCoreAbi',
    inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'event', name: 'StreamPending',
    inputs: [
      { name: 'messageId', type: 'bytes32', indexed: true },
      { name: 'sender',    type: 'address', indexed: true },
      { name: 'receiver',  type: 'address', indexed: true },
      { name: 'amount',    type: 'uint128', indexed: false },
    ],
  },
  {
    type: 'event', name: 'StreamCreated',
    inputs: [
      { name: 'messageId', type: 'bytes32', indexed: true },
      { name: 'streamId',  type: 'uint64',  indexed: true },
      { name: 'sender',    type: 'address', indexed: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// StreamCoreEthAbi — read-only queries (streamServiceGet*)
// ---------------------------------------------------------------------------
const STREAM_CORE_READ_ABI = [
  {
    type: 'function', name: 'streamServiceGetSenderStreams',
    inputs: [{ name: '_callReply', type: 'bool' }, { name: 'sender', type: 'uint8[32]' }],
    outputs: [{ name: 'messageId', type: 'bytes32' }], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'streamServiceTotalStreams',
    inputs: [{ name: '_callReply', type: 'bool' }],
    outputs: [{ name: 'messageId', type: 'bytes32' }], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'streamServiceActiveStreams',
    inputs: [{ name: '_callReply', type: 'bool' }],
    outputs: [{ name: 'messageId', type: 'bytes32' }], stateMutability: 'nonpayable',
  },
];

// ---------------------------------------------------------------------------
// Helper: pad 0x EVM address to bytes32 uint8[32] array
// ---------------------------------------------------------------------------
function evmAddressToUint8Array32(addr) {
  const hex = addr.replace(/^0x/, '').toLowerCase();
  const padded = hex.padStart(64, '0');
  return Array.from(Buffer.from(padded, 'hex'));
}

// ---------------------------------------------------------------------------
// getEscrowTokenBalance — token balance of an EVM address
// ---------------------------------------------------------------------------
export async function getEscrowTokenBalance(evmAddress) {
  const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
  const tokenAddr  = process.env.VARA_ETH_TOKEN;
  if (!escrowAddr || !tokenAddr) return null;

  const client = getPublicClient();
  const [balance, decimals] = await Promise.all([
    client.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [evmAddress] }),
    client.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'decimals' }),
  ]);
  return { balance: balance.toString(), decimals: Number(decimals), token: tokenAddr };
}

// ---------------------------------------------------------------------------
// getClaimableBalance — unclaimed refunds in StreamEscrow for an address
// ---------------------------------------------------------------------------
export async function getClaimableBalance(evmAddress) {
  const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
  if (!escrowAddr) return '0';

  const client = getPublicClient();
  const amount = await client.readContract({
    address: escrowAddr, abi: STREAM_ESCROW_ABI,
    functionName: 'claimable', args: [evmAddress],
  });
  return amount.toString();
}

// ---------------------------------------------------------------------------
// getEscrowInfo — static config read from StreamEscrow
// ---------------------------------------------------------------------------
export async function getEscrowInfo() {
  const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
  if (!escrowAddr) return null;

  const client = getPublicClient();
  const [token, abiContract] = await Promise.all([
    client.readContract({ address: escrowAddr, abi: STREAM_ESCROW_ABI, functionName: 'token' }),
    client.readContract({ address: escrowAddr, abi: STREAM_ESCROW_ABI, functionName: 'streamCoreAbi' }),
  ]);
  return {
    escrow:      escrowAddr,
    token,
    abiContract,
    mirror:      process.env.STREAM_CORE_ETH_MIRROR,
    chainId:     VARA_ETH_CHAIN_ID,
    rpc:         VARA_ETH_RPC,
    network:     VARA_ETH_CHAIN_ID === 1 ? 'ethereum-mainnet' : `vara-eth-${VARA_ETH_CHAIN_ID}`,
  };
}

// ---------------------------------------------------------------------------
// depositAndCreateStream — approve + call StreamEscrow.deposit
// Called server-side via relayer wallet.
// ---------------------------------------------------------------------------
export async function depositAndCreateStream({ receiverEvmAddress, flowRate, amount }) {
  const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
  const tokenAddr  = process.env.VARA_ETH_TOKEN;
  if (!escrowAddr || !tokenAddr) {
    throw new Error('[vara-eth] STREAM_ESCROW_ADDRESS or VARA_ETH_TOKEN not configured');
  }

  const wallet = getWalletClient();
  const client = getPublicClient();

  // receiver as bytes32
  const receiverBytes32 = `0x${receiverEvmAddress.replace(/^0x/, '').padStart(64, '0')}`;

  // Step 1: approve escrow to spend token
  const approveTx = await wallet.writeContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'approve',
    args: [escrowAddr, BigInt(amount)],
  });
  await client.waitForTransactionReceipt({ hash: approveTx });

  // Step 2: deposit + create stream
  const depositTx = await wallet.writeContract({
    address: escrowAddr, abi: STREAM_ESCROW_ABI, functionName: 'deposit',
    args: [receiverBytes32, BigInt(flowRate), BigInt(amount)],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: depositTx });

  // Parse StreamPending event for messageId
  const pendingLog = receipt.logs.find(l =>
    l.address.toLowerCase() === escrowAddr.toLowerCase() &&
    l.topics[0] === '0x' + Buffer.from('StreamPending(bytes32,address,address,uint128)').toString('hex').slice(0, 64)
  );

  return {
    approveTxHash: approveTx,
    depositTxHash: depositTx,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status,
    messageId: pendingLog?.topics?.[1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// addDepositToStream — approve + call StreamEscrow.addDeposit
// ---------------------------------------------------------------------------
export async function addDepositToStream({ streamId, amount }) {
  const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
  const tokenAddr  = process.env.VARA_ETH_TOKEN;
  if (!escrowAddr || !tokenAddr) {
    throw new Error('[vara-eth] STREAM_ESCROW_ADDRESS or VARA_ETH_TOKEN not configured');
  }

  const wallet = getWalletClient();
  const client = getPublicClient();

  const approveTx = await wallet.writeContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'approve',
    args: [escrowAddr, BigInt(amount)],
  });
  await client.waitForTransactionReceipt({ hash: approveTx });

  const tx = await wallet.writeContract({
    address: escrowAddr, abi: STREAM_ESCROW_ABI, functionName: 'addDeposit',
    args: [BigInt(streamId), BigInt(amount)],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  return { txHash: tx, blockNumber: receipt.blockNumber.toString(), status: receipt.status };
}

// ---------------------------------------------------------------------------
// withdrawFromStream — call StreamEscrow.withdraw
// ---------------------------------------------------------------------------
export async function withdrawFromStream({ streamId, amount }) {
  const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
  if (!escrowAddr) throw new Error('[vara-eth] STREAM_ESCROW_ADDRESS not configured');

  const wallet = getWalletClient();
  const client = getPublicClient();

  const tx = await wallet.writeContract({
    address: escrowAddr, abi: STREAM_ESCROW_ABI, functionName: 'withdraw',
    args: [BigInt(streamId), BigInt(amount)],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  return { txHash: tx, blockNumber: receipt.blockNumber.toString(), status: receipt.status };
}

// ---------------------------------------------------------------------------
// stopEvmStream — call StreamEscrow.stopStream
// ---------------------------------------------------------------------------
export async function stopEvmStream({ streamId }) {
  const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
  if (!escrowAddr) throw new Error('[vara-eth] STREAM_ESCROW_ADDRESS not configured');

  const wallet = getWalletClient();
  const client = getPublicClient();

  const tx = await wallet.writeContract({
    address: escrowAddr, abi: STREAM_ESCROW_ABI, functionName: 'stopStream',
    args: [BigInt(streamId)],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  return { txHash: tx, blockNumber: receipt.blockNumber.toString(), status: receipt.status };
}

// ---------------------------------------------------------------------------
// claimEscrowRefund — call StreamEscrow.claim for refunded tokens
// ---------------------------------------------------------------------------
export async function claimEscrowRefund() {
  const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
  if (!escrowAddr) throw new Error('[vara-eth] STREAM_ESCROW_ADDRESS not configured');

  const wallet = getWalletClient();
  const client = getPublicClient();

  const tx = await wallet.writeContract({
    address: escrowAddr, abi: STREAM_ESCROW_ABI, functionName: 'claim', args: [],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  return { txHash: tx, blockNumber: receipt.blockNumber.toString(), status: receipt.status };
}

// ---------------------------------------------------------------------------
// getStreamDepositor — who owns a given streamId in the escrow
// ---------------------------------------------------------------------------
export async function getStreamDepositor(streamId) {
  const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
  if (!escrowAddr) return null;

  const client = getPublicClient();
  const addr = await client.readContract({
    address: escrowAddr, abi: STREAM_ESCROW_ABI,
    functionName: 'streamDepositor', args: [BigInt(streamId)],
  });
  return addr;
}

// ---------------------------------------------------------------------------
// getWvaraBalance — wVARA balance of any address (from Router's wVARA contract)
// ---------------------------------------------------------------------------
export async function getWvaraBalance(evmAddress) {
  const routerAddr = process.env.VARA_ETH_ROUTER;
  if (!routerAddr) return null;

  const ROUTER_ABI = [{
    type: 'function', name: 'wrappedVara', inputs: [],
    outputs: [{ type: 'address' }], stateMutability: 'view',
  }];

  const client = getPublicClient();
  const wvaraAddr = await client.readContract({ address: routerAddr, abi: ROUTER_ABI, functionName: 'wrappedVara' });
  const balance = await client.readContract({ address: wvaraAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [evmAddress] });
  return { address: evmAddress, wvaraAddress: wvaraAddr, balance: balance.toString(), decimals: 12 };
}

// Bridge Service — ETH ↔ Vara bridge info, route resolution, fee estimation, and tx tracking
// Supports bridging ERC-20 tokens from Ethereum mainnet to wrapped VFT tokens on Vara

import { SUPPORTED_TOKENS, getToken, getTokenByEthAddress, getTokenByVaraAddress, listTokens } from '../config/tokens.mjs';
import { toDisplayUnits, toBaseUnits } from '../utils/decimals.mjs';
import { query, queryOne, queryAll } from './db.mjs';

// ─── Bridge Configuration ──────────────────────────────────────

const BRIDGE_CONFIG = {
  // Vara <-> ETH bridge contract (Gear VaraBridge / gear-bridges)
  vara: {
    bridgeContract: '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder — replace with actual bridge program ID
    gateway: process.env.VARA_NODE || 'wss://rpc.vara.network',
    explorer: 'https://idea.gear-tech.io/explorer',
    chainId: 'vara-mainnet',
    chainName: 'Vara Mainnet',
    blockTime: 3, // seconds
  },
  ethereum: {
    bridgeContract: '0xAb8F315Cc80cf2368750fE5A33E259d6241b3dEB', // ETH MessageQueue
    erc20Manager: '0xA17187De490dB5F7160822dA197bcAc39d64baCb',    // ETH ERC20Manager
    verifier: '0xc3ac0c364452acEE4366CD088F947965ec486e8F',         // ETH Verifier
    rpcUrl: process.env.ETH_RPC_URL || 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    explorer: 'https://etherscan.io',
    chainId: 1,
    chainName: 'Ethereum Mainnet',
    blockTime: 12, // seconds
  },
  // Default bridge parameters
  defaults: {
    estimatedTimeMinutes: 30, // ~30 min per official vara-eth-bridge-flows reference
    minConfirmations: 12,     // ETH blocks before bridge finalizes
    maxConfirmations: 64,     // considered fully confirmed
    feePercentBps: 10,        // 0.10% bridge fee (10 basis points)
    minFeeBps: 5,             // 0.05% minimum
    maxFeeBps: 50,            // 0.50% maximum
  },
};

// ─── Supported Bridge Routes ───────────────────────────────────

/**
 * Get all supported bridge routes (token pairs that can be bridged).
 * Only tokens with both `eth` and `vara` addresses are bridgeable.
 */
export function getSupportedRoutes() {
  const routes = [];
  for (const tok of listTokens()) {
    if (tok.eth && tok.vara && tok.vara !== 'native') {
      routes.push({
        token: tok.key,
        symbol: tok.symbol,
        name: tok.name,
        decimals: tok.decimals,
        icon: tok.icon,
        category: tok.category,
        isStablecoin: tok.isStablecoin,
        source: {
          chain: 'ethereum',
          chainName: BRIDGE_CONFIG.ethereum.chainName,
          address: tok.eth,
          explorer: `${BRIDGE_CONFIG.ethereum.explorer}/token/${tok.eth}`,
        },
        destination: {
          chain: 'vara',
          chainName: BRIDGE_CONFIG.vara.chainName,
          address: tok.vara,
          explorer: `${BRIDGE_CONFIG.vara.explorer}/${tok.vara}`,
        },
        bidirectional: true,
      });
    }
  }
  return routes;
}

/**
 * Get a single bridge route for a token.
 */
export function getRouteForToken(symbolOrKey) {
  const tok = getToken(symbolOrKey);
  if (!tok) return null;
  if (!tok.eth || !tok.vara || tok.vara === 'native') return null;

  return {
    token: tok.key,
    symbol: tok.symbol,
    name: tok.name,
    decimals: tok.decimals,
    source: {
      chain: 'ethereum',
      chainName: BRIDGE_CONFIG.ethereum.chainName,
      address: tok.eth,
    },
    destination: {
      chain: 'vara',
      chainName: BRIDGE_CONFIG.vara.chainName,
      address: tok.vara,
    },
  };
}

// ─── Fee Estimation ─────────────────────────────────────────────

/**
 * Estimate bridge fee for a given amount.
 * @param {string} tokenSymbol
 * @param {string} amount - human-readable amount (e.g. "1000")
 * @param {'ethToVara'|'varaToEth'} direction
 * @returns {{ fee, feeRaw, feePercent, netAmount, netAmountRaw, estimatedTimeMinutes }}
 */
export function estimateBridgeFee(tokenSymbol, amount, direction = 'ethToVara') {
  const tok = getToken(tokenSymbol);
  if (!tok) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (!tok.eth || tok.vara === 'native') throw new Error(`Token ${tokenSymbol} is not bridgeable`);

  const baseAmount = toBaseUnits(amount, tok.decimals);
  const feeBps = BigInt(BRIDGE_CONFIG.defaults.feePercentBps);
  const feeRaw = baseAmount * feeBps / BigInt(10000);
  const netAmountRaw = baseAmount - feeRaw;

  // Estimated time depends on direction
  const estimatedMinutes = direction === 'ethToVara'
    ? BRIDGE_CONFIG.defaults.estimatedTimeMinutes
    : BRIDGE_CONFIG.defaults.estimatedTimeMinutes + 5; // Vara→ETH slightly longer

  return {
    token: tok.symbol,
    amount,
    amountRaw: baseAmount.toString(),
    fee: toDisplayUnits(feeRaw, tok.decimals),
    feeRaw: feeRaw.toString(),
    feePercent: (Number(feeBps) / 100).toFixed(2) + '%',
    netAmount: toDisplayUnits(netAmountRaw, tok.decimals),
    netAmountRaw: netAmountRaw.toString(),
    direction,
    estimatedTimeMinutes: estimatedMinutes,
    estimatedConfirmations: BRIDGE_CONFIG.defaults.minConfirmations,
  };
}

// ─── Bridge Info ─────────────────────────────────────────────────

/**
 * Get comprehensive bridge information for the frontend.
 */
export function getBridgeInfo() {
  const routes = getSupportedRoutes();
  return {
    supported: true,
    isInformationalOnly: true, // Bridge execution not yet implemented — info/tracking only
    version: '1.0.0',
    chains: {
      ethereum: {
        name: BRIDGE_CONFIG.ethereum.chainName,
        chainId: BRIDGE_CONFIG.ethereum.chainId,
        explorer: BRIDGE_CONFIG.ethereum.explorer,
        bridgeContract: BRIDGE_CONFIG.ethereum.bridgeContract,
        erc20Manager: BRIDGE_CONFIG.ethereum.erc20Manager,
        verifier: BRIDGE_CONFIG.ethereum.verifier,
        blockTime: BRIDGE_CONFIG.ethereum.blockTime,
      },
      vara: {
        name: BRIDGE_CONFIG.vara.chainName,
        chainId: BRIDGE_CONFIG.vara.chainId,
        explorer: BRIDGE_CONFIG.vara.explorer,
        bridgeContract: BRIDGE_CONFIG.vara.bridgeContract,
        blockTime: BRIDGE_CONFIG.vara.blockTime,
      },
    },
    routes,
    routeCount: routes.length,
    fees: {
      percentBps: BRIDGE_CONFIG.defaults.feePercentBps,
      percentDisplay: (BRIDGE_CONFIG.defaults.feePercentBps / 100).toFixed(2) + '%',
      minBps: BRIDGE_CONFIG.defaults.minFeeBps,
      maxBps: BRIDGE_CONFIG.defaults.maxFeeBps,
    },
    timing: {
      estimatedMinutes: BRIDGE_CONFIG.defaults.estimatedTimeMinutes,
      minConfirmations: BRIDGE_CONFIG.defaults.minConfirmations,
      maxConfirmations: BRIDGE_CONFIG.defaults.maxConfirmations,
    },
    faucets: {
      vara: 'https://idea.gear-tech.io/programs?node=wss%3A%2F%2Frpc.vara.network',
      hoodi: 'https://faucet.hoodi.ethpandaops.io/',
    },
    guides: {
      bridging: 'https://wiki.vara.network/docs/bridge/',
      testnetTokens: 'https://wiki.vara.network/docs/tokens/',
    },
  };
}

// ─── Transaction Tracking ─────────────────────────────────────

// Status flow: initiated → source_confirmed → bridging → destination_confirmed → completed
//              initiated → failed
const VALID_STATUSES = ['initiated', 'source_confirmed', 'bridging', 'destination_confirmed', 'completed', 'failed'];

/**
 * Create a new bridge transaction record.
 */
export async function createBridgeTransaction({
  wallet,
  token,
  amount,
  amountRaw,
  direction = 'ethToVara',
  sourceTxHash,
  sourceChain,
  destinationChain,
  fee,
  feeRaw,
}) {
  const tok = getToken(token);
  const result = await query(
    `INSERT INTO bridge_transactions
      (wallet, token_symbol, token_key, amount, amount_raw, direction,
       source_tx_hash, source_chain, destination_chain, fee, fee_raw, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'initiated')
     RETURNING *`,
    [
      wallet, tok?.symbol || token, tok?.key || token,
      amount, amountRaw || '0', direction,
      sourceTxHash || null, sourceChain || 'ethereum',
      destinationChain || 'vara', fee || '0', feeRaw || '0',
    ]
  );
  return result.rows[0];
}

/**
 * Update bridge transaction status.
 */
export async function updateBridgeStatus(id, status, metadata = {}) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}. Valid: ${VALID_STATUSES.join(', ')}`);
  }

  const updates = [`status = $2`, `updated_at = NOW()`];
  const params = [id, status];
  let paramIdx = 3;

  if (metadata.destinationTxHash) {
    updates.push(`destination_tx_hash = $${paramIdx++}`);
    params.push(metadata.destinationTxHash);
  }
  if (metadata.confirmations !== undefined) {
    updates.push(`confirmations = $${paramIdx++}`);
    params.push(metadata.confirmations);
  }
  if (metadata.error) {
    updates.push(`error = $${paramIdx++}`);
    params.push(metadata.error);
  }
  if (status === 'completed') {
    updates.push(`completed_at = NOW()`);
  }

  const result = await query(
    `UPDATE bridge_transactions SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Get bridge transaction by ID.
 */
export async function getBridgeTransaction(id) {
  return queryOne('SELECT * FROM bridge_transactions WHERE id = $1', [id]);
}

/**
 * Get bridge transaction by source tx hash.
 */
export async function getBridgeBySourceTx(sourceTxHash) {
  return queryOne('SELECT * FROM bridge_transactions WHERE source_tx_hash = $1', [sourceTxHash]);
}

/**
 * Get all bridge transactions for a wallet (paginated).
 */
export async function getBridgeHistory(wallet, { limit = 20, offset = 0, status, token } = {}) {
  let sql = 'SELECT * FROM bridge_transactions WHERE wallet = $1';
  const params = [wallet.toLowerCase()];
  let idx = 2;

  if (status) {
    sql += ` AND status = $${idx++}`;
    params.push(status);
  }
  if (token) {
    const tok = getToken(token);
    sql += ` AND (token_symbol = $${idx} OR token_key = $${idx})`;
    params.push(tok?.symbol || token);
    idx++;
  }

  // Get total count
  const countResult = await query(sql.replace('SELECT *', 'SELECT COUNT(*) as count'), params);
  const total = parseInt(countResult.rows[0]?.count || '0');

  sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const rows = await queryAll(sql, params);

  // Enrich with token metadata
  const enriched = rows.map(row => {
    const tok = getToken(row.token_key || row.token_symbol);
    return {
      ...row,
      tokenMeta: tok ? { key: tok.key, symbol: tok.symbol, name: tok.name, decimals: tok.decimals, icon: tok.icon } : null,
    };
  });

  return { wallet, transactions: enriched, total, limit, offset };
}

/**
 * Get pending bridge transactions (for monitoring/cron).
 */
export async function getPendingBridgeTransactions() {
  return queryAll(
    `SELECT * FROM bridge_transactions
     WHERE status NOT IN ('completed', 'failed')
     ORDER BY created_at ASC`
  );
}

/**
 * Get bridge stats for a wallet.
 */
export async function getBridgeStats(wallet) {
  const result = await queryOne(
    `SELECT
       COUNT(*) as total_bridges,
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) FILTER (WHERE status NOT IN ('completed', 'failed')) as pending
     FROM bridge_transactions WHERE wallet = $1`,
    [wallet.toLowerCase()]
  );
  return {
    wallet,
    totalBridges: parseInt(result?.total_bridges || '0'),
    completed: parseInt(result?.completed || '0'),
    failed: parseInt(result?.failed || '0'),
    pending: parseInt(result?.pending || '0'),
  };
}

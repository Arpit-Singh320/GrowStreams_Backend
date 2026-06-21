import { query as contractQuery, getProgramIds, getApi } from '../sails-client.mjs';
import { getVftBalance } from './token-service.mjs';
import { getPool, queryAll, queryOne } from './db.mjs';
import { getToken, getTokenByVaraAddress, listTokens } from '../config/tokens.mjs';
import { toDisplayUnits } from '../utils/decimals.mjs';
import { getTokenPrice, getBatchPrices, getBatchPricesDetailed, getCoingeckoId } from './price-service.mjs';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isIndexerRunning } from './event-indexer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ACTIVITY_WINDOW_DAYS = 30;
const ACTIVITY_SOURCE = 'on_chain_event_indexer';
const FALLBACK_ACTIVITY_SOURCE = 'backend_command_logs_fallback';
const TVL_PRICING_SOURCE = 'coingecko_realtime_pricing';
const GEAR_PROGRAMS_EXPLORER_BASE = process.env.VARA_PROGRAMS_EXPLORER_URL || 'https://idea.gear-tech.io/programs';
const VARA_RPC_URL = process.env.VARA_NODE || 'wss://rpc.vara.network';

// Test/QA accounts pollute public KPIs (e.g. seeded 'test-xss' users and XSS
// probe rows). Exclude them from every analytics user query. Fabricated event
// rows are purged from vault_events/stream_events by purge-test-analytics-data.mjs;
// users are kept (they have FK references) but filtered here.
const USERS_EXCLUDE_TEST_SQL = `
  github_handle IS DISTINCT FROM 'test-xss'
  AND display_name IS DISTINCT FROM 'test-xss'
  AND COALESCE(github_handle, '') NOT LIKE '%<%'
  AND COALESCE(display_name, '') NOT LIKE '%<%'
  AND COALESCE(wallet, '') NOT LIKE '%<%'
`;

function toStringValue(value) {
  if (value == null) return '0';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    if (typeof value.toBigInt === 'function') return value.toBigInt().toString();
    if (typeof value.toJSON === 'function') return String(value.toJSON());
    if (typeof value.toString === 'function') return value.toString();
  }
  return String(value);
}

export function roundNumber(value, decimals = 6) {
  return Math.round(value * (10 ** decimals)) / (10 ** decimals);
}

export function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function toNumberValue(value) {
  const parsed = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfUtcDay(date = new Date()) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function getProgramExplorerUrl(address) {
  if (!address) return null;
  return `${GEAR_PROGRAMS_EXPLORER_BASE}/${address}?node=${encodeURIComponent(VARA_RPC_URL)}`;
}

function getResolvedProgramIds() {
  const liveProgramIds = getProgramIds() || {};
  try {
    const deployStatePath = resolve(__dirname, '../../deploy-state.json');
    const deployState = JSON.parse(readFileSync(deployStatePath, 'utf-8'));
    return {
      'stream-core': liveProgramIds['stream-core'] || deployState['stream-core']?.programId || null,
      'token-vault': liveProgramIds['token-vault'] || deployState['token-vault']?.programId || null,
      'grow-token': liveProgramIds['grow-token'] || deployState['grow-token']?.programId || null,
      'splits-router': liveProgramIds['splits-router'] || deployState['splits-router']?.programId || null,
      'distribution-pool': liveProgramIds['distribution-pool'] || deployState['distribution-pool']?.programId || null,
      'liquidation-manager': liveProgramIds['liquidation-manager'] || deployState['liquidation-manager']?.programId || null,
    };
  } catch {
    return {
      'stream-core': liveProgramIds['stream-core'] || null,
      'token-vault': liveProgramIds['token-vault'] || null,
      'grow-token': liveProgramIds['grow-token'] || null,
      'splits-router': liveProgramIds['splits-router'] || null,
      'distribution-pool': liveProgramIds['distribution-pool'] || null,
      'liquidation-manager': liveProgramIds['liquidation-manager'] || null,
    };
  }
}

async function getEventSourceMode() {
  if (!getPool()) {
    return {
      streamConditionSql: 'TRUE',
      vaultConditionSql: 'TRUE',
      source: FALLBACK_ACTIVITY_SOURCE,
      capturesPayloadSignedTransactions: false,
      authoritativeEventCount: 0,
    };
  }

  const row = await queryOne(`
    SELECT (
      (SELECT COUNT(*)::bigint FROM stream_events WHERE COALESCE(metadata->>'source', '') = 'on_chain_event') +
      (SELECT COUNT(*)::bigint FROM vault_events WHERE COALESCE(metadata->>'source', '') = 'on_chain_event')
    )::bigint AS count
  `);

  const authoritativeEventCount = Number.parseInt(row?.count || '0', 10);
  const hasAuthoritativeRows = authoritativeEventCount > 0;

  return {
    streamConditionSql: hasAuthoritativeRows
      ? `COALESCE(metadata->>'source', '') = 'on_chain_event'`
      : 'TRUE',
    vaultConditionSql: hasAuthoritativeRows
      ? `COALESCE(metadata->>'source', '') = 'on_chain_event'`
      : 'TRUE',
    source: hasAuthoritativeRows ? ACTIVITY_SOURCE : FALLBACK_ACTIVITY_SOURCE,
    capturesPayloadSignedTransactions: hasAuthoritativeRows,
    authoritativeEventCount,
  };
}

function resolveToken(row) {
  const byAddress = row.token_address ? getTokenByVaraAddress(row.token_address) : null;
  const bySymbol = row.token_key ? getToken(row.token_key) : (row.token_symbol ? getToken(row.token_symbol) : null);
  return byAddress || bySymbol;
}

export function bucketVolume(windowStartMs, eventAtMs, usdValue, volume) {
  if (eventAtMs >= windowStartMs.last24h) volume.last24hUsd += usdValue;
  if (eventAtMs >= windowStartMs.last7d) volume.last7dUsd += usdValue;
  if (eventAtMs >= windowStartMs.last30d) volume.last30dUsd += usdValue;
}

async function getVolumeMetrics(days = 30) {
  if (!getPool()) {
    return {
      source: ACTIVITY_SOURCE,
      coverage: 'all_tokens_stream_withdrawals_vault_deposits_withdrawals_and_completed_bridge_transactions',
      last24hUsd: 0,
      last7dUsd: 0,
      last30dUsd: 0,
      series: [],
    };
  }

  const eventSourceMode = await getEventSourceMode();
  const now = Date.now();
  const seriesWindowDays = clampInt(days, 1, 365, 30);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sinceSeries = new Date(now - seriesWindowDays * 24 * 60 * 60 * 1000).toISOString();

  const [streamRows30d, vaultRows30d, bridgeRows30d, streamRowsSeries, vaultRowsSeries, bridgeRowsSeries] = await Promise.all([
    queryAll(
      `SELECT created_at AS event_at, token_address, token_symbol, amount
       FROM stream_events
       WHERE event_type = 'withdraw'
         AND amount IS NOT NULL
         AND ${eventSourceMode.streamConditionSql}
         AND created_at >= $1`,
      [since30d]
    ),
    queryAll(
      `SELECT created_at AS event_at, token_address, token_symbol, amount
       FROM vault_events
       WHERE event_type IN ('deposit', 'withdraw')
         AND amount IS NOT NULL
         AND ${eventSourceMode.vaultConditionSql}
         AND created_at >= $1`,
      [since30d]
    ),
    queryAll(
      `SELECT COALESCE(completed_at, created_at) AS event_at, token_key, token_symbol, amount, amount_raw
       FROM bridge_transactions
       WHERE status = 'completed'
         AND COALESCE(completed_at, created_at) >= $1`,
      [since30d]
    ),
    queryAll(
      `SELECT created_at AS event_at, token_address, token_symbol, amount
       FROM stream_events
       WHERE event_type = 'withdraw'
         AND amount IS NOT NULL
         AND ${eventSourceMode.streamConditionSql}
         AND created_at >= $1`,
      [sinceSeries]
    ),
    queryAll(
      `SELECT created_at AS event_at, token_address, token_symbol, amount
       FROM vault_events
       WHERE event_type IN ('deposit', 'withdraw')
         AND amount IS NOT NULL
         AND ${eventSourceMode.vaultConditionSql}
         AND created_at >= $1`,
      [sinceSeries]
    ),
    queryAll(
      `SELECT COALESCE(completed_at, created_at) AS event_at, token_key, token_symbol, amount, amount_raw
       FROM bridge_transactions
       WHERE status = 'completed'
         AND COALESCE(completed_at, created_at) >= $1`,
      [sinceSeries]
    ),
  ]);

  const windows = {
    last24h: now - 24 * 60 * 60 * 1000,
    last7d: now - 7 * 24 * 60 * 60 * 1000,
    last30d: now - 30 * 24 * 60 * 60 * 1000,
  };

  const volume = {
    last24hUsd: 0,
    last7dUsd: 0,
    last30dUsd: 0,
  };

  // Get all unique token symbols from the events
  const allTokenSymbols = new Set();
  for (const row of streamRows30d) {
    if (row.token_symbol) allTokenSymbols.add(row.token_symbol);
  }
  for (const row of vaultRows30d) {
    if (row.token_symbol) allTokenSymbols.add(row.token_symbol);
  }
  for (const row of bridgeRows30d) {
    if (row.token_symbol) allTokenSymbols.add(row.token_symbol);
  }

  // Fetch real-time prices for all tokens
  const prices = await getBatchPrices(Array.from(allTokenSymbols));

  for (const row of streamRows30d) {
    const token = resolveToken(row);
    if (!token) continue;
    const amountDisplay = toDisplayUnits(row.amount, token.decimals);
    const price = prices[row.token_symbol] || (token.fallbackPrice || (token.isStablecoin ? 1 : 0));
    const usdValue = toNumberValue(amountDisplay) * price;
    const eventAtMs = new Date(row.event_at).getTime();
    bucketVolume(windows, eventAtMs, usdValue, volume);
  }

  for (const row of vaultRows30d) {
    const token = resolveToken(row);
    if (!token) continue;
    const amountDisplay = toDisplayUnits(row.amount, token.decimals);
    const price = prices[row.token_symbol] || (token.fallbackPrice || (token.isStablecoin ? 1 : 0));
    const usdValue = toNumberValue(amountDisplay) * price;
    const eventAtMs = new Date(row.event_at).getTime();
    bucketVolume(windows, eventAtMs, usdValue, volume);
  }

  for (const row of bridgeRows30d) {
    const token = resolveToken(row);
    if (!token) continue;
    const amountDisplay = row.amount_raw && row.amount_raw !== '0'
      ? toDisplayUnits(row.amount_raw, token.decimals)
      : row.amount;
    const price = prices[row.token_symbol] || (token.fallbackPrice || (token.isStablecoin ? 1 : 0));
    const usdValue = toNumberValue(amountDisplay) * price;
    const eventAtMs = new Date(row.event_at).getTime();
    bucketVolume(windows, eventAtMs, usdValue, volume);
  }

  const seriesMap = new Map();

  function addSeriesPoint(row, usdValue) {
    const dateKey = new Date(row.event_at).toISOString().slice(0, 10);
    seriesMap.set(dateKey, roundNumber((seriesMap.get(dateKey) || 0) + usdValue));
  }

  for (const row of streamRowsSeries) {
    const token = resolveToken(row);
    if (!token) continue;
    const amountDisplay = toDisplayUnits(row.amount, token.decimals);
    const price = prices[row.token_symbol] || (token.fallbackPrice || (token.isStablecoin ? 1 : 0));
    const usdValue = toNumberValue(amountDisplay) * price;
    addSeriesPoint(row, usdValue);
  }

  for (const row of vaultRowsSeries) {
    const token = resolveToken(row);
    if (!token) continue;
    const amountDisplay = toDisplayUnits(row.amount, token.decimals);
    const price = prices[row.token_symbol] || (token.fallbackPrice || (token.isStablecoin ? 1 : 0));
    const usdValue = toNumberValue(amountDisplay) * price;
    addSeriesPoint(row, usdValue);
  }

  for (const row of bridgeRowsSeries) {
    const token = resolveToken(row);
    if (!token) continue;
    const amountDisplay = row.amount_raw && row.amount_raw !== '0'
      ? toDisplayUnits(row.amount_raw, token.decimals)
      : row.amount;
    const price = prices[row.token_symbol] || (token.fallbackPrice || (token.isStablecoin ? 1 : 0));
    const usdValue = toNumberValue(amountDisplay) * price;
    addSeriesPoint(row, usdValue);
  }

  const series = Array.from(seriesMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, volumeUsd]) => ({ date, volumeUsd }));

  return {
    source: `${eventSourceMode.source}_plus_completed_bridge_transactions`,
    coverage: 'stablecoin_stream_withdrawals_and_completed_bridge_transfers_only',
    last24hUsd: roundNumber(volume.last24hUsd),
    last7dUsd: roundNumber(volume.last7dUsd),
    last30dUsd: roundNumber(volume.last30dUsd),
    series,
  };
}

async function getLatestFreshness() {
  if (!getPool()) {
    return {
      lastUpdatedAt: null,
      lastSnapshotAt: null,
      lastEventAt: null,
      snapshotAgeSeconds: null,
      isStale: true,
      indexerRunning: isIndexerRunning(),
    };
  }

  const [snapshotRow, latestEventsRow] = await Promise.all([
    queryOne(`SELECT MAX(snapped_at) AS latest_at FROM analytics_protocol_snapshots`),
    queryOne(`
      SELECT MAX(event_at) AS latest_at
      FROM (
        SELECT created_at AS event_at FROM stream_events
        UNION ALL
        SELECT created_at AS event_at FROM vault_events
        UNION ALL
        SELECT COALESCE(completed_at, created_at) AS event_at FROM bridge_transactions
      ) combined
    `),
  ]);

  const lastSnapshotAt = snapshotRow?.latest_at || null;
  const lastEventAt = latestEventsRow?.latest_at || null;
  const lastUpdatedAt = [lastSnapshotAt, lastEventAt].filter(Boolean).sort().at(-1) || null;
  const snapshotAgeSeconds = lastSnapshotAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lastSnapshotAt).getTime()) / 1000))
    : null;

  return {
    lastUpdatedAt,
    lastSnapshotAt,
    lastEventAt,
    snapshotAgeSeconds,
    isStale: snapshotAgeSeconds == null ? true : snapshotAgeSeconds > 24 * 60 * 60,
    indexerRunning: isIndexerRunning(),
  };
}

function getVaultProgramId() {
  return getResolvedProgramIds()['token-vault'] || null;
}

function getTrackedVaultTokens() {
  return listTokens().filter((token) => {
    if (token.key === 'VARA') return false;       // native handled separately
    if (!token.vara) return false;                // undeployed (gUSDC/gGROW have null vara)
    // Super tokens (gVARA) ARE tracked: they are the streaming wrappers whose
    // vault balance represents value locked in streams. Only super tokens with a
    // deployed on-chain address (vara != null) reach here.
    return true;
  });
}

/**
 * The vault's REAL native VARA balance, read from the chain account's free
 * balance (system.account).
 *
 * NOTE: this previously used vault GetConfig.total_tokens_held — which is NOT
 * native VARA. total_tokens_held is the vault's internal accounting sum of
 * (available + total_allocated) across ALL (owner, token) pairs (see
 * contracts/token-vault/src/lib.rs:459). Labeling that mixed-token, mixed-decimal
 * counter as "native VARA" and pricing it at VARA was wrong and double-counted
 * the wrapped tokens already counted via BalanceOf. We now read the true native
 * balance instead.
 */
async function getNativeVaultBalance() {
  const varaToken = getToken('VARA');
  const vaultAddress = getVaultProgramId();
  const api = getApi();

  let rawBalance = '0';
  try {
    if (api && vaultAddress) {
      const account = await api.query.system.account(vaultAddress);
      rawBalance = account?.data?.free?.toString() || '0';
    }
  } catch (err) {
    console.warn('[analytics] Failed to read native vault balance:', err.message);
  }

  const balanceDisplay = toDisplayUnits(rawBalance, varaToken.decimals);

  return {
    key: varaToken.key,
    symbol: varaToken.symbol,
    name: varaToken.name,
    address: varaToken.vara,
    category: varaToken.category,
    isStablecoin: varaToken.isStablecoin,
    decimals: varaToken.decimals,
    balanceRaw: rawBalance,
    balanceDisplay,
    estimatedUsd: null,
    pricingSource: null,
  };
}

/**
 * Calculate TVL from indexed vault_events (deposits - withdrawals)
 * This is more reliable than on-chain balance queries for production analytics
 */
async function getIndexedTvl(trackedTokens, prices) {
  const pool = getPool();
  console.log('[indexed-tvl] Pool available:', !!pool);

  if (!pool) {
    return { hasData: false };
  }

  try {
    const tokenBalances = {};

    // Initialize all tracked tokens with 0 balance
    for (const token of trackedTokens) {
      tokenBalances[token.symbol] = {
        deposited: BigInt(0),
        withdrawn: BigInt(0),
      };
    }

    // Query all vault events
    const vaultEvents = await queryAll(
      `SELECT token_symbol, event_type, amount
       FROM vault_events
       WHERE event_type IN ('deposit', 'withdraw')
         AND token_symbol IS NOT NULL
         AND amount IS NOT NULL`
    );

    console.log('[indexed-tvl] Vault events found:', vaultEvents.length);

    // Calculate net balance per token
    for (const event of vaultEvents) {
      const amount = BigInt(event.amount || '0');
      if (tokenBalances[event.token_symbol]) {
        if (event.event_type === 'deposit') {
          tokenBalances[event.token_symbol].deposited += amount;
        } else if (event.event_type === 'withdraw') {
          tokenBalances[event.token_symbol].withdrawn += amount;
        }
      }
    }

    // Build token rows from indexed data
    const tokenRows = trackedTokens.map(token => {
      const balances = tokenBalances[token.symbol];
      const netBalanceRaw = (balances.deposited - balances.withdrawn).toString();
      const netBalanceDisplay = toDisplayUnits(netBalanceRaw, token.decimals);
      const price = prices[token.symbol] || (token.fallbackPrice || null);
      const estimatedUsd = price ? roundNumber(Number.parseFloat(netBalanceDisplay) * price) : null;

      return {
        key: token.key,
        symbol: token.symbol,
        name: token.name,
        address: token.vara,
        category: token.category,
        isStablecoin: token.isStablecoin,
        decimals: token.decimals,
        balanceRaw: netBalanceRaw,
        balanceDisplay: netBalanceDisplay,
        estimatedUsd,
        pricingSource: price ? TVL_PRICING_SOURCE : null,
        price,
        source: 'indexed_events',
      };
    });

    // Add native VARA balance (from vault GetConfig)
    const nativeRow = await getNativeVaultBalance();
    const nativePrice = prices['VARA'] || (getToken('VARA').fallbackPrice || null);
    const nativeEstimatedUsd = nativePrice ? roundNumber(Number.parseFloat(nativeRow.balanceDisplay) * nativePrice) : null;

    const tokenRowsWithNative = [
      ...tokenRows,
      {
        ...nativeRow,
        estimatedUsd: nativeEstimatedUsd,
        pricingSource: nativePrice ? TVL_PRICING_SOURCE : null,
        price: nativePrice,
        source: 'indexed_events',
      }
    ];

    // Calculate totals
    let totalUsd = 0;
    let totalStablecoinUsd = 0;
    for (const row of tokenRowsWithNative) {
      if (row.estimatedUsd) {
        totalUsd += row.estimatedUsd;
        if (row.isStablecoin) {
          totalStablecoinUsd += row.estimatedUsd;
        }
      }
    }

    return {
      hasData: true,
      data: {
        vaultAddress: getVaultProgramId(),
        pricing: {
          source: TVL_PRICING_SOURCE,
          coverage: 'all_tokens_from_indexed_events',
        },
        totals: {
          estimatedUsd: roundNumber(totalUsd),
          estimatedStablecoinUsd: roundNumber(totalStablecoinUsd),
        },
        tokens: tokenRowsWithNative,
      },
    };
  } catch (error) {
    console.warn('[analytics] Indexed TVL calculation failed:', error.message);
    return { hasData: false };
  }
}

// Short-lived cache for the live TVL read. On-chain BalanceOf queries hit the
// public Vara RPC node once per token; caching the assembled result protects
// the node from dashboard refresh load while keeping the number effectively
// real-time.
const TVL_CACHE_TTL_MS = Number.parseInt(process.env.TVL_CACHE_TTL_MS || '', 10) || 45 * 1000;
let tvlCache = { data: null, at: 0 };

export function clearTvlCache() {
  tvlCache = { data: null, at: 0 };
}

/**
 * Current TVL — authoritative source is the live on-chain VFT BalanceOf of the
 * vault for each deployed token, plus native VARA held by the vault. Tokens
 * whose contracts are not yet deployed on-chain report a real zero balance with
 * deployed:false (this is the expected state for bridged tokens today).
 *
 * Indexed vault_events are attached as a non-authoritative `reconciliation`
 * block for drift detection, never as the headline number.
 */
export async function getCurrentTvl({ force = false } = {}) {
  if (!force && tvlCache.data && (Date.now() - tvlCache.at) < TVL_CACHE_TTL_MS) {
    return tvlCache.data;
  }

  const vaultAddress = getVaultProgramId();
  if (!vaultAddress) {
    const err = new Error('Token vault program ID unavailable');
    err.status = 503;
    throw err;
  }

  const trackedTokens = getTrackedVaultTokens();

  // Real-time prices for all tracked tokens plus native VARA, with explicit
  // source tagging (coingecko | fallback_constant | unpriced).
  const priceSymbols = [...new Set([...trackedTokens.map(t => t.symbol), 'VARA'])];
  const priced = await getBatchPricesDetailed(priceSymbols);

  const priceInfoFor = (symbol) => priced[symbol] ?? { price: null, source: 'unpriced' };
  const usdFor = (price, balanceDisplay) =>
    price != null ? roundNumber(Number.parseFloat(balanceDisplay || '0') * price) : null;

  // Authoritative: live on-chain BalanceOf(vault) per token.
  const tokenRows = await Promise.all(
    trackedTokens.map(async (token) => {
      const { price, source: priceSource } = priceInfoFor(token.symbol);
      try {
        const balance = await getVftBalance(token.key, vaultAddress);
        const deployed = balance.deployed !== false;
        return {
          key: token.key,
          symbol: token.symbol,
          name: token.name,
          address: token.vara,
          category: token.category,
          isStablecoin: token.isStablecoin,
          decimals: token.decimals,
          balanceRaw: balance.balanceRaw,
          balanceDisplay: balance.balance,
          estimatedUsd: usdFor(price, balance.balance),
          pricingSource: priceSource,
          price,
          deployed,
          source: deployed ? 'onchain_balanceof' : 'contract_not_deployed',
        };
      } catch (err) {
        return {
          key: token.key,
          symbol: token.symbol,
          name: token.name,
          address: token.vara,
          category: token.category,
          isStablecoin: token.isStablecoin,
          decimals: token.decimals,
          balanceRaw: '0',
          balanceDisplay: '0',
          estimatedUsd: null,
          pricingSource: priceSource,
          price,
          deployed: null,
          error: err.message,
          source: 'onchain_query_failed',
        };
      }
    })
  );

  // Native VARA held by the vault (from vault GetConfig.total_tokens_held).
  const nativeRow = await getNativeVaultBalance();
  const { price: nativePrice, source: nativePriceSource } = priceInfoFor('VARA');
  const nativeRowPriced = {
    ...nativeRow,
    price: nativePrice,
    pricingSource: nativePriceSource,
    estimatedUsd: usdFor(nativePrice, nativeRow.balanceDisplay),
    deployed: true,
    source: 'onchain_native_balance',
  };

  const tokens = [...tokenRows, nativeRowPriced];

  let estimatedUsd = 0;
  let estimatedStablecoinUsd = 0;
  for (const t of tokens) {
    if (t.estimatedUsd) {
      estimatedUsd += t.estimatedUsd;
      if (t.isStablecoin) estimatedStablecoinUsd += t.estimatedUsd;
    }
  }

  const deployedCount = tokenRows.filter(t => t.deployed === true).length;
  const notDeployed = tokenRows.filter(t => t.deployed === false).map(t => t.symbol);

  // Non-authoritative cross-check from indexed events (deposits − withdrawals).
  // getIndexedTvl expects a plain symbol -> price number map.
  const priceMap = {};
  for (const [symbol, info] of Object.entries(priced)) {
    if (info.price != null) {
      priceMap[symbol] = info.price;
      priceMap[symbol.toUpperCase()] = info.price;
    }
  }
  let reconciliation = null;
  try {
    const indexed = await getIndexedTvl(trackedTokens, priceMap);
    if (indexed && indexed.hasData) {
      reconciliation = {
        source: 'indexed_vault_events',
        note: 'Backend-logged deposits minus withdrawals. Non-authoritative; for drift detection only.',
        estimatedUsd: indexed.data.totals.estimatedUsd,
      };
    }
  } catch { /* reconciliation is best-effort */ }

  // Pricing honesty: report which tokens carry a non-live (placeholder) price.
  const unpricedSymbols = tokens
    .filter(t => Number.parseFloat(t.balanceDisplay || '0') > 0 && t.pricingSource !== 'coingecko')
    .map(t => t.symbol);

  const result = {
    vaultAddress,
    pricing: {
      source: TVL_PRICING_SOURCE,
      coverage: 'live_onchain_balanceof_all_deployed_tokens_plus_native_vara',
      liveMarketPriced: tokens.filter(t => t.pricingSource === 'coingecko').map(t => t.symbol),
      placeholderPriced: unpricedSymbols,
    },
    totals: {
      estimatedUsd: roundNumber(estimatedUsd),
      estimatedStablecoinUsd: roundNumber(estimatedStablecoinUsd),
    },
    tokens,
    meta: {
      tvlSource: 'onchain_balanceof',
      trackedTokenCount: trackedTokens.length,
      deployedTokenCount: deployedCount,
      tokensNotDeployedOnChain: notDeployed,
      reconciliation,
      asOf: new Date().toISOString(),
    },
  };

  tvlCache = { data: result, at: Date.now() };
  return result;
}

/**
 * DeFiLlama-shaped TVL. Returns raw (decimal-adjusted) token balances keyed by
 * CoinGecko asset id, so the DeFiLlama adapter can price them with their own
 * infrastructure. No server-side USD is included in `balances`.
 *
 * GROW token is explicitly excluded from TVL as it is a platform/utility token
 * with no public market. TVL reflects only VARA, wVARA, and gVARA (the actual
 * streaming value).
 *
 * Tokens that aren't deployed on-chain are reported under `excluded` for
 * transparency but kept out of the priced `balances` map.
 *
 * The adapter consuming this should set `timetravel: false` (values are read
 * live from current chain state).
 */
export async function getDefiLlamaTvl() {
  const tvl = await getCurrentTvl();

  const balances = {};   // coingecko:id -> decimal-adjusted amount (string), DeFiLlama-priceable
  const excluded = [];   // not deployed on-chain or explicitly excluded (e.g. GROW)

  // Every token is accounted for in exactly one bucket so nothing is silently
  // dropped — including deployed tokens with a zero balance.
  for (const t of tvl.tokens) {
    // Exclude GROW (platform token with no public market)
    if (t.symbol === 'GROW') {
      excluded.push({ symbol: t.symbol, address: t.address, reason: 'platform_token_excluded' });
      continue;
    }

    if (t.deployed === false) {
      excluded.push({ symbol: t.symbol, address: t.address, reason: 'contract_not_deployed' });
      continue;
    }

    const amount = t.balanceDisplay || '0';
    const coingeckoId = getCoingeckoId(t.symbol);

    if (!coingeckoId) {
      // Deployed but no public market. Surface its real balance so it is
      // never invisible; DeFiLlama can't price it without a DEX/oracle mapping.
      excluded.push({
        symbol: t.symbol,
        address: t.address,
        amount,
        balanceRaw: t.balanceRaw,
        reason: 'no_coingecko_market',
      });
      continue;
    }

    const key = `coingecko:${coingeckoId}`;
    // Sum in case two symbols map to the same id (e.g. VARA + wVARA).
    const prev = Number.parseFloat(balances[key] || '0');
    balances[key] = String(prev + Number.parseFloat(amount));
  }

  return {
    vaultAddress: tvl.vaultAddress,
    chain: 'vara',
    balances,
    excluded,
    methodology:
      'TVL is the live on-chain token balance held by the GrowStreams TokenVault on Vara Network ' +
      '(VFT BalanceOf of the vault per token) plus native VARA held by the vault. ' +
      'GROW token is excluded as it is a platform/utility token with no public market. ' +
      'TVL reflects only VARA, wVARA, and gVARA (the actual streaming value). ' +
      'Balances are read from current chain state and keyed by CoinGecko asset id for DeFiLlama pricing.',
    timetravel: false,
    asOf: tvl.meta?.asOf || new Date().toISOString(),
  };
}

// Short cache for the on-chain stream scan — protects the public RPC node from
// per-request enumeration cost.
const STREAM_METRICS_CACHE_TTL_MS = Number.parseInt(process.env.STREAM_METRICS_CACHE_TTL_MS || '', 10) || 60 * 1000;
let streamMetricsCache = { data: null, at: 0 };

export function clearStreamMetricsCache() {
  streamMetricsCache = { data: null, at: 0 };
}

function parseStreamStatus(status) {
  // Sails enums decode to { Active: null } | "Active" | etc.
  if (status == null) return 'unknown';
  if (typeof status === 'string') return status;
  if (typeof status === 'object') return Object.keys(status)[0] || 'unknown';
  return String(status);
}

// On-chain timestamps are Unix seconds. Returns ms or null.
function onchainTsToMs(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * 1000;
}

/**
 * Reconstruct on-chain stream activity by POLLING the StreamCore contract state,
 * since the contract does not emit events (see docs/BLOCKER-onchain-events-and-fees.md).
 *
 * Reads TotalStreams then enumerates GetStream(id) and aggregates:
 *   - totalStreams / activeStreams (cumulative + active counts)
 *   - totalVolume (Σ streamed) valued in USD per token
 *   - uniqueWallets (distinct sender/receiver)
 *   - dau / mau from on-chain start_time + last_update (real Unix-second timestamps)
 *
 * This is the authoritative on-chain activity source (`onchain_state_polling`),
 * independent of the disabled event indexer. Read-only; cached briefly.
 *
 * NOTE (scale): enumerates every stream id. Fine for current volumes; Phase 2
 * persists per-stream state and scans incrementally for large N.
 */
export async function getOnchainStreamMetrics({ force = false } = {}) {
  if (!force && streamMetricsCache.data && (Date.now() - streamMetricsCache.at) < STREAM_METRICS_CACHE_TTL_MS) {
    return streamMetricsCache.data;
  }

  const now = Date.now();
  const startOfToday = startOfUtcDay().getTime();
  const start30d = now - 30 * 24 * 60 * 60 * 1000;

  let totalStreams = 0;
  let activeStreams = 0;
  try {
    totalStreams = Number.parseInt(toStringValue(await contractQuery('streamCore', 'TotalStreams')), 10) || 0;
    activeStreams = Number.parseInt(toStringValue(await contractQuery('streamCore', 'ActiveStreams')), 10) || 0;
  } catch (err) {
    return {
      available: false,
      source: 'onchain_state_polling',
      error: `Failed to read stream counts: ${err.message}`,
      totalStreams: 0,
      activeStreams: 0,
    };
  }

  const tokenStreamedRaw = {};          // symbol -> bigint Σ streamed (live)
  const wallets = new Set();
  let dauWallets = new Set();
  let mauWallets = new Set();
  let scanned = 0;
  let scanErrors = 0;
  let streamSource = 'stream_state_db';

  const nowSec = BigInt(Math.floor(now / 1000));
  const startOfTodayIso = new Date(startOfToday).toISOString();
  const since30dIso = new Date(start30d).toISOString();

  // Prefer the persisted stream_state table (populated by the state-indexer
  // cron) — scales to many streams without per-request RPC enumeration. Fall
  // back to live RPC enumeration only when the table is empty (e.g. first boot).
  const stateCountRow = getPool()
    ? await queryOne('SELECT COUNT(*)::int AS n FROM stream_state').catch(() => null)
    : null;
  const haveState = stateCountRow && stateCountRow.n > 0;

  if (haveState) {
    // Volume per token: for Active streams recompute live streamed; for
    // non-active the stored value is final. Done in SQL for scale.
    const volRows = await queryAll(`
      SELECT token_symbol AS symbol,
             SUM(
               CASE WHEN status = 'Active'
                 THEN LEAST(deposited, streamed + flow_rate * GREATEST(0, $1 - EXTRACT(EPOCH FROM last_update)))
                 ELSE streamed END
             )::numeric AS streamed_live
      FROM stream_state
      WHERE token_symbol IS NOT NULL
      GROUP BY token_symbol
    `, [Number(nowSec)]).catch(() => []);
    for (const r of volRows) {
      try { tokenStreamedRaw[r.symbol] = BigInt(Math.floor(Number(r.streamed_live || 0))); } catch { /* skip */ }
    }

    // Wallet sets (all-time + windows) from sender/receiver.
    const walletRows = await queryAll(`
      SELECT DISTINCT lower(wallet) AS wallet FROM (
        SELECT sender AS wallet FROM stream_state WHERE sender IS NOT NULL
        UNION SELECT receiver AS wallet FROM stream_state WHERE receiver IS NOT NULL
      ) w
    `).catch(() => []);
    for (const r of walletRows) wallets.add(r.wallet);

    const dauRows = await queryAll(`
      SELECT DISTINCT lower(wallet) AS wallet FROM (
        SELECT sender AS wallet, GREATEST(start_time, last_update) AS ts FROM stream_state
        UNION ALL SELECT receiver AS wallet, GREATEST(start_time, last_update) AS ts FROM stream_state
      ) w WHERE wallet IS NOT NULL AND ts >= $1
    `, [startOfTodayIso]).catch(() => []);
    for (const r of dauRows) dauWallets.add(r.wallet);

    const mauRows = await queryAll(`
      SELECT DISTINCT lower(wallet) AS wallet FROM (
        SELECT sender AS wallet, GREATEST(start_time, last_update) AS ts FROM stream_state
        UNION ALL SELECT receiver AS wallet, GREATEST(start_time, last_update) AS ts FROM stream_state
      ) w WHERE wallet IS NOT NULL AND ts >= $1
    `, [since30dIso]).catch(() => []);
    for (const r of mauRows) mauWallets.add(r.wallet);

    scanned = stateCountRow.n;
  } else {
    // Live fallback — enumerate streams directly (fine for small N / first boot).
    streamSource = 'live_rpc_enumeration';
    const CONCURRENCY = 8;
    const ids = [];
    for (let i = 1; i <= totalStreams; i++) ids.push(i);

    async function readOne(id) {
      try {
        const s = await contractQuery('streamCore', 'GetStream', id);
        if (!s) return;
        scanned++;
        const tok = s.token ? getTokenByVaraAddress(actorIdToHexLocal(s.token)) : null;
        const symbol = tok?.symbol || 'UNKNOWN';
        const stored = BigInt(toStringValue(s.streamed));
        const deposited = BigInt(toStringValue(s.deposited));
        const flowRate = BigInt(toStringValue(s.flow_rate));
        const lastUpdate = BigInt(toStringValue(s.last_update));
        const status = parseStreamStatus(s.status);
        let live = stored;
        if (status === 'Active' && nowSec > lastUpdate) {
          live = stored + flowRate * (nowSec - lastUpdate);
          if (live > deposited) live = deposited;
        }
        tokenStreamedRaw[symbol] = (tokenStreamedRaw[symbol] || 0n) + live;

        const sender = s.sender ? actorIdToHexLocal(s.sender) : null;
        const receiver = s.receiver ? actorIdToHexLocal(s.receiver) : null;
        if (sender) wallets.add(sender);
        if (receiver) wallets.add(receiver);
        const lastActivity = Math.max(onchainTsToMs(s.start_time) || 0, onchainTsToMs(s.last_update) || 0);
        if (lastActivity >= startOfToday) { if (sender) dauWallets.add(sender); if (receiver) dauWallets.add(receiver); }
        if (lastActivity >= start30d) { if (sender) mauWallets.add(sender); if (receiver) mauWallets.add(receiver); }
      } catch (err) {
        scanErrors++;
      }
    }
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      await Promise.all(ids.slice(i, i + CONCURRENCY).map(readOne));
    }
  }

  // Value Σ streamed per token in USD.
  const symbols = Object.keys(tokenStreamedRaw);
  const priced = symbols.length ? await getBatchPricesDetailed(symbols) : {};
  let totalVolumeUsd = 0;
  const byToken = [];
  for (const symbol of symbols) {
    const tok = getToken(symbol);
    const decimals = tok?.decimals ?? 12;
    const display = toDisplayUnits(tokenStreamedRaw[symbol].toString(), decimals);
    const priceInfo = priced[symbol] || { price: tok?.fallbackPrice ?? null, source: 'unpriced' };
    const usd = priceInfo.price != null ? roundNumber(Number.parseFloat(display) * priceInfo.price) : null;
    if (usd) totalVolumeUsd += usd;
    byToken.push({
      symbol,
      streamedRaw: tokenStreamedRaw[symbol].toString(),
      streamedDisplay: display,
      price: priceInfo.price,
      pricingSource: priceInfo.source,
      volumeUsd: usd,
    });
  }

  // ── On-chain XP/seeds activity ──────────────────────────────────────────────
  // XP minting happens on-chain via the quest-seeds contract (SeedsService.Mint);
  // every mint is recorded in seeds_ledger with its on-chain tx_hash (verifiable
  // on the explorer). This is real, on-chain, tx-hash-backed wallet activity, so
  // it counts toward on-chain DAU/MAU and unique active wallets — distinct from
  // the stricter "wallets that created/received streams" metric.
  let seedsAllCount = 0, seedsDauCount = 0, seedsMauCount = 0;
  // Union sets seeded with the stream wallets, so combined figures are EXACT
  // (no double-counting wallets that both stream and mint).
  const unionAll = new Set(wallets);
  const unionDau = new Set(dauWallets);
  const unionMau = new Set(mauWallets);
  if (getPool()) {
    try {
      const startOfTodayIso = startOfUtcDay().toISOString();
      const since30dIso = new Date(start30d).toISOString();
      const [allW, dayW, monthW, allList, dayList, monthList] = await Promise.all([
        queryOne('SELECT COUNT(DISTINCT wallet)::bigint AS n FROM seeds_ledger WHERE tx_hash IS NOT NULL AND wallet IS NOT NULL'),
        queryOne('SELECT COUNT(DISTINCT wallet)::bigint AS n FROM seeds_ledger WHERE tx_hash IS NOT NULL AND wallet IS NOT NULL AND created_at >= $1', [startOfTodayIso]),
        queryOne('SELECT COUNT(DISTINCT wallet)::bigint AS n FROM seeds_ledger WHERE tx_hash IS NOT NULL AND wallet IS NOT NULL AND created_at >= $1', [since30dIso]),
        queryAll('SELECT DISTINCT wallet FROM seeds_ledger WHERE tx_hash IS NOT NULL AND wallet IS NOT NULL'),
        queryAll('SELECT DISTINCT wallet FROM seeds_ledger WHERE tx_hash IS NOT NULL AND wallet IS NOT NULL AND created_at >= $1', [startOfTodayIso]),
        queryAll('SELECT DISTINCT wallet FROM seeds_ledger WHERE tx_hash IS NOT NULL AND wallet IS NOT NULL AND created_at >= $1', [since30dIso]),
      ]);
      seedsAllCount = Number.parseInt(allW?.n || '0', 10);
      seedsDauCount = Number.parseInt(dayW?.n || '0', 10);
      seedsMauCount = Number.parseInt(monthW?.n || '0', 10);
      for (const r of allList) unionAll.add(String(r.wallet).toLowerCase());
      for (const r of dayList) unionDau.add(String(r.wallet).toLowerCase());
      for (const r of monthList) unionMau.add(String(r.wallet).toLowerCase());
    } catch (err) {
      console.warn('[analytics] seeds activity query failed:', err.message);
    }
  }

  // Stream-specific counts are kept exact and separate for the strict KPI.
  const streamWalletCount = wallets.size;
  const streamDau = dauWallets.size;
  const streamMau = mauWallets.size;

  const result = {
    available: true,
    source: 'onchain_state_polling',
    note: 'On-chain activity from two verifiable sources: StreamCore state (streams/volume; contract emits no events so polled) and quest-seeds Mint txs (XP, recorded in seeds_ledger with on-chain tx_hash). Volume = sum of live per-stream `streamed`.',

    streamDataSource: streamSource, // stream_state_db | live_rpc_enumeration

    // Streaming-specific (exact; for the "wallets that created/received streams" KPI)
    totalStreams,
    activeStreams,
    scannedStreams: scanned,
    scanErrors,
    streamWallets: streamWalletCount,
    streamDau,
    streamMau,
    totalVolumeUsd: roundNumber(totalVolumeUsd),
    byToken,

    // On-chain XP/seeds activity (verifiable via seeds_ledger.tx_hash)
    seedsActiveWalletsAllTime: seedsAllCount,
    seedsDau: seedsDauCount,
    seedsMau: seedsMauCount,

    // Combined on-chain wallet activity = EXACT union of stream wallets and
    // XP-mint wallets (deduped by wallet, so no double-counting).
    dau: unionDau.size,
    mau: unionMau.size,
    uniqueWallets: unionAll.size,

    asOf: new Date().toISOString(),
  };

  streamMetricsCache = { data: result, at: Date.now() };
  return result;
}

// Local actor_id -> hex (avoids importing token-service's internal helper).
function actorIdToHexLocal(actorId) {
  if (actorId == null) return null;
  if (typeof actorId === 'string') return actorId.startsWith('0x') ? actorId.toLowerCase() : actorId;
  try {
    if (actorId.value != null) return '0x' + Buffer.from(actorId.value).toString('hex');
    if (Array.isArray(actorId)) return '0x' + Buffer.from(actorId).toString('hex');
  } catch { /* fall through */ }
  return String(actorId);
}

/**
 * DeFiLlama-shaped streaming VOLUME. Cumulative value streamed through the
 * GrowStreams protocol, keyed by CoinGecko asset id (raw token units, decimal-
 * adjusted) so the DeFiLlama dimension adapter can price it with their own infra.
 *
 * Volume = Σ live `streamed` per token (the cumulative amount that has flowed
 * through each stream). Reconstructed from StreamCore state (the contract emits
 * no events). The adapter consuming this sets timetravel:false (live read).
 */
export async function getDefiLlamaVolume() {
  const m = await getOnchainStreamMetrics();

  const dailyVolume = {};   // coingecko:id -> cumulative streamed (token units, string)
  const unpriced = [];      // tokens with streamed volume but no coingecko market

  for (const t of m.byToken || []) {
    const amount = t.streamedDisplay || '0';
    if (Number.parseFloat(amount) <= 0) continue;
    const coingeckoId = getCoingeckoId(t.symbol);
    if (!coingeckoId) {
      unpriced.push({ symbol: t.symbol, amount });
      continue;
    }
    const key = `coingecko:${coingeckoId}`;
    const prev = Number.parseFloat(dailyVolume[key] || '0');
    dailyVolume[key] = String(prev + Number.parseFloat(amount));
  }

  return {
    chain: 'vara',
    // `totalVolume` is the cumulative streamed value to date; DeFiLlama dimension
    // adapters typically report incremental volume, but GrowStreams streaming is
    // continuous so the cumulative streamed total is the meaningful figure.
    totalVolume: dailyVolume,
    totalVolumeUsd: m.totalVolumeUsd,
    unpriced,
    streamCount: m.totalStreams,
    methodology:
      'Streaming volume is the cumulative value streamed through the GrowStreams protocol on Vara, ' +
      'computed as the sum of each stream\'s live `streamed` amount (settled + accrued) read from ' +
      'StreamCore state, keyed by CoinGecko asset id (gVARA/wVARA priced as VARA). The contract emits ' +
      'no events, so values are reconstructed from on-chain contract state.',
    timetravel: false,
    asOf: m.asOf || new Date().toISOString(),
  };
}

export async function getObservedActivity(days = DEFAULT_ACTIVITY_WINDOW_DAYS) {
  const windowDays = clampInt(days, 1, 365, DEFAULT_ACTIVITY_WINDOW_DAYS);
  if (!getPool()) {
    return {
      available: false,
      windowDays,
      source: FALLBACK_ACTIVITY_SOURCE,
      capturesPayloadSignedTransactions: false,
      transactionCount: 0,
      streamEventCount: 0,
      vaultEventCount: 0,
      bridgeTransactionCount: 0,
      uniqueWallets: 0,
      observedWithdrawVolumeUsd: 0,
      volumeUsd: {
        last24h: 0,
        last7d: 0,
        last30d: 0,
      },
      dau: 0,
      totalTransactions: 0,
      uniqueWalletsAllTime: 0,
      lastObservedActivityAt: null,
      lastUpdatedAt: null,
    };
  }

  const eventSourceMode = await getEventSourceMode();
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const startOfToday = startOfUtcDay().toISOString();

  // A wallet "transacts" when it appears as a stream sender/receiver, a vault
  // wallet, or a bridge wallet. We build a UNION of those identities so that
  // unique-wallet and DAU counts reflect on-chain/observed activity — NOT the
  // size of the users table (which counts registrations, including users who
  // never transacted).
  const streamWalletsSql = `
    SELECT sender AS wallet, created_at FROM stream_events
      WHERE ${eventSourceMode.streamConditionSql} AND sender IS NOT NULL AND sender <> 'unknown'
    UNION ALL
    SELECT receiver AS wallet, created_at FROM stream_events
      WHERE ${eventSourceMode.streamConditionSql} AND receiver IS NOT NULL AND receiver <> 'unknown'
  `;
  const vaultWalletsSql = `
    SELECT wallet, created_at FROM vault_events
      WHERE ${eventSourceMode.vaultConditionSql} AND wallet IS NOT NULL AND wallet <> 'unknown'
  `;
  const bridgeWalletsSql = `
    SELECT wallet, COALESCE(completed_at, created_at) AS created_at FROM bridge_transactions
      WHERE wallet IS NOT NULL AND wallet <> 'unknown'
  `;
  const allWalletsSql = `${streamWalletsSql} UNION ALL ${vaultWalletsSql} UNION ALL ${bridgeWalletsSql}`;

  const [
    streamCountRow,
    vaultCountRow,
    bridgeCountRow,
    latestRow,
    windowUniqueWalletsRow,
    totalStreamCountRow,
    totalVaultCountRow,
    totalBridgeCountRow,
    allTimeUniqueWalletsRow,
    dauRow,
    volume,
    activeWalletsAllTimeRow,
  ] = await Promise.all([
    queryOne(`SELECT COUNT(*)::bigint AS count FROM stream_events WHERE ${eventSourceMode.streamConditionSql} AND created_at >= $1`, [since]),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM vault_events WHERE ${eventSourceMode.vaultConditionSql} AND created_at >= $1`, [since]),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM bridge_transactions WHERE created_at >= $1`, [since]),
    queryOne(`
      SELECT MAX(created_at) AS latest_at
      FROM (
        SELECT created_at FROM stream_events WHERE ${eventSourceMode.streamConditionSql} AND created_at >= $1
        UNION ALL
        SELECT created_at FROM vault_events WHERE ${eventSourceMode.vaultConditionSql} AND created_at >= $1
        UNION ALL
        SELECT COALESCE(completed_at, created_at) AS created_at FROM bridge_transactions WHERE created_at >= $1
      ) observed
    `, [since]),
    // Unique transacting wallets within the activity window (upstream allWalletsSql helper)
    queryOne(`SELECT COUNT(DISTINCT wallet)::bigint AS count FROM (${allWalletsSql}) w WHERE created_at >= $1`, [since]),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM stream_events WHERE ${eventSourceMode.streamConditionSql}`),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM vault_events WHERE ${eventSourceMode.vaultConditionSql}`),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM bridge_transactions`),
    // Registered users (users table), excluding seeded test/QA accounts.
    queryOne(`SELECT COUNT(*)::bigint AS count FROM users WHERE ${USERS_EXCLUDE_TEST_SQL}`),
    // DAU = unique wallets that transacted since the start of the current UTC day
    queryOne(`SELECT COUNT(DISTINCT wallet)::bigint AS count FROM (${allWalletsSql}) w WHERE created_at >= $1`, [startOfToday]),
    getVolumeMetrics(windowDays),
    // Unique transacting wallets all-time (distinct from registered users).
    queryOne(`SELECT COUNT(DISTINCT wallet)::bigint AS count FROM (${allWalletsSql}) w`),
  ]);

  const streamEventCount = Number.parseInt(streamCountRow?.count || '0', 10);
  const vaultEventCount = Number.parseInt(vaultCountRow?.count || '0', 10);
  const bridgeTransactionCount = Number.parseInt(bridgeCountRow?.count || '0', 10);
  const totalTransactions =
    Number.parseInt(totalStreamCountRow?.count || '0', 10) +
    Number.parseInt(totalVaultCountRow?.count || '0', 10) +
    Number.parseInt(totalBridgeCountRow?.count || '0', 10);
  const registeredUsers = Number.parseInt(allTimeUniqueWalletsRow?.count || '0', 10);
  const activeWalletsAllTime = Number.parseInt(activeWalletsAllTimeRow?.count || '0', 10);

  return {
    available: true,
    windowDays,
    source: eventSourceMode.source,
    capturesPayloadSignedTransactions: eventSourceMode.capturesPayloadSignedTransactions,
    transactionCount: streamEventCount + vaultEventCount + bridgeTransactionCount,
    streamEventCount,
    vaultEventCount,
    bridgeTransactionCount,
    // uniqueWallets = wallets that transacted within the activity window
    // (event-derived). activeWalletsAllTime and registeredUsers are reported
    // separately to avoid conflating transacting wallets with registered users.
    uniqueWallets: Number.parseInt(windowUniqueWalletsRow?.count || '0', 10),
    activeWalletsAllTime,
    registeredUsers,
    observedWithdrawVolumeUsd: volume.last30dUsd,
    volumeUsd: {
      last24h: volume.last24hUsd,
      last7d: volume.last7dUsd,
      last30d: volume.last30dUsd,
    },
    dau: Number.parseInt(dauRow?.count || '0', 10),
    totalTransactions,
    uniqueWalletsAllTime: activeWalletsAllTime,
    lastObservedActivityAt: latestRow?.latest_at || null,
    lastUpdatedAt: latestRow?.latest_at || null,
  };
}

export async function getAnalyticsContracts() {
  const programIds = getResolvedProgramIds();
  return {
    streamCore: programIds['stream-core'] || null,
    tokenVault: programIds['token-vault'] || null,
    growToken: programIds['grow-token'] || null,
    splitsRouter: programIds['splits-router'] || null,
    distributionPool: programIds['distribution-pool'] || null,
    liquidationManager: programIds['liquidation-manager'] || null,
  };
}

export async function getAnalyticsExplorerLinks() {
  const contracts = await getAnalyticsContracts();
  return [
    { key: 'streamCore', name: 'StreamCore', address: contracts.streamCore, explorerUrl: getProgramExplorerUrl(contracts.streamCore), network: 'vara-mainnet' },
    { key: 'tokenVault', name: 'TokenVault', address: contracts.tokenVault, explorerUrl: getProgramExplorerUrl(contracts.tokenVault), network: 'vara-mainnet' },
    { key: 'growToken', name: 'Grow Token', address: contracts.growToken, explorerUrl: getProgramExplorerUrl(contracts.growToken), network: 'vara-mainnet' },
    { key: 'splitsRouter', name: 'SplitsRouter', address: contracts.splitsRouter, explorerUrl: getProgramExplorerUrl(contracts.splitsRouter), network: 'vara-mainnet' },
    { key: 'distributionPool', name: 'DistributionPool', address: contracts.distributionPool, explorerUrl: getProgramExplorerUrl(contracts.distributionPool), network: 'vara-mainnet' },
    { key: 'liquidationManager', name: 'LiquidationManager', address: contracts.liquidationManager, explorerUrl: getProgramExplorerUrl(contracts.liquidationManager), network: 'vara-mainnet' },
  ].filter((contract) => contract.address);
}

export async function getTotalRegisteredUsers() {
  if (!getPool()) {
    return { count: 0, available: false };
  }
  try {
    const result = await queryOne(`SELECT COUNT(*)::bigint AS count FROM users WHERE ${USERS_EXCLUDE_TEST_SQL}`);
    return { count: Number.parseInt(result?.count || '0', 10), available: true };
  } catch (err) {
    console.error('[analytics] Failed to get total registered users:', err.message);
    return { count: 0, available: false };
  }
}

/**
 * Distinct-user metrics across GrowStreams' two independent registration
 * systems plus the contributor track. These systems do NOT sync — the same
 * wallet can appear in more than one — so we report each population labeled by
 * source and a deduplicated union as the true platform reach.
 *   - campaignUsers   : users table (campaign system: GitHub/X handles)
 *   - questParticipants: quest_registrations (quest system: invite + email OTP)
 *   - contributors    : participants table (OSS/content tracks)
 *   - totalDistinctWallets: dedup UNION of wallets across all three (test-excluded)
 */
export async function getPlatformUserMetrics() {
  if (!getPool()) {
    return {
      totalDistinctWallets: 0,
      bySystem: { campaignUsers: 0, questParticipants: 0, contributors: 0 },
      available: false,
    };
  }
  try {
    const [campaignUsers, questParticipants, contributors, distinct] = await Promise.all([
      queryOne(`SELECT COUNT(*)::bigint AS count FROM users WHERE ${USERS_EXCLUDE_TEST_SQL}`),
      queryOne('SELECT COUNT(DISTINCT wallet)::bigint AS count FROM quest_registrations WHERE wallet IS NOT NULL'),
      queryOne('SELECT COUNT(DISTINCT wallet)::bigint AS count FROM participants WHERE wallet IS NOT NULL'),
      queryOne(`
        SELECT COUNT(DISTINCT w)::bigint AS count FROM (
          SELECT LOWER(wallet) AS w FROM users WHERE wallet IS NOT NULL AND ${USERS_EXCLUDE_TEST_SQL}
          UNION
          SELECT LOWER(wallet) AS w FROM quest_registrations WHERE wallet IS NOT NULL
          UNION
          SELECT LOWER(wallet) AS w FROM participants WHERE wallet IS NOT NULL
        ) AS all_wallets
      `),
    ]);
    return {
      totalDistinctWallets: Number.parseInt(distinct?.count || '0', 10),
      bySystem: {
        campaignUsers: Number.parseInt(campaignUsers?.count || '0', 10),
        questParticipants: Number.parseInt(questParticipants?.count || '0', 10),
        contributors: Number.parseInt(contributors?.count || '0', 10),
      },
      note: 'Campaign and Quest are separate registration systems; the same wallet may appear in both. totalDistinctWallets dedupes by wallet across all systems.',
      available: true,
    };
  } catch (err) {
    console.error('[analytics] Failed to get platform user metrics:', err.message);
    return {
      totalDistinctWallets: 0,
      bySystem: { campaignUsers: 0, questParticipants: 0, contributors: 0 },
      available: false,
    };
  }
}

/**
 * Off-chain engagement: invite usage, referrals, vouchers, campaign likes.
 */
export async function getEngagementMetrics() {
  if (!getPool()) {
    return { invitesCreated: 0, invitesUsed: 0, referrals: 0, vouchersIssued: 0, campaignLikes: 0, available: false };
  }
  try {
    const [invites, referrals, vouchers, likes] = await Promise.all([
      queryOne('SELECT COUNT(*)::bigint AS created, COALESCE(SUM(current_uses), 0)::bigint AS used FROM quest_invites'),
      queryOne('SELECT COUNT(*)::bigint AS count FROM referrals'),
      queryOne('SELECT COUNT(*)::bigint AS count FROM vouchers'),
      queryOne('SELECT COUNT(*)::bigint AS count FROM campaign_likes'),
    ]);
    return {
      invitesCreated: Number.parseInt(invites?.created || '0', 10),
      invitesUsed: Number.parseInt(invites?.used || '0', 10),
      referrals: Number.parseInt(referrals?.count || '0', 10),
      vouchersIssued: Number.parseInt(vouchers?.count || '0', 10),
      campaignLikes: Number.parseInt(likes?.count || '0', 10),
      available: true,
    };
  } catch (err) {
    console.error('[analytics] Failed to get engagement metrics:', err.message);
    return { invitesCreated: 0, invitesUsed: 0, referrals: 0, vouchersIssued: 0, campaignLikes: 0, available: false };
  }
}

/**
 * Catalog/state metrics: active vs total quests & campaigns, seasons.
 */
export async function getCatalogMetrics() {
  if (!getPool()) {
    return { activeQuests: 0, totalQuests: 0, activeCampaigns: 0, totalCampaigns: 0, activeSeasons: 0, totalSeasons: 0, available: false };
  }
  try {
    const [quests, campaigns, seasons] = await Promise.all([
      queryOne('SELECT COUNT(*) FILTER (WHERE active = true)::bigint AS active, COUNT(*)::bigint AS total FROM quests'),
      queryOne(`SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active, COUNT(*)::bigint AS total FROM quest_campaigns`),
      queryOne(`SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active, COUNT(*)::bigint AS total FROM seasons`),
    ]);
    return {
      activeQuests: Number.parseInt(quests?.active || '0', 10),
      totalQuests: Number.parseInt(quests?.total || '0', 10),
      activeCampaigns: Number.parseInt(campaigns?.active || '0', 10),
      totalCampaigns: Number.parseInt(campaigns?.total || '0', 10),
      activeSeasons: Number.parseInt(seasons?.active || '0', 10),
      totalSeasons: Number.parseInt(seasons?.total || '0', 10),
      available: true,
    };
  } catch (err) {
    console.error('[analytics] Failed to get catalog metrics:', err.message);
    return { activeQuests: 0, totalQuests: 0, activeCampaigns: 0, totalCampaigns: 0, activeSeasons: 0, totalSeasons: 0, available: false };
  }
}

/**
 * Platform DAU — distinct wallets that took ANY off-chain platform action today
 * (quest completions, seeds/XP ledger entries). This is distinct from on-chain
 * DAU (which counts vault/stream/bridge transactions and stays 0 until the chain
 * event indexer is built — Task C).
 */
export async function getPlatformDau() {
  if (!getPool()) return 0;
  const startOfToday = startOfUtcDay().toISOString();
  try {
    const row = await queryOne(`
      SELECT COUNT(DISTINCT wallet)::bigint AS count FROM (
        SELECT wallet FROM quest_completions WHERE created_at >= $1 AND wallet IS NOT NULL
        UNION
        SELECT wallet FROM seeds_ledger WHERE created_at >= $1 AND wallet IS NOT NULL
        UNION
        SELECT wallet FROM xp_events WHERE created_at >= $1 AND wallet IS NOT NULL
      ) AS active
    `, [startOfToday]);
    return Number.parseInt(row?.count || '0', 10);
  } catch (err) {
    console.error('[analytics] Failed to get platform DAU:', err.message);
    return 0;
  }
}

/**
 * Vara.eth (EVM) stream metrics from the evm_streams table.
 */
export async function getEvmStreamMetrics() {
  if (!getPool()) {
    return { count: 0, available: false };
  }
  try {
    const row = await queryOne('SELECT COUNT(*)::bigint AS count FROM evm_streams');
    return { count: Number.parseInt(row?.count || '0', 10), available: true };
  } catch (err) {
    console.error('[analytics] Failed to get evm stream metrics:', err.message);
    return { count: 0, available: false };
  }
}

export async function getQuestMetrics() {
  if (!getPool()) {
    return { registrations: 0, completions: 0, seedsDistributed: 0, activeQuests: 0, totalQuests: 0, available: false };
  }
  try {
    const [registrations, completions, seeds, quests] = await Promise.all([
      queryOne('SELECT COUNT(*)::bigint AS count FROM quest_registrations'),
      queryOne("SELECT COUNT(*)::bigint AS count FROM quest_completions WHERE status = 'VERIFIED'"),
      queryOne('SELECT COALESCE(SUM(delta), 0)::bigint AS total FROM seeds_ledger'),
      queryOne('SELECT COUNT(*) FILTER (WHERE active = true)::bigint AS active, COUNT(*)::bigint AS total FROM quests'),
    ]);
    return {
      registrations: Number.parseInt(registrations?.count || '0', 10),
      completions: Number.parseInt(completions?.count || '0', 10),
      seedsDistributed: Number.parseInt(seeds?.total || '0', 10),
      activeQuests: Number.parseInt(quests?.active || '0', 10),
      totalQuests: Number.parseInt(quests?.total || '0', 10),
      available: true,
    };
  } catch (err) {
    console.error('[analytics] Failed to get quest metrics:', err.message);
    return { registrations: 0, completions: 0, seedsDistributed: 0, activeQuests: 0, totalQuests: 0, available: false };
  }
}

export async function getContributorMetrics() {
  if (!getPool()) {
    return { participants: 0, contributions: 0, xpEvents: 0, available: false };
  }
  try {
    const [participants, contributions, xpEvents] = await Promise.all([
      queryOne('SELECT COUNT(*)::bigint AS count FROM participants'),
      queryOne('SELECT COUNT(*)::bigint AS count FROM contributions'),
      queryOne('SELECT COUNT(*)::bigint AS count FROM xp_events'),
    ]);
    return {
      participants: Number.parseInt(participants?.count || '0', 10),
      contributions: Number.parseInt(contributions?.count || '0', 10),
      xpEvents: Number.parseInt(xpEvents?.count || '0', 10),
      available: true,
    };
  } catch (err) {
    console.error('[analytics] Failed to get contributor metrics:', err.message);
    return { participants: 0, contributions: 0, xpEvents: 0, available: false };
  }
}

export async function getCampaignMetrics() {
  if (!getPool()) {
    return { participants: 0, payouts: 0, available: false };
  }
  try {
    const [participants, payouts] = await Promise.all([
      queryOne('SELECT COUNT(*)::bigint AS count FROM campaign_participants'),
      queryOne('SELECT COUNT(*)::bigint AS count FROM campaign_payouts'),
    ]);
    return {
      participants: Number.parseInt(participants?.count || '0', 10),
      payouts: Number.parseInt(payouts?.count || '0', 10),
      available: true,
    };
  } catch (err) {
    console.error('[analytics] Failed to get campaign metrics:', err.message);
    return { participants: 0, payouts: 0, available: false };
  }
}

/**
 * Protocol fee revenue. The 2.5% entry fee skimmed on stream create/deposit is
 * emitted on-chain as TokenVault `FeeCollected`, indexed into vault_events with
 * event_type = 'fee' (see buildVaultEventLog in event-indexer.mjs). This sums
 * those rows, prices each token live, and buckets by 24h/7d/30d window.
 *
 * Returns zeros (available:false) until the first fee is collected on the newly
 * deployed fee-bearing contracts — old streams live on the prior contracts and
 * never emitted fees.
 */
export async function getProtocolFees(days = DEFAULT_ACTIVITY_WINDOW_DAYS) {
  const windowDays = clampInt(days, 1, 365, DEFAULT_ACTIVITY_WINDOW_DAYS);
  if (!getPool()) {
    return {
      available: false,
      windowDays,
      source: 'on_chain_event_indexer',
      totalFeesUsd: 0,
      last24hUsd: 0,
      last7dUsd: 0,
      last30dUsd: 0,
      byToken: [],
    };
  }

  const rows = await queryAll(
    `SELECT token_symbol, token_address, amount, created_at AS event_at
     FROM vault_events
     WHERE event_type = 'fee' AND amount IS NOT NULL`
  ).catch(() => []);

  const now = Date.now();
  const windows = {
    last24h: now - 24 * 60 * 60 * 1000,
    last7d: now - 7 * 24 * 60 * 60 * 1000,
    last30d: now - 30 * 24 * 60 * 60 * 1000,
  };

  // Aggregate raw fee amounts per token (all-time) for the byToken breakdown.
  const perToken = new Map(); // symbol -> bigint
  const symbols = new Set();
  for (const row of rows) {
    if (row.token_symbol) symbols.add(row.token_symbol);
    const sym = row.token_symbol || 'UNKNOWN';
    try {
      perToken.set(sym, (perToken.get(sym) || 0n) + BigInt(row.amount));
    } catch { /* skip unparseable */ }
  }

  const priced = symbols.size ? await getBatchPricesDetailed(Array.from(symbols)) : {};
  const priceFor = (symbol, token) => {
    const info = priced[symbol];
    if (info?.price != null) return info.price;
    return token?.fallbackPrice ?? (token?.isStablecoin ? 1 : 0);
  };

  let totalFeesUsd = 0;
  const byToken = [];
  for (const [symbol, rawTotal] of perToken.entries()) {
    const token = getToken(symbol);
    const decimals = token?.decimals ?? 12;
    const amountDisplay = toDisplayUnits(rawTotal.toString(), decimals);
    const price = priceFor(symbol, token);
    const feesUsd = roundNumber(toNumberValue(amountDisplay) * price);
    totalFeesUsd += feesUsd;
    byToken.push({
      symbol,
      amountRaw: rawTotal.toString(),
      amountDisplay,
      price,
      feesUsd,
    });
  }
  byToken.sort((a, b) => b.feesUsd - a.feesUsd);

  // Windowed USD totals (per-row, so each fee lands in the correct bucket).
  let last24hUsd = 0, last7dUsd = 0, last30dUsd = 0;
  for (const row of rows) {
    const token = getToken(row.token_symbol);
    const decimals = token?.decimals ?? 12;
    const amountDisplay = toDisplayUnits(row.amount, decimals);
    const usd = toNumberValue(amountDisplay) * priceFor(row.token_symbol, token);
    const at = new Date(row.event_at).getTime();
    if (at >= windows.last24h) last24hUsd += usd;
    if (at >= windows.last7d) last7dUsd += usd;
    if (at >= windows.last30d) last30dUsd += usd;
  }

  return {
    available: true,
    windowDays,
    source: 'on_chain_event_indexer',
    feeBps: 250,
    feePercent: 2.5,
    totalFeesUsd: roundNumber(totalFeesUsd),
    last24hUsd: roundNumber(last24hUsd),
    last7dUsd: roundNumber(last7dUsd),
    last30dUsd: roundNumber(last30dUsd),
    byToken,
    note: 'Protocol fee (2.5%) collected on stream create/deposit across all paths — vault/VFT, native VARA, and gVARA super-token streams. Sourced from on-chain FeeCollected events.',
  };
}

/**
 * 30-day retention cohorts. A wallet's "first seen" is the earliest on-chain
 * activity (stream sender/receiver OR vault wallet). Wallets are grouped into
 * weekly cohorts by first-seen week; a wallet is "retained" if it has ANY
 * further activity at least 24h after first-seen and within `days` days. The
 * headline `retentionRate` is the wallet-weighted average across all cohorts
 * old enough to have a full observation window.
 */
export async function getRetentionCohorts({ days = 30 } = {}) {
  const windowDays = clampInt(days, 1, 365, 30);
  if (!getPool()) {
    return { available: false, windowDays, retentionRate: 0, cohorts: [] };
  }

  // Unified per-wallet activity timeline from on-chain event tables.
  const activitySql = `
    SELECT LOWER(wallet) AS wallet, created_at FROM (
      SELECT sender AS wallet, created_at FROM stream_events
        WHERE sender IS NOT NULL AND sender <> 'unknown'
      UNION ALL
      SELECT receiver AS wallet, created_at FROM stream_events
        WHERE receiver IS NOT NULL AND receiver <> 'unknown'
      UNION ALL
      SELECT wallet, created_at FROM vault_events
        WHERE wallet IS NOT NULL AND wallet <> 'unknown'
    ) a
  `;

  const cohorts = await queryAll(`
    WITH activity AS (${activitySql}),
    first_seen AS (
      SELECT wallet, MIN(created_at) AS first_at FROM activity GROUP BY wallet
    ),
    retained AS (
      SELECT fs.wallet,
             DATE_TRUNC('week', fs.first_at) AS cohort_week,
             fs.first_at,
             EXISTS (
               SELECT 1 FROM activity a
               WHERE a.wallet = fs.wallet
                 AND a.created_at >= fs.first_at + INTERVAL '24 hours'
                 AND a.created_at <= fs.first_at + ($1 * INTERVAL '1 day')
             ) AS is_retained
      FROM first_seen fs
    )
    SELECT cohort_week,
           COUNT(*)::int AS cohort_size,
           COUNT(*) FILTER (WHERE is_retained)::int AS retained_count
    FROM retained
    -- Only cohorts old enough to have a complete observation window.
    WHERE cohort_week <= NOW() - ($1 * INTERVAL '1 day')
    GROUP BY cohort_week
    ORDER BY cohort_week ASC
  `, [windowDays]).catch((err) => {
    console.error('[analytics] retention cohort query failed:', err.message);
    return [];
  });

  let totalCohort = 0, totalRetained = 0;
  const cohortRows = cohorts.map((c) => {
    const size = Number.parseInt(c.cohort_size || '0', 10);
    const retained = Number.parseInt(c.retained_count || '0', 10);
    totalCohort += size;
    totalRetained += retained;
    return {
      cohortWeek: c.cohort_week,
      cohortSize: size,
      retainedCount: retained,
      retentionRate: size > 0 ? roundNumber((retained / size) * 100, 2) : 0,
    };
  });

  return {
    available: true,
    windowDays,
    source: 'on_chain_event_indexer',
    retentionRate: totalCohort > 0 ? roundNumber((totalRetained / totalCohort) * 100, 2) : 0,
    cohortWallets: totalCohort,
    retainedWallets: totalRetained,
    cohorts: cohortRows,
    note: `A wallet is retained if it transacts again 24h–${windowDays}d after first on-chain activity. Only cohorts with a complete ${windowDays}-day window are counted.`,
  };
}

export async function getAnalyticsSummary(days = DEFAULT_ACTIVITY_WINDOW_DAYS) {
  const [
    tvl, activity, streamMetrics, contracts, explorerLinks, freshness,
    totalUsers, questMetrics, contributorMetrics, campaignMetrics,
    platformUsers, engagement, catalog, evmStreams, platformDau,
    protocolFees, retention,
  ] = await Promise.all([
    getCurrentTvl(),
    getObservedActivity(days),
    getOnchainStreamMetrics(),
    getAnalyticsContracts(),
    getAnalyticsExplorerLinks(),
    getLatestFreshness(),
    getTotalRegisteredUsers(),
    getQuestMetrics(),
    getContributorMetrics(),
    getCampaignMetrics(),
    getPlatformUserMetrics(),
    getEngagementMetrics(),
    getCatalogMetrics(),
    getEvmStreamMetrics(),
    getPlatformDau(),
    getProtocolFees(days),
    getRetentionCohorts({ days }),
  ]);

  const protocol = {
    totalStreams: streamMetrics.totalStreams,
    activeStreams: streamMetrics.activeStreams,
  };

  // ── Two clearly-separated domains ──────────────────────────────────────────
  // onchain: DeFi / blockchain activity (source of truth = Vara chain).
  // platform: off-chain GrowStreams app activity (quests, XP, invites, campaigns).
  //
  // On-chain activity is reconstructed by POLLING StreamCore state (the contract
  // emits no events — see docs/BLOCKER-onchain-events-and-fees.md). Volume, unique
  // wallets, DAU and MAU come from real on-chain stream data + timestamps.
  const onchain = {
    tvl,
    streams: protocol,
    activity: {
      source: streamMetrics.source, // 'onchain_state_polling'
      // Combined on-chain wallet activity = streams ∪ XP-mint wallets (exact union).
      uniqueWallets: streamMetrics.uniqueWallets,
      dau: streamMetrics.dau,
      mau: streamMetrics.mau,
      // Volume (streaming).
      totalStreams: streamMetrics.totalStreams,
      activeStreams: streamMetrics.activeStreams,
      volumeUsd: streamMetrics.totalVolumeUsd,
      byToken: streamMetrics.byToken,
      // Streaming-specific wallet counts (strict KPI: created/received streams).
      streaming: {
        wallets: streamMetrics.streamWallets,
        dau: streamMetrics.streamDau,
        mau: streamMetrics.streamMau,
      },
      // On-chain XP/seeds activity (verifiable via seeds_ledger.tx_hash).
      xpSeeds: {
        activeWalletsAllTime: streamMetrics.seedsActiveWalletsAllTime,
        dau: streamMetrics.seedsDau,
        mau: streamMetrics.seedsMau,
      },
      note: streamMetrics.note,
      backendLogged: {
        transactionCount: activity.totalTransactions,
        source: activity.source,
      },
    },
    // Protocol fee revenue (2.5% entry fee) — a headline Phase-2 grant KPI.
    fees: protocolFees,
    // 30-day retention cohorts — a headline Phase-2 grant KPI.
    retention,
  };

  const platform = {
    users: {
      totalDistinctWallets: platformUsers.totalDistinctWallets,
      bySystem: platformUsers.bySystem,
      note: platformUsers.note,
      available: platformUsers.available,
    },
    quests: {
      registrations: questMetrics.registrations,
      completions: questMetrics.completions,
      seedsDistributed: questMetrics.seedsDistributed,
      activeQuests: questMetrics.activeQuests,
      totalQuests: questMetrics.totalQuests,
      available: questMetrics.available,
    },
    campaigns: {
      participants: campaignMetrics.participants,
      payouts: campaignMetrics.payouts,
      activeCampaigns: catalog.activeCampaigns,
      totalCampaigns: catalog.totalCampaigns,
      likes: engagement.campaignLikes,
      available: campaignMetrics.available,
    },
    engagement: {
      invitesCreated: engagement.invitesCreated,
      invitesUsed: engagement.invitesUsed,
      referrals: engagement.referrals,
      vouchersIssued: engagement.vouchersIssued,
      campaignLikes: engagement.campaignLikes,
      available: engagement.available,
    },
    contributors: {
      participants: contributorMetrics.participants,
      contributions: contributorMetrics.contributions,
      xpEvents: contributorMetrics.xpEvents,
      available: contributorMetrics.available,
    },
    seasons: {
      active: catalog.activeSeasons,
      total: catalog.totalSeasons,
      available: catalog.available,
    },
    evmStreams: {
      count: evmStreams.count,
      available: evmStreams.available,
    },
    dau: platformDau,
  };

  return {
    generatedAt: new Date().toISOString(),
    contracts,
    explorerLinks,
    // New clearly-labeled domains.
    onchain,
    platform,
    // ── Backward-compatible flat fields (deprecated; prefer onchain/platform) ──
    protocol,
    tvl,
    activity,
    users: {
      totalRegistered: totalUsers.count,
      totalDistinctWallets: platformUsers.totalDistinctWallets,
      available: totalUsers.available,
    },
    quests: {
      registrations: questMetrics.registrations,
      completions: questMetrics.completions,
      seedsDistributed: questMetrics.seedsDistributed,
      available: questMetrics.available,
    },
    contributors: {
      participants: contributorMetrics.participants,
      contributions: contributorMetrics.contributions,
      xpEvents: contributorMetrics.xpEvents,
      available: contributorMetrics.available,
    },
    campaigns: {
      participants: campaignMetrics.participants,
      payouts: campaignMetrics.payouts,
      available: campaignMetrics.available,
    },
    kpis: {
      // ── On-chain protocol KPIs (Phase 2 grant targets) ──────────────────────
      tvlUsd: tvl.totals.estimatedUsd,
      // Protocol fee revenue (2.5% entry fee, on-chain FeeCollected events).
      protocolFeesUsd: protocolFees.totalFeesUsd,
      protocolFees24hUsd: protocolFees.last24hUsd,
      protocolFees30dUsd: protocolFees.last30dUsd,
      // 30-day retention rate (% of cohort wallets that returned).
      retentionRate: retention.retentionRate,
      // Streaming volume (live per-stream `streamed`, summed, priced).
      onchainVolumeUsd: streamMetrics.totalVolumeUsd,
      totalStreams: streamMetrics.totalStreams,
      activeStreams: streamMetrics.activeStreams,
      // Strict KPI: wallets that created/received streams.
      uniqueStreamWallets: streamMetrics.streamWallets,
      // Broad on-chain activity (streams ∪ on-chain XP mints; all tx-verifiable).
      onchainActiveWallets: streamMetrics.uniqueWallets,
      onchainDau: streamMetrics.dau,
      onchainMau: streamMetrics.mau,
      // ── Off-chain platform KPIs ─────────────────────────────────────────────
      platformDau,
      totalRegisteredUsers: totalUsers.count,
      totalDistinctWallets: platformUsers.totalDistinctWallets,
      questParticipants: platformUsers.bySystem.questParticipants,
      questRegistrations: questMetrics.registrations,
      questCompletions: questMetrics.completions,
      contributorCount: contributorMetrics.participants,
      backendLoggedVolumeUsd: {
        last24h: activity.volumeUsd.last24h,
        last7d: activity.volumeUsd.last7d,
        last30d: activity.volumeUsd.last30d,
      },
    },
    freshness: {
      ...freshness,
      lastUpdatedAt: freshness.lastUpdatedAt || activity.lastUpdatedAt,
    },
    coverage: {
      tvlSource: 'onchain_balanceof_live',
      streamCountsSource: 'onchain_stream_core_queries',
      onchainActivitySource: streamMetrics.source, // onchain_state_polling
      onchainActivityNote: 'Streams/volume/wallets/DAU/MAU reconstructed by polling StreamCore state; the contract emits no events (see docs/BLOCKER-onchain-events-and-fees.md). Protocol-fee KPI still blocked (no fee logic on-chain).',
      platformUsersSource: 'users + quest_registrations + participants (deduped by wallet, test-excluded)',
      notes: [
        'Two domains are reported separately: onchain (DeFi / Vara chain) and platform (off-chain GrowStreams app).',
        'TVL is read live from on-chain VFT BalanceOf of the vault per deployed token, plus native VARA held by the vault.',
        tvl.meta?.tokensNotDeployedOnChain?.length
          ? `Tokens not yet deployed on Vara mainnet (reported as 0): ${tvl.meta.tokensNotDeployedOnChain.join(', ')}.`
          : 'All tracked token contracts are deployed on-chain.',
        tvl.pricing?.placeholderPriced?.length
          ? `USD uses CoinGecko live pricing; placeholder (non-market) price applied to: ${tvl.pricing.placeholderPriced.join(', ')}.`
          : 'USD estimates use CoinGecko real-time pricing for all tokens with balances.',
        activity.capturesPayloadSignedTransactions
          ? 'On-chain activity includes payload-signed transactions captured via the chain event indexer.'
          : 'On-chain volume / DAU / unique-wallet counts await the chain event indexer (Task C); they currently reflect backend-logged transactions only.',
        'GrowStreams has TWO independent registration systems that do not sync: Campaign (users table) and Quest (quest_registrations). The same wallet may exist in both. platform.users.totalDistinctWallets dedupes across both plus the contributor track.',
        'platform.dau counts distinct wallets with any off-chain action today (quest completions, seeds/XP); onchain.activity.dau counts on-chain transactions only.',
        'Quest metrics: registrations, verified completions, XP/seeds distributed, active quests. Engagement: invites, referrals, vouchers, campaign likes. Plus seasons and Vara.eth (EVM) streams.',
      ],
    },
  };
}

export async function persistAnalyticsSnapshot(days = DEFAULT_ACTIVITY_WINDOW_DAYS) {
  const pool = getPool();
  if (!pool) {
    return { saved: false, reason: 'database_not_configured' };
  }

  const [tvl, activity, streamMetrics, freshness] = await Promise.all([
    getCurrentTvl(),
    getObservedActivity(days),
    getOnchainStreamMetrics(),
    getLatestFreshness(),
  ]);

  const client = await pool.connect();
  const snappedAt = new Date();

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO analytics_protocol_snapshots
        (
          snapped_at,
          estimated_tvl_usd,
          estimated_stablecoin_tvl_usd,
          total_streams,
          active_streams,
          observed_stream_event_count,
          observed_vault_event_count,
          observed_unique_wallets,
          observed_withdraw_volume_usd,
          observed_window_days,
          observed_volume_source,
          volume_24h_usd,
          volume_7d_usd,
          volume_30d_usd,
          dau,
          total_transactions,
          unique_wallets_all_time,
          last_activity_at,
          last_updated_at,
          onchain_volume_usd,
          onchain_unique_wallets,
          onchain_dau,
          onchain_mau,
          seeds_active_wallets,
          stream_wallets
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
      [
        snappedAt,
        tvl.totals.estimatedUsd,
        tvl.totals.estimatedStablecoinUsd,
        streamMetrics.totalStreams,
        streamMetrics.activeStreams,
        activity.streamEventCount,
        activity.vaultEventCount,
        activity.uniqueWallets,
        activity.observedWithdrawVolumeUsd,
        activity.windowDays,
        activity.source,
        activity.volumeUsd.last24h,
        activity.volumeUsd.last7d,
        activity.volumeUsd.last30d,
        activity.dau,
        activity.totalTransactions,
        activity.uniqueWalletsAllTime,
        activity.lastObservedActivityAt,
        freshness.lastUpdatedAt,
        streamMetrics.totalVolumeUsd,
        streamMetrics.uniqueWallets,
        streamMetrics.dau,
        streamMetrics.mau,
        streamMetrics.seedsActiveWalletsAllTime,
        streamMetrics.streamWallets,
      ]
    );

    for (const token of tvl.tokens) {
      await client.query(
        `INSERT INTO analytics_tvl_snapshots
          (
            snapped_at,
            vault_address,
            token_key,
            token_symbol,
            token_address,
            balance_raw,
            balance_display,
            estimated_usd,
            pricing_source,
            is_stablecoin
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          snappedAt,
          tvl.vaultAddress,
          token.key,
          token.symbol,
          token.address,
          token.balanceRaw,
          token.balanceDisplay,
          token.estimatedUsd,
          token.pricingSource,
          token.isStablecoin,
        ]
      );
    }

    await client.query('COMMIT');
    return {
      saved: true,
      snappedAt: snappedAt.toISOString(),
      tokenCount: tvl.tokens.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getAnalyticsHistory(hours = 24 * 7) {
  const lookbackHours = clampInt(hours, 1, 24 * 365, 24 * 7);
  if (!getPool()) {
    return {
      available: false,
      lookbackHours,
      snapshots: [],
    };
  }

  const snapshots = await queryAll(
    `SELECT
        snapped_at,
        estimated_tvl_usd,
        estimated_stablecoin_tvl_usd,
        total_streams,
        active_streams,
        observed_stream_event_count,
        observed_vault_event_count,
        observed_unique_wallets,
        observed_withdraw_volume_usd,
        observed_window_days,
        observed_volume_source,
        volume_24h_usd,
        volume_7d_usd,
        volume_30d_usd,
        dau,
        total_transactions,
        unique_wallets_all_time,
        last_activity_at,
        last_updated_at
      FROM analytics_protocol_snapshots
      WHERE snapped_at >= NOW() - ($1 * INTERVAL '1 hour')
      ORDER BY snapped_at ASC`,
    [lookbackHours]
  );

  return {
    available: true,
    lookbackHours,
    snapshots,
  };
}

export async function getTvlHistory(days = 30) {
  const lookbackDays = clampInt(days, 1, 365, 30);
  if (!getPool()) {
    return {
      available: false,
      lookbackDays,
      points: [],
    };
  }

  const points = await queryAll(
    `SELECT DISTINCT ON (DATE(snapped_at))
        DATE(snapped_at) AS date,
        estimated_tvl_usd AS tvl_usd,
        estimated_stablecoin_tvl_usd AS stablecoin_tvl_usd,
        snapped_at
      FROM analytics_protocol_snapshots
      WHERE snapped_at >= NOW() - ($1 * INTERVAL '1 day')
      ORDER BY DATE(snapped_at), snapped_at DESC`,
    [lookbackDays]
  );

  return {
    available: true,
    lookbackDays,
    points,
  };
}

/**
 * Historical on-chain activity series (one point per day) for dashboard graphs:
 * volume, unique wallets, DAU, MAU, stream counts. Read from the hourly
 * analytics_protocol_snapshots (newest snapshot per day).
 */
export async function getActivityHistory(days = 30) {
  const lookbackDays = clampInt(days, 1, 365, 30);
  if (!getPool()) {
    return { available: false, lookbackDays, points: [] };
  }

  const points = await queryAll(
    `SELECT DISTINCT ON (DATE(snapped_at))
        DATE(snapped_at) AS date,
        snapped_at,
        estimated_tvl_usd AS tvl_usd,
        onchain_volume_usd,
        onchain_unique_wallets,
        onchain_dau,
        onchain_mau,
        seeds_active_wallets,
        stream_wallets,
        total_streams,
        active_streams
      FROM analytics_protocol_snapshots
      WHERE snapped_at >= NOW() - ($1 * INTERVAL '1 day')
      ORDER BY DATE(snapped_at), snapped_at DESC`,
    [lookbackDays]
  );

  return {
    available: true,
    lookbackDays,
    points,
  };
}

export async function getVolumeHistory(days = 30) {
  const lookbackDays = clampInt(days, 1, 365, 30);
  const volume = await getVolumeMetrics(lookbackDays);
  return {
    available: true,
    lookbackDays,
    source: volume.source,
    coverage: volume.coverage,
    points: volume.series,
  };
}

// Build a Vara extrinsic explorer URL from a tx hash.
function extrinsicExplorerUrl(hash) {
  return hash
    ? `https://idea.gear-tech.io/extrinsics/${hash}?node=wss%3A%2F%2Frpc.vara.network`
    : null;
}

/**
 * Recent transactions feed across all sources, with on-chain explorer links and
 * server-side pagination.
 *
 * Sources: stream_events, vault_events, bridge_transactions, AND seeds_ledger
 * (on-chain XP mints — the dominant real on-chain activity, each with a verifiable
 * tx_hash). Every row exposes explorerUrl when a hash is present so activity can
 * be independently verified on idea.gear-tech.io.
 *
 * @param {number} limit  page size
 * @param {number} offset rows to skip (server-side pagination)
 */
export async function getRecentTransactions(limit = 50, offset = 0) {
  if (!getPool()) {
    return { available: false, transactions: [], count: 0, total: 0, limit, offset };
  }

  // We over-fetch (limit+offset) from each source, merge, sort, then page the
  // combined set. Counts come from cheap COUNT queries for accurate `total`.
  const fetchN = limit + offset;

  const [streamTx, vaultTx, bridgeTx, xpTx, counts] = await Promise.all([
    queryAll(
      `SELECT id, created_at AS timestamp, event_type, sender, receiver, amount,
              token_symbol, metadata, block_hash, extrinsic_hash
       FROM stream_events
       WHERE (sender IS NOT NULL AND sender != 'unknown')
          OR (receiver IS NOT NULL AND receiver != 'unknown')
       ORDER BY created_at DESC LIMIT $1`,
      [fetchN]
    ).catch(() => []),
    queryAll(
      `SELECT id, created_at AS timestamp, event_type, wallet, amount,
              token_symbol, metadata, block_hash, extrinsic_hash
       FROM vault_events
       WHERE wallet IS NOT NULL AND wallet != 'unknown'
       ORDER BY created_at DESC LIMIT $1`,
      [fetchN]
    ).catch(() => []),
    queryAll(
      `SELECT id, created_at AS timestamp, status, wallet, token_symbol AS token,
              amount, direction, source_tx_hash, destination_tx_hash
       FROM bridge_transactions
       WHERE wallet IS NOT NULL AND wallet != 'unknown'
       ORDER BY created_at DESC LIMIT $1`,
      [fetchN]
    ).catch(() => []),
    // On-chain XP mints — verifiable via tx_hash.
    queryAll(
      `SELECT id, created_at AS timestamp, wallet, delta AS amount, reason, tx_hash, quest_id
       FROM seeds_ledger
       WHERE tx_hash IS NOT NULL AND wallet IS NOT NULL
       ORDER BY created_at DESC LIMIT $1`,
      [fetchN]
    ).catch(() => []),
    queryOne(`
      SELECT
        (SELECT COUNT(*) FROM stream_events WHERE (sender IS NOT NULL AND sender != 'unknown') OR (receiver IS NOT NULL AND receiver != 'unknown'))
        + (SELECT COUNT(*) FROM vault_events WHERE wallet IS NOT NULL AND wallet != 'unknown')
        + (SELECT COUNT(*) FROM bridge_transactions WHERE wallet IS NOT NULL AND wallet != 'unknown')
        + (SELECT COUNT(*) FROM seeds_ledger WHERE tx_hash IS NOT NULL AND wallet IS NOT NULL)
        AS total
    `).catch(() => ({ total: 0 })),
  ]);

  const merged = [
    ...streamTx.map((tx) => ({ ...tx, source: 'stream', explorerUrl: extrinsicExplorerUrl(tx.extrinsic_hash) })),
    ...vaultTx.map((tx) => ({ ...tx, source: 'vault', explorerUrl: extrinsicExplorerUrl(tx.extrinsic_hash) })),
    ...bridgeTx.map((tx) => ({ ...tx, source: 'bridge', explorerUrl: extrinsicExplorerUrl(tx.source_tx_hash) })),
    ...xpTx.map((tx) => ({
      id: tx.id,
      timestamp: tx.timestamp,
      event_type: 'mint',
      wallet: tx.wallet,
      amount: tx.amount,
      token_symbol: 'SEEDS',
      reason: tx.reason,
      extrinsic_hash: tx.tx_hash,
      source: 'xp_mint',
      explorerUrl: extrinsicExplorerUrl(tx.tx_hash),
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const page = merged.slice(offset, offset + limit);
  const total = Number.parseInt(counts?.total || '0', 10);

  return {
    available: true,
    transactions: page,
    count: page.length,
    total,
    limit,
    offset,
    hasMore: offset + page.length < total,
    note: 'Includes on-chain XP mints (seeds_ledger) with verifiable explorer links. explorerUrl points to idea.gear-tech.io for any row with a transaction hash.',
  };
}

export async function getActiveWallets(limit = 50, offset = 0) {
  if (!getPool()) {
    return { available: false, wallets: [], count: 0, total: 0, limit, offset };
  }

  const totalRow = await queryOne(
    `SELECT COUNT(*)::bigint AS total FROM users WHERE ${USERS_EXCLUDE_TEST_SQL}`
  ).catch(() => ({ total: 0 }));

  const users = await queryAll(
    `SELECT
      wallet,
      github_handle,
      x_handle,
      display_name,
      created_at as registered_at
     FROM users
     WHERE ${USERS_EXCLUDE_TEST_SQL}
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  ).catch(() => []);

  const streamWallets = await queryAll(
    `SELECT
      COALESCE(sender, 'unknown') as wallet,
      COUNT(*) as stream_count,
      SUM(CAST(amount AS NUMERIC)) as total_streamed,
      MAX(created_at) as last_activity
     FROM stream_events
     GROUP BY COALESCE(sender, 'unknown')`
  ).catch(() => []);

  const vaultWallets = await queryAll(
    `SELECT
      wallet,
      COUNT(*) as vault_count,
      SUM(CAST(amount AS NUMERIC)) as total_deposited,
      MAX(created_at) as last_activity
     FROM vault_events
     GROUP BY wallet`
  ).catch(() => []);

  const bridgeWallets = await queryAll(
    `SELECT
      wallet,
      COUNT(*) as bridge_count,
      SUM(CAST(amount AS NUMERIC)) as total_bridged,
      MAX(created_at) as last_activity
     FROM bridge_transactions
     GROUP BY wallet`
  ).catch(() => []);

  const streamMap = new Map();
  streamWallets.forEach(w => {
    streamMap.set(w.wallet, {
      streamCount: Number(w.stream_count),
      totalStreamed: Number(w.total_streamed) || 0,
      lastActivity: w.last_activity,
    });
  });

  const vaultMap = new Map();
  vaultWallets.forEach(w => {
    vaultMap.set(w.wallet, {
      vaultCount: Number(w.vault_count),
      totalDeposited: Number(w.total_deposited) || 0,
      lastActivity: w.last_activity,
    });
  });

  const bridgeMap = new Map();
  bridgeWallets.forEach(w => {
    bridgeMap.set(w.wallet, {
      bridgeCount: Number(w.bridge_count),
      totalBridged: Number(w.total_bridged) || 0,
      lastActivity: w.last_activity,
    });
  });

  const wallets = users.map(user => {
    const streamData = streamMap.get(user.wallet) || { streamCount: 0, totalStreamed: 0, lastActivity: null };
    const vaultData = vaultMap.get(user.wallet) || { vaultCount: 0, totalDeposited: 0, lastActivity: null };
    const bridgeData = bridgeMap.get(user.wallet) || { bridgeCount: 0, totalBridged: 0, lastActivity: null };

    const activities = [streamData.lastActivity, vaultData.lastActivity, bridgeData.lastActivity].filter(Boolean);
    const lastActivity = activities.length > 0
      ? activities.reduce((latest, current) => new Date(current) > new Date(latest) ? current : latest)
      : user.registered_at;

    return {
      wallet: user.wallet,
      githubHandle: user.github_handle,
      xHandle: user.x_handle,
      displayName: user.display_name,
      registeredAt: user.registered_at,
      streamCount: streamData.streamCount,
      totalStreamed: streamData.totalStreamed,
      vaultCount: vaultData.vaultCount,
      totalDeposited: vaultData.totalDeposited,
      bridgeCount: bridgeData.bridgeCount,
      totalBridged: bridgeData.totalBridged,
      lastActivity,
    };
  }).sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

  const total = Number.parseInt(totalRow?.total || '0', 10);
  return {
    available: true,
    wallets,
    count: wallets.length,
    total,
    limit,
    offset,
    hasMore: offset + wallets.length < total,
  };
}

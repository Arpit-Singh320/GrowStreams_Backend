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

function roundNumber(value, decimals = 6) {
  return Math.round(value * (10 ** decimals)) / (10 ** decimals);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toNumberValue(value) {
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

function bucketVolume(windowStartMs, eventAtMs, usdValue, volume) {
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

  const [
    streamCountRow,
    vaultCountRow,
    bridgeCountRow,
    latestRow,
    uniqueWalletsRow,
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
    queryOne(`SELECT COUNT(*)::bigint AS count FROM users WHERE created_at >= $1 AND ${USERS_EXCLUDE_TEST_SQL}`, [since]),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM stream_events WHERE ${eventSourceMode.streamConditionSql}`),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM vault_events WHERE ${eventSourceMode.vaultConditionSql}`),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM bridge_transactions`),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM users WHERE ${USERS_EXCLUDE_TEST_SQL}`),
    queryOne(`
      SELECT COUNT(DISTINCT active_user)::bigint AS count
      FROM (
        SELECT sender AS active_user FROM stream_events WHERE ${eventSourceMode.streamConditionSql} AND created_at >= $1 AND sender IS NOT NULL
        UNION
        SELECT receiver AS active_user FROM stream_events WHERE ${eventSourceMode.streamConditionSql} AND created_at >= $1 AND receiver IS NOT NULL
        UNION
        SELECT wallet AS active_user FROM vault_events WHERE ${eventSourceMode.vaultConditionSql} AND created_at >= $1 AND wallet IS NOT NULL
        UNION
        SELECT wallet AS active_user FROM bridge_transactions WHERE created_at >= $1 AND wallet IS NOT NULL
      ) AS active_wallets
    `, [startOfToday]),
    getVolumeMetrics(windowDays),
    // True count of distinct wallets that have transacted (from event tables),
    // distinct from registered-user count. Zero until real activity is indexed.
    queryOne(`
      SELECT COUNT(DISTINCT active_user)::bigint AS count
      FROM (
        SELECT sender AS active_user FROM stream_events WHERE ${eventSourceMode.streamConditionSql} AND sender IS NOT NULL
        UNION
        SELECT receiver AS active_user FROM stream_events WHERE ${eventSourceMode.streamConditionSql} AND receiver IS NOT NULL
        UNION
        SELECT wallet AS active_user FROM vault_events WHERE ${eventSourceMode.vaultConditionSql} AND wallet IS NOT NULL
        UNION
        SELECT wallet AS active_user FROM bridge_transactions WHERE wallet IS NOT NULL
      ) AS active_wallets
    `),
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
    // uniqueWallets = wallets that actually transacted (event-derived), NOT
    // registered users. registeredUsers is reported separately to avoid the
    // prior conflation that inflated this number with the users table count.
    uniqueWallets: activeWalletsAllTime,
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

export async function getAnalyticsSummary(days = DEFAULT_ACTIVITY_WINDOW_DAYS) {
  const [
    tvl, activity, totalStreams, activeStreams, contracts, explorerLinks, freshness,
    totalUsers, questMetrics, contributorMetrics, campaignMetrics,
    platformUsers, engagement, catalog, evmStreams, platformDau,
  ] = await Promise.all([
    getCurrentTvl(),
    getObservedActivity(days),
    contractQuery('streamCore', 'TotalStreams'),
    contractQuery('streamCore', 'ActiveStreams'),
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
  ]);

  const protocol = {
    totalStreams: Number.parseInt(toStringValue(totalStreams), 10),
    activeStreams: Number.parseInt(toStringValue(activeStreams), 10),
  };

  // ── Two clearly-separated domains ──────────────────────────────────────────
  // onchain: DeFi / blockchain activity (source of truth = Vara chain).
  // platform: off-chain GrowStreams app activity (quests, XP, invites, campaigns).
  const onchain = {
    tvl,
    streams: protocol,
    activity: {
      source: activity.source,
      capturesPayloadSignedTransactions: activity.capturesPayloadSignedTransactions,
      transactionCount: activity.totalTransactions,
      uniqueWallets: activity.uniqueWalletsAllTime,
      dau: activity.dau,
      volumeUsd: activity.volumeUsd,
      note: activity.capturesPayloadSignedTransactions
        ? 'On-chain activity captured via event indexer.'
        : 'On-chain volume / DAU / unique-wallet counts await the chain event indexer (Task C); currently reflect backend-logged transactions only.',
    },
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
      tvlUsd: tvl.totals.estimatedUsd,
      volumeUsd: {
        last24h: activity.volumeUsd.last24h,
        last7d: activity.volumeUsd.last7d,
        last30d: activity.volumeUsd.last30d,
      },
      dau: activity.dau,
      platformDau,
      totalTransactions: activity.totalTransactions,
      uniqueWalletsAllTime: activity.uniqueWalletsAllTime,
      totalRegisteredUsers: totalUsers.count,
      totalDistinctWallets: platformUsers.totalDistinctWallets,
      questParticipants: platformUsers.bySystem.questParticipants,
      questRegistrations: questMetrics.registrations,
      questCompletions: questMetrics.completions,
      contributorCount: contributorMetrics.participants,
    },
    freshness: {
      ...freshness,
      lastUpdatedAt: freshness.lastUpdatedAt || activity.lastUpdatedAt,
    },
    coverage: {
      tvlSource: 'onchain_balanceof_live',
      streamCountsSource: 'onchain_stream_core_queries',
      onchainActivitySource: activity.source,
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

  const [tvl, activity, totalStreams, activeStreams, freshness] = await Promise.all([
    getCurrentTvl(),
    getObservedActivity(days),
    contractQuery('streamCore', 'TotalStreams'),
    contractQuery('streamCore', 'ActiveStreams'),
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
          last_updated_at
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        snappedAt,
        tvl.totals.estimatedUsd,
        tvl.totals.estimatedStablecoinUsd,
        Number.parseInt(toStringValue(totalStreams), 10),
        Number.parseInt(toStringValue(activeStreams), 10),
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

export async function getRecentTransactions(limit = 50) {
  if (!getPool()) {
    return { available: false, transactions: [] };
  }

  const streamTx = await queryAll(
    `SELECT
      id,
      created_at as timestamp,
      event_type,
      sender,
      receiver,
      amount,
      token_symbol,
      metadata,
      block_hash,
      extrinsic_hash
     FROM stream_events
     WHERE (sender IS NOT NULL AND sender != 'unknown')
        OR (receiver IS NOT NULL AND receiver != 'unknown')
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  ).catch(() => []);

  const vaultTx = await queryAll(
    `SELECT
      id,
      created_at as timestamp,
      event_type,
      wallet,
      amount,
      token_symbol,
      metadata,
      block_hash,
      extrinsic_hash
     FROM vault_events
     WHERE wallet IS NOT NULL AND wallet != 'unknown'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  ).catch(() => []);

  const bridgeTx = await queryAll(
    `SELECT
      id,
      created_at as timestamp,
      status,
      wallet,
      token_symbol as token,
      amount,
      direction,
      source_tx_hash,
      destination_tx_hash
     FROM bridge_transactions
     WHERE wallet IS NOT NULL AND wallet != 'unknown'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  ).catch(() => []);

  const allTransactions = [
    ...streamTx.map(tx => ({
      ...tx,
      source: 'stream',
      explorerUrl: tx.extrinsic_hash ? `https://idea.gear-tech.io/extrinsics/${tx.extrinsic_hash}?node=wss%3A%2F%2Frpc.vara.network` : null,
    })),
    ...vaultTx.map(tx => ({
      ...tx,
      source: 'vault',
      explorerUrl: tx.extrinsic_hash ? `https://idea.gear-tech.io/extrinsics/${tx.extrinsic_hash}?node=wss%3A%2F%2Frpc.vara.network` : null,
    })),
    ...bridgeTx.map(tx => ({
      ...tx,
      source: 'bridge',
      explorerUrl: tx.source_tx_hash ? `https://idea.gear-tech.io/extrinsics/${tx.source_tx_hash}?node=wss%3A%2F%2Frpc.vara.network` : null,
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);

  return {
    available: true,
    transactions: allTransactions,
    count: allTransactions.length,
    note: 'Explorer links use extrinsic_hash (transaction hash). Existing transactions may not have extrinsic_hash populated - new transactions will have working explorer links.',
  };
}

export async function getActiveWallets(limit = 50) {
  if (!getPool()) {
    return { available: false, wallets: [] };
  }

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
     LIMIT $1`,
    [limit]
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

  return {
    available: true,
    wallets,
    count: wallets.length,
  };
}

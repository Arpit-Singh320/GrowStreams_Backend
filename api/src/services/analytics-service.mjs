import { query as contractQuery, getProgramIds } from '../sails-client.mjs';
import { getVftBalance } from './token-service.mjs';
import { getPool, queryAll, queryOne } from './db.mjs';
import { getToken, getTokenByVaraAddress, listTokens } from '../config/tokens.mjs';
import { toDisplayUnits } from '../utils/decimals.mjs';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isIndexerRunning } from './event-indexer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ACTIVITY_WINDOW_DAYS = 30;
const ACTIVITY_SOURCE = 'on_chain_event_indexer';
const FALLBACK_ACTIVITY_SOURCE = 'backend_command_logs_fallback';
const TVL_PRICING_SOURCE = 'stablecoins_marked_at_$1_only';
const GEAR_PROGRAMS_EXPLORER_BASE = process.env.VARA_PROGRAMS_EXPLORER_URL || 'https://idea.gear-tech.io/programs';
const VARA_RPC_URL = process.env.VARA_NODE || 'wss://rpc.vara.network';

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

  for (const row of streamRows30d) {
    const token = resolveToken(row);
    if (!token) continue;
    const usdValue = toNumberValue(toDisplayUnits(row.amount, token.decimals));
    const eventAtMs = new Date(row.event_at).getTime();
    bucketVolume(windows, eventAtMs, usdValue, volume);
  }

  for (const row of vaultRows30d) {
    const token = resolveToken(row);
    if (!token) continue;
    const usdValue = toNumberValue(toDisplayUnits(row.amount, token.decimals));
    const eventAtMs = new Date(row.event_at).getTime();
    bucketVolume(windows, eventAtMs, usdValue, volume);
  }

  for (const row of bridgeRows30d) {
    const token = resolveToken(row);
    if (!token) continue;
    const usdValue = row.amount_raw && row.amount_raw !== '0'
      ? toNumberValue(toDisplayUnits(row.amount_raw, token.decimals))
      : toNumberValue(row.amount);
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
    addSeriesPoint(row, toNumberValue(toDisplayUnits(row.amount, token.decimals)));
  }

  for (const row of vaultRowsSeries) {
    const token = resolveToken(row);
    if (!token) continue;
    addSeriesPoint(row, toNumberValue(toDisplayUnits(row.amount, token.decimals)));
  }

  for (const row of bridgeRowsSeries) {
    const token = resolveToken(row);
    if (!token) continue;
    addSeriesPoint(
      row,
      row.amount_raw && row.amount_raw !== '0'
        ? toNumberValue(toDisplayUnits(row.amount_raw, token.decimals))
        : toNumberValue(row.amount)
    );
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
    if (token.key === 'VARA') return false;
    if (!token.vara) return false;
    if (token.isSuperToken) return false;
    return true;
  });
}

async function getNativeVaultBalance() {
  const varaToken = getToken('VARA');
  const config = await contractQuery('tokenVault', 'GetConfig');
  const rawBalance = toStringValue(config?.total_tokens_held ?? config?.totalTokensHeld ?? 0);
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

export async function getCurrentTvl() {
  const vaultAddress = getVaultProgramId();
  if (!vaultAddress) {
    const err = new Error('Token vault program ID unavailable');
    err.status = 503;
    throw err;
  }

  const tokenRows = await Promise.all(
    getTrackedVaultTokens().map(async (token) => {
      try {
        const balance = await getVftBalance(token.key, vaultAddress);
        const estimatedUsd = token.isStablecoin ? roundNumber(Number.parseFloat(balance.balance || '0')) : null;
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
          estimatedUsd,
          pricingSource: token.isStablecoin ? TVL_PRICING_SOURCE : null,
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
          pricingSource: null,
          error: err.message,
        };
      }
    })
  );

  const nativeRow = await getNativeVaultBalance();
  const tokens = [...tokenRows, nativeRow];
  const estimatedUsd = roundNumber(
    tokens.reduce((sum, token) => sum + (token.estimatedUsd || 0), 0)
  );

  return {
    vaultAddress,
    pricing: {
      source: TVL_PRICING_SOURCE,
      coverage: 'stablecoins_only',
    },
    totals: {
      estimatedUsd,
      estimatedStablecoinUsd: estimatedUsd,
    },
    tokens,
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
    // Unique transacting wallets within the activity window
    queryOne(`SELECT COUNT(DISTINCT wallet)::bigint AS count FROM (${allWalletsSql}) w WHERE created_at >= $1`, [since]),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM stream_events WHERE ${eventSourceMode.streamConditionSql}`),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM vault_events WHERE ${eventSourceMode.vaultConditionSql}`),
    queryOne(`SELECT COUNT(*)::bigint AS count FROM bridge_transactions`),
    // Unique transacting wallets all-time
    queryOne(`SELECT COUNT(DISTINCT wallet)::bigint AS count FROM (${allWalletsSql}) w`),
    // DAU = unique wallets that transacted since the start of the current UTC day
    queryOne(`SELECT COUNT(DISTINCT wallet)::bigint AS count FROM (${allWalletsSql}) w WHERE created_at >= $1`, [startOfToday]),
    getVolumeMetrics(windowDays),
  ]);

  const streamEventCount = Number.parseInt(streamCountRow?.count || '0', 10);
  const vaultEventCount = Number.parseInt(vaultCountRow?.count || '0', 10);
  const bridgeTransactionCount = Number.parseInt(bridgeCountRow?.count || '0', 10);
  const totalTransactions =
    Number.parseInt(totalStreamCountRow?.count || '0', 10) +
    Number.parseInt(totalVaultCountRow?.count || '0', 10) +
    Number.parseInt(totalBridgeCountRow?.count || '0', 10);

  return {
    available: true,
    windowDays,
    source: eventSourceMode.source,
    capturesPayloadSignedTransactions: eventSourceMode.capturesPayloadSignedTransactions,
    transactionCount: streamEventCount + vaultEventCount + bridgeTransactionCount,
    streamEventCount,
    vaultEventCount,
    bridgeTransactionCount,
    // Unique wallets that transacted within the activity window
    uniqueWallets: Number.parseInt(windowUniqueWalletsRow?.count || '0', 10),
    observedWithdrawVolumeUsd: volume.last30dUsd,
    volumeUsd: {
      last24h: volume.last24hUsd,
      last7d: volume.last7dUsd,
      last30d: volume.last30dUsd,
    },
    dau: Number.parseInt(dauRow?.count || '0', 10),
    totalTransactions,
    uniqueWalletsAllTime: Number.parseInt(allTimeUniqueWalletsRow?.count || '0', 10),
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
    const result = await queryOne('SELECT COUNT(*)::bigint AS count FROM users');
    return { count: Number.parseInt(result?.count || '0', 10), available: true };
  } catch (err) {
    console.error('[analytics] Failed to get total registered users:', err.message);
    return { count: 0, available: false };
  }
}

export async function getQuestMetrics() {
  if (!getPool()) {
    return { registrations: 0, completions: 0, seedsDistributed: 0, available: false };
  }
  try {
    const [registrations, completions, seeds] = await Promise.all([
      queryOne('SELECT COUNT(*)::bigint AS count FROM quest_registrations'),
      queryOne('SELECT COUNT(*)::bigint AS count FROM quest_completions'),
      queryOne('SELECT COUNT(*)::bigint AS count FROM seeds_ledger'),
    ]);
    return {
      registrations: Number.parseInt(registrations?.count || '0', 10),
      completions: Number.parseInt(completions?.count || '0', 10),
      seedsDistributed: Number.parseInt(seeds?.count || '0', 10),
      available: true,
    };
  } catch (err) {
    console.error('[analytics] Failed to get quest metrics:', err.message);
    return { registrations: 0, completions: 0, seedsDistributed: 0, available: false };
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
  const [tvl, activity, totalStreams, activeStreams, contracts, explorerLinks, freshness, totalUsers, questMetrics, contributorMetrics, campaignMetrics] = await Promise.all([
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
  ]);

  return {
    generatedAt: new Date().toISOString(),
    contracts,
    explorerLinks,
    protocol: {
      totalStreams: Number.parseInt(toStringValue(totalStreams), 10),
      activeStreams: Number.parseInt(toStringValue(activeStreams), 10),
    },
    tvl,
    activity,
    users: {
      totalRegistered: totalUsers.count,
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
      totalTransactions: activity.totalTransactions,
      uniqueWalletsAllTime: activity.uniqueWalletsAllTime,
      totalRegisteredUsers: totalUsers.count,
      questRegistrations: questMetrics.registrations,
      questCompletions: questMetrics.completions,
      contributorCount: contributorMetrics.participants,
    },
    freshness,
    coverage: {
      tvlSource: 'onchain_token_vault_balances',
      streamCountsSource: 'onchain_stream_core_queries',
      activitySource: activity.source,
      usersSource: 'users_table',
      notes: [
        'TVL is authoritative for token-vault holdings on-chain.',
        'USD estimates currently cover stablecoins only.',
        'Volume includes all token types from stream withdrawals, vault deposits/withdrawals, and completed bridge transfers.',
        activity.capturesPayloadSignedTransactions
          ? 'Activity metrics include payload-signed transactions captured via the on-chain event indexer.'
          : 'Activity metrics are temporarily using backend-command log fallback until the on-chain event indexer has authoritative rows.',
        'User metrics reflect total registered users from the users table.',
        'Quest metrics include registrations, completions, and seeds distributed.',
        'Contributor metrics include participants, contributions, and XP events.',
        'Campaign metrics include participants and payouts.',
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
    note: 'Transaction hashes not currently available in database schema',
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
     WHERE wallet NOT LIKE '<script>%'
       AND wallet NOT LIKE '%<script>%'
       AND wallet NOT LIKE '%</script>%'
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

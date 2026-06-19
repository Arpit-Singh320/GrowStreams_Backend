// Stream & Vault event history service
// Logs events to PostgreSQL and provides query helpers for history/analytics

import { query as dbQuery, queryOne, queryAll } from './db.mjs';
import { getTokenByVaraAddress } from '../config/tokens.mjs';
import { toDisplayUnits, flowRatePerInterval } from '../utils/decimals.mjs';

// ─── Stream Event Logging ────────────────────────────────────

/**
 * Log a stream event to the database.
 * @param {Object} event
 * @param {string} event.streamId
 * @param {string} event.eventType - created|updated|paused|resumed|stopped|liquidated|deposit|withdraw
 * @param {string} [event.sender]
 * @param {string} [event.receiver]
 * @param {string} [event.tokenAddress]
 * @param {string} [event.tokenSymbol]
 * @param {string} [event.flowRate]
 * @param {string} [event.amount]
 * @param {string} [event.blockHash]
 * @param {string} [event.extrinsicHash] - transaction hash for explorer links
 * @param {Object} [event.metadata]
 */
export async function logStreamEvent(event) {
  try {
    await dbQuery(
      `INSERT INTO stream_events
        (stream_id, event_type, sender, receiver, token_address, token_symbol, flow_rate, amount, block_hash, extrinsic_hash, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        String(event.streamId),
        event.eventType,
        event.sender || null,
        event.receiver || null,
        event.tokenAddress || null,
        event.tokenSymbol || null,
        event.flowRate ? String(event.flowRate) : null,
        event.amount ? String(event.amount) : null,
        event.blockHash || null,
        event.extrinsicHash || null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    );
  } catch (err) {
    // Non-blocking: don't let logging failures break the API
    console.warn(`[stream-history] Failed to log event: ${err.message}`);
  }
}

// ─── Vault Event Logging ─────────────────────────────────────

/**
 * Log a vault event to the database.
 * @param {Object} event
 * @param {string} event.wallet
 * @param {string} event.eventType - deposit|withdraw|deposit_native|withdraw_native|allocate|release|transfer
 * @param {string} [event.tokenAddress]
 * @param {string} [event.tokenSymbol]
 * @param {string} [event.amount]
 * @param {string} [event.amountDisplay]
 * @param {string} [event.streamId]
 * @param {string} [event.blockHash]
 * @param {string} [event.extrinsicHash] - transaction hash for explorer links
 * @param {Object} [event.metadata]
 */
export async function logVaultEvent(event) {
  try {
    await dbQuery(
      `INSERT INTO vault_events
        (wallet, event_type, token_address, token_symbol, amount, amount_display, stream_id, block_hash, extrinsic_hash, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        event.wallet,
        event.eventType,
        event.tokenAddress || null,
        event.tokenSymbol || null,
        event.amount ? String(event.amount) : null,
        event.amountDisplay || null,
        event.streamId ? String(event.streamId) : null,
        event.blockHash || null,
        event.extrinsicHash || null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    );
  } catch (err) {
    console.warn(`[vault-history] Failed to log event: ${err.message}`);
  }
}

// ─── Stream History Queries ──────────────────────────────────

/**
 * Get all stream events for a wallet (as sender or receiver).
 * Enriches each event with token metadata.
 * @param {string} wallet
 * @param {Object} [opts]
 * @param {number} [opts.limit=50]
 * @param {number} [opts.offset=0]
 * @param {string} [opts.eventType] - filter by event type
 * @param {string} [opts.token] - filter by token symbol
 */
export async function getStreamHistory(wallet, opts = {}) {
  const { limit = 50, offset = 0, eventType, token } = opts;
  const conditions = ['(sender = $1 OR receiver = $1)'];
  const params = [wallet];
  let paramIdx = 2;

  if (eventType) {
    conditions.push(`event_type = $${paramIdx}`);
    params.push(eventType);
    paramIdx++;
  }
  if (token) {
    conditions.push(`(token_symbol = $${paramIdx} OR token_address = $${paramIdx})`);
    params.push(token);
    paramIdx++;
  }

  params.push(limit, offset);
  const sql = `
    SELECT * FROM stream_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  const rows = await queryAll(sql, params);

  // Count total for pagination
  const countSql = `
    SELECT COUNT(*) as total FROM stream_events
    WHERE ${conditions.join(' AND ')}
  `;
  const countRow = await queryOne(countSql, params.slice(0, paramIdx - 1));
  const total = parseInt(countRow?.total || '0', 10);

  return {
    events: rows.map(enrichStreamEvent),
    total,
    limit,
    offset,
  };
}

/**
 * Get events for a specific stream.
 */
export async function getStreamEvents(streamId) {
  const rows = await queryAll(
    `SELECT * FROM stream_events WHERE stream_id = $1 ORDER BY created_at ASC`,
    [String(streamId)]
  );
  return rows.map(enrichStreamEvent);
}

/**
 * Get per-token streaming stats for a wallet.
 */
export async function getStreamStats(wallet) {
  // Active streams count per token
  const activeRows = await queryAll(`
    SELECT token_symbol, token_address, COUNT(DISTINCT stream_id) as active_count
    FROM stream_events
    WHERE sender = $1 AND event_type = 'created'
      AND stream_id NOT IN (
        SELECT stream_id FROM stream_events
        WHERE event_type IN ('stopped', 'liquidated')
      )
    GROUP BY token_symbol, token_address
  `, [wallet]);

  // Total streamed (sum of deposit amounts) per token
  const depositRows = await queryAll(`
    SELECT token_symbol, token_address,
           COUNT(*) as event_count,
           COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total_deposited
    FROM stream_events
    WHERE sender = $1 AND event_type IN ('created', 'deposit')
      AND amount IS NOT NULL
    GROUP BY token_symbol, token_address
  `, [wallet]);

  // Total withdrawn per token
  const withdrawRows = await queryAll(`
    SELECT token_symbol, token_address,
           COUNT(*) as event_count,
           COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total_withdrawn
    FROM stream_events
    WHERE (sender = $1 OR receiver = $1) AND event_type = 'withdraw'
      AND amount IS NOT NULL
    GROUP BY token_symbol, token_address
  `, [wallet]);

  // Total streams ever created
  const totalCreated = await queryOne(`
    SELECT COUNT(DISTINCT stream_id) as total
    FROM stream_events
    WHERE sender = $1 AND event_type = 'created'
  `, [wallet]);

  // Build per-token stats
  const tokenStats = {};

  for (const row of activeRows) {
    const key = row.token_symbol || row.token_address || 'unknown';
    if (!tokenStats[key]) tokenStats[key] = { symbol: key, tokenAddress: row.token_address };
    tokenStats[key].activeStreams = parseInt(row.active_count, 10);
  }

  for (const row of depositRows) {
    const key = row.token_symbol || row.token_address || 'unknown';
    if (!tokenStats[key]) tokenStats[key] = { symbol: key, tokenAddress: row.token_address };
    tokenStats[key].totalDeposited = row.total_deposited.toString();
    const tokMeta = row.token_address ? getTokenByVaraAddress(row.token_address) : null;
    if (tokMeta) {
      tokenStats[key].totalDepositedDisplay = toDisplayUnits(row.total_deposited.toString(), tokMeta.decimals);
      tokenStats[key].decimals = tokMeta.decimals;
    }
  }

  for (const row of withdrawRows) {
    const key = row.token_symbol || row.token_address || 'unknown';
    if (!tokenStats[key]) tokenStats[key] = { symbol: key, tokenAddress: row.token_address };
    tokenStats[key].totalWithdrawn = row.total_withdrawn.toString();
    const tokMeta = row.token_address ? getTokenByVaraAddress(row.token_address) : null;
    if (tokMeta) {
      tokenStats[key].totalWithdrawnDisplay = toDisplayUnits(row.total_withdrawn.toString(), tokMeta.decimals);
    }
  }

  return {
    wallet,
    totalStreamsCreated: parseInt(totalCreated?.total || '0', 10),
    tokens: Object.values(tokenStats),
  };
}

// ─── Vault History Queries ───────────────────────────────────

/**
 * Get vault event history for a wallet.
 */
export async function getVaultHistory(wallet, opts = {}) {
  const { limit = 50, offset = 0, eventType, token } = opts;
  const conditions = ['wallet = $1'];
  const params = [wallet];
  let paramIdx = 2;

  if (eventType) {
    conditions.push(`event_type = $${paramIdx}`);
    params.push(eventType);
    paramIdx++;
  }
  if (token) {
    conditions.push(`(token_symbol = $${paramIdx} OR token_address = $${paramIdx})`);
    params.push(token);
    paramIdx++;
  }

  params.push(limit, offset);
  const sql = `
    SELECT * FROM vault_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  const rows = await queryAll(sql, params);

  const countSql = `
    SELECT COUNT(*) as total FROM vault_events
    WHERE ${conditions.join(' AND ')}
  `;
  const countRow = await queryOne(countSql, params.slice(0, paramIdx - 1));
  const total = parseInt(countRow?.total || '0', 10);

  return {
    events: rows.map(enrichVaultEvent),
    total,
    limit,
    offset,
  };
}

// ─── Enrichment Helpers ──────────────────────────────────────

function enrichStreamEvent(row) {
  const enriched = { ...row };
  if (row.token_address) {
    const tokMeta = getTokenByVaraAddress(row.token_address);
    if (tokMeta) {
      enriched.tokenMeta = {
        key: tokMeta.key,
        symbol: tokMeta.symbol,
        name: tokMeta.name,
        decimals: tokMeta.decimals,
        icon: tokMeta.icon,
      };
      if (row.amount) {
        enriched.amountDisplay = toDisplayUnits(row.amount, tokMeta.decimals);
      }
      if (row.flow_rate) {
        enriched.flowRateDisplay = toDisplayUnits(row.flow_rate, tokMeta.decimals);
        enriched.flowRatePerMonth = flowRatePerInterval(row.flow_rate, tokMeta.decimals, 'month');
      }
    }
  }
  return enriched;
}

function enrichVaultEvent(row) {
  const enriched = { ...row };
  if (row.token_address) {
    const tokMeta = getTokenByVaraAddress(row.token_address);
    if (tokMeta) {
      enriched.tokenMeta = {
        key: tokMeta.key,
        symbol: tokMeta.symbol,
        name: tokMeta.name,
        decimals: tokMeta.decimals,
        icon: tokMeta.icon,
      };
    }
  }
  return enriched;
}

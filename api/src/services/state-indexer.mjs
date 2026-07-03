// State-Polling Indexer
// The StreamCore contract declares events in its IDL but never emits them
// (verified — see docs/BLOCKER-onchain-events-and-fees.md). Instead of
// subscribing to events, we reconstruct on-chain stream activity by POLLING the
// contract's read queries and persisting per-stream state to `stream_state`.
//
// This makes analytics read from the DB (fast, scalable) rather than enumerating
// every stream over RPC on each request. The poller runs on a cron.

import { query as contractQuery } from '../sails-client.mjs';
import { getPool, query as dbQuery, queryOne } from './db.mjs';
import { getTokenByVaraAddress } from '../config/tokens.mjs';

let isPolling = false;

// ── Pure helpers (exported for unit testing) ──────────────────

export function parseStreamStatus(status) {
  if (status == null) return 'unknown';
  if (typeof status === 'string') return status;
  if (typeof status === 'object') return Object.keys(status)[0] || 'unknown';
  return String(status);
}

export function actorIdToHex(actorId) {
  if (actorId == null) return null;
  if (typeof actorId === 'string') return actorId.startsWith('0x') ? actorId.toLowerCase() : actorId;
  try {
    if (actorId.value != null) return '0x' + Buffer.from(actorId.value).toString('hex');
    if (Array.isArray(actorId)) return '0x' + Buffer.from(actorId).toString('hex');
  } catch { /* fall through */ }
  return String(actorId);
}

function toBig(value) {
  try { return BigInt(String(value ?? '0')); } catch { return 0n; }
}

// On-chain timestamps are Unix seconds. Returns an ISO string or null.
function onchainTsToIso(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

/**
 * Compute the LIVE streamed amount the same way the contract does:
 *   total_streamed = min(deposited, streamed + flow_rate * elapsed)   [if Active]
 * The stored `streamed` is only settled on mutating calls, so for active streams
 * it is stale; this returns the real current value.
 * @returns {bigint}
 */
export function liveStreamed({ streamed, deposited, flowRate, lastUpdate, status }, nowSec) {
  const stored = toBig(streamed);
  const dep = toBig(deposited);
  if (parseStreamStatus(status) !== 'Active') return stored > dep ? dep : stored;
  const lu = toBig(lastUpdate);
  if (nowSec <= lu) return stored > dep ? dep : stored;
  const accrued = toBig(flowRate) * (nowSec - lu);
  const live = stored + accrued;
  return live > dep ? dep : live;
}

// ── Poller ────────────────────────────────────────────────────

/**
 * Build the upsert row from a decoded on-chain Stream.
 * Exported for testing.
 */
export function buildStreamStateRow(id, s, nowSec) {
  const tokenAddress = s.token != null ? actorIdToHex(s.token) : null;
  const tok = tokenAddress ? getTokenByVaraAddress(tokenAddress) : null;
  return {
    stream_id: Number(id),
    sender: s.sender != null ? actorIdToHex(s.sender) : null,
    receiver: s.receiver != null ? actorIdToHex(s.receiver) : null,
    token_address: tokenAddress,
    token_symbol: tok?.symbol || null,
    flow_rate: toBig(s.flow_rate).toString(),
    deposited: toBig(s.deposited).toString(),
    withdrawn: toBig(s.withdrawn).toString(),
    streamed: liveStreamed({
      streamed: s.streamed, deposited: s.deposited, flowRate: s.flow_rate,
      lastUpdate: s.last_update, status: s.status,
    }, nowSec).toString(),
    start_time: onchainTsToIso(s.start_time),
    last_update: onchainTsToIso(s.last_update),
    status: parseStreamStatus(s.status),
  };
}

async function upsertStreamState(row) {
  await dbQuery(
    `INSERT INTO stream_state
       (stream_id, sender, receiver, token_address, token_symbol, flow_rate,
        deposited, withdrawn, streamed, start_time, last_update, status, observed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
     ON CONFLICT (stream_id) DO UPDATE SET
       sender=EXCLUDED.sender, receiver=EXCLUDED.receiver,
       token_address=EXCLUDED.token_address, token_symbol=EXCLUDED.token_symbol,
       flow_rate=EXCLUDED.flow_rate, deposited=EXCLUDED.deposited,
       withdrawn=EXCLUDED.withdrawn, streamed=EXCLUDED.streamed,
       start_time=EXCLUDED.start_time, last_update=EXCLUDED.last_update,
       status=EXCLUDED.status, observed_at=NOW()`,
    [
      row.stream_id, row.sender, row.receiver, row.token_address, row.token_symbol,
      row.flow_rate, row.deposited, row.withdrawn, row.streamed,
      row.start_time, row.last_update, row.status,
    ]
  );
}

/**
 * Run one incremental poll:
 *  - read TotalStreams
 *  - determine which stream ids to (re)read: all NEW ids since the highest we've
 *    persisted, PLUS a re-read of streams that are still Active (their live
 *    streamed value keeps changing)
 *  - GetStream each (bounded concurrency) and upsert
 *
 * Returns a small summary. Safe to call repeatedly.
 */
export async function pollStreamState({ concurrency = 8 } = {}) {
  if (isPolling) return { skipped: true, reason: 'already_polling' };
  if (!getPool()) return { skipped: true, reason: 'no_db' };
  isPolling = true;
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  try {
    const total = Number.parseInt(String(await contractQuery('streamCore', 'TotalStreams')), 10) || 0;

    const maxRow = await queryOne('SELECT COALESCE(MAX(stream_id), 0)::bigint AS m FROM stream_state');
    const highestSeen = Number.parseInt(maxRow?.m || '0', 10);

    const LOOKAHEAD_IDS = 32;
    const probeUpperBound = Math.max(total, highestSeen) + LOOKAHEAD_IDS;

    // New ids (1-based) we have not persisted yet.
    const newIds = [];
    for (let i = highestSeen + 1; i <= probeUpperBound; i++) newIds.push(i);

    // Active ids to re-read (their streamed keeps growing).
    const activeRows = await dbQuery(`SELECT stream_id FROM stream_state WHERE status = 'Active'`);
    const activeIds = activeRows.rows.map((r) => Number(r.stream_id));

    // Union, dedup.
    const ids = Array.from(new Set([...newIds, ...activeIds]));

    let upserted = 0, errors = 0;
    for (let i = 0; i < ids.length; i += concurrency) {
      await Promise.all(ids.slice(i, i + concurrency).map(async (id) => {
        try {
          const s = await contractQuery('streamCore', 'GetStream', id);
          if (!s) return;
          await upsertStreamState(buildStreamStateRow(id, s, nowSec));
          upserted++;
        } catch (err) {
          errors++;
        }
      }));
    }

    return { total, highestSeen, probeUpperBound, newCount: newIds.length, reReadActive: activeIds.length, upserted, errors };
  } finally {
    isPolling = false;
  }
}

export function isStatePolling() {
  return isPolling;
}

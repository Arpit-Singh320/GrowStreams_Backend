// Liquidation Keeper Cron — scans for at-risk streams and triggers liquidation
//
// Runs every 5 minutes. For each critical/insolvent stream:
//   1. Re-checks solvency (double-check before sending a tx)
//   2. Calls liquidation-manager.LiquidateStream(stream_id, sender, super_token)
//      OR falls back to stream-core.Liquidate(stream_id) for legacy vault streams
//   3. Logs the result

import { query, command } from '../sails-client.mjs';
import { scanAtRiskStreams } from '../services/solvency.mjs';
import { logStreamEvent } from '../services/stream-history.mjs';
import { toActorId } from '../utils/actor-id.mjs';

// Contract key used for super token queries (single deployed super token for now)
const SUPER_TOKEN_KEY = 'superToken';

// Minimum health_factor to skip liquidation (avoid race conditions)
const MIN_HEALTH_TO_SKIP = 20;

export async function runLiquidationKeeper() {
  console.log('[liquidation-keeper] Scanning for at-risk streams...');

  let atRisk;
  try {
    atRisk = await scanAtRiskStreams(SUPER_TOKEN_KEY, {
      criticalThresholdSecs: 3600,
    });
  } catch (err) {
    console.warn(`[liquidation-keeper] Scan failed: ${err.message}`);
    return { scanned: 0, liquidated: 0, errors: 0 };
  }

  if (atRisk.length === 0) {
    console.log('[liquidation-keeper] No at-risk streams found.');
    return { scanned: 0, liquidated: 0, errors: 0 };
  }

  console.log(`[liquidation-keeper] Found ${atRisk.length} at-risk stream(s)`);

  let liquidated = 0;
  let errors = 0;

  for (const risk of atRisk) {
    try {
      await processRiskyStream(risk);
      liquidated++;
    } catch (err) {
      console.warn(`[liquidation-keeper] Stream ${risk.stream_id} error: ${err.message}`);
      errors++;
    }
  }

  console.log(
    `[liquidation-keeper] Done. scanned=${atRisk.length} liquidated=${liquidated} errors=${errors}`
  );
  return { scanned: atRisk.length, liquidated, errors };
}

async function processRiskyStream(risk) {
  const streamId = BigInt(risk.stream_id);

  // Re-verify: fetch fresh stream state before sending any tx
  const stream = await query('streamCore', 'GetStream', streamId);
  if (!stream) {
    console.log(`[liquidation-keeper] Stream ${risk.stream_id} not found, skipping`);
    return;
  }

  // Skip already stopped/paused streams
  const status = stream.status;
  if (status?.Stopped !== undefined || status?.Paused !== undefined || status === 'Stopped' || status === 'Paused') {
    console.log(`[liquidation-keeper] Stream ${risk.stream_id} already ${JSON.stringify(status)}, skipping`);
    return;
  }

  // If health has recovered since the scan, skip
  if (risk.health_factor != null && risk.health_factor >= MIN_HEALTH_TO_SKIP && risk.status === 'Critical') {
    console.log(`[liquidation-keeper] Stream ${risk.stream_id} health_factor=${risk.health_factor} — skipping (not critical enough)`);
    return;
  }

  const senderHex = toActorId(risk.sender);

  // Determine if this is a super-token stream or a legacy vault stream.
  // Check if stream-core has a super token registered for this token address.
  let isSuperTokenStream = false;
  let superTokenAddr = null;
  try {
    if (risk.token) {
      const tokenHex = toActorId(risk.token);
      const registered = await query('streamCore', 'GetSuperToken', tokenHex);
      if (registered) {
        isSuperTokenStream = true;
        superTokenAddr = registered;
      }
    }
  } catch (_) {
    // GetSuperToken may not exist on older stream-core — treat as legacy
  }

  if (isSuperTokenStream && superTokenAddr) {
    // ---- Super Token path: use liquidation-manager ----
    try {
      const superTokenHex = toActorId(superTokenAddr);
      const { blockHash, txHash } = await command(
        'liquidationManager',
        'LiquidateStream',
        streamId,
        senderHex,
        superTokenHex,
      );
      console.log(
        `[liquidation-keeper] Liquidated (super-token path) stream ${risk.stream_id} ` +
        `sender=${risk.sender} health=${risk.health_factor} block=${blockHash}`
      );
      logStreamEvent({
        streamId: String(risk.stream_id),
        eventType: 'liquidated',
        sender: risk.sender,
        tokenAddress: risk.token,
        tokenSymbol: risk.token_symbol,
        blockHash,
        extrinsicHash: txHash,
        metadata: {
          path: 'super-token',
          health_factor: risk.health_factor,
          seconds_remaining: risk.seconds_remaining,
          balance: risk.balance,
        },
      });
    } catch (err) {
      // Fallback to stream-core direct liquidation
      console.warn(`[liquidation-keeper] liquidation-manager call failed for ${risk.stream_id}, falling back: ${err.message}`);
      await legacyLiquidate(streamId, risk);
    }
  } else {
    // ---- Legacy vault path: use stream-core.Liquidate ----
    await legacyLiquidate(streamId, risk);
  }
}

async function legacyLiquidate(streamId, risk) {
  const { blockHash, txHash } = await command('streamCore', 'Liquidate', streamId);
  console.log(
    `[liquidation-keeper] Liquidated (legacy path) stream ${risk.stream_id} ` +
    `sender=${risk.sender} health=${risk.health_factor} block=${blockHash}`
  );
  logStreamEvent({
    streamId: String(risk.stream_id),
    eventType: 'liquidated',
    sender: risk.sender,
    tokenAddress: risk.token,
    tokenSymbol: risk.token_symbol,
    blockHash,
    extrinsicHash: txHash,
    metadata: {
      path: 'legacy',
      health_factor: risk.health_factor,
      seconds_remaining: risk.seconds_remaining,
    },
  });
}

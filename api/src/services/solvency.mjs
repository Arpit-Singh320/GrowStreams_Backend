// Solvency Service — off-chain solvency monitoring for Super Token streams
//
// Aggregates on-chain data (stream-core + super-token) to compute account health
// without requiring a deployed liquidation-manager (pure read-only queries).

import { query } from '../sails-client.mjs';
import { toActorId } from '../utils/actor-id.mjs';
import { toDisplayUnits } from '../utils/decimals.mjs';
import { getTokenByVaraAddress } from '../config/tokens.mjs';

// Seconds below which an account is considered "critical" (mirrors on-chain default)
const DEFAULT_CRITICAL_THRESHOLD_SECS = 3600; // 1 hour

/**
 * Compute real-time solvency for a specific account + super token pair.
 *
 * @param {string} account    - hex ActorId of the account
 * @param {string} superToken - contract key in sails-client (e.g. 'superToken') or a hex address
 * @param {object} [opts]
 * @param {number} [opts.criticalThresholdSecs=3600]
 * @returns {Promise<SolvencyResult>}
 */
export async function checkAccountSolvency(account, superToken = 'superToken', opts = {}) {
  const criticalSecs = opts.criticalThresholdSecs ?? DEFAULT_CRITICAL_THRESHOLD_SECS;
  const accountHex = toActorId(account);

  const [balanceRaw, flowRateRaw] = await Promise.all([
    query(superToken, 'BalanceOf', accountHex),
    query(superToken, 'NetFlowRate', accountHex),
  ]);

  const balance = BigInt(balanceRaw ?? 0);
  // net_flow_rate: negative means net outgoing (sender), positive means net incoming (receiver)
  const netFlowRate = BigInt(flowRateRaw ?? 0);
  const outflowRate = netFlowRate < 0n ? -netFlowRate : 0n;

  return computeRisk({ account, balance, outflowRate, criticalSecs });
}

/**
 * Compute solvency for all senders of a list of stream IDs.
 * Uses stream-core and super-token queries.
 *
 * @param {bigint[]} streamIds
 * @param {string}   superTokenKey  - sails-client contract key
 * @param {object}   [opts]
 * @returns {Promise<Array<StreamSolvency>>}
 */
export async function checkStreamsSolvency(streamIds, superTokenKey = 'superToken', opts = {}) {
  const criticalSecs = opts.criticalThresholdSecs ?? DEFAULT_CRITICAL_THRESHOLD_SECS;
  const results = [];

  for (const streamId of streamIds) {
    try {
      const stream = await query('streamCore', 'GetStream', streamId);
      if (!stream || stream.status?.Stopped !== undefined) continue;

      const senderHex = toActorId(stream.sender ?? stream.Sender);
      const tokenAddr = stream.token ?? stream.Token;
      const flowRateRaw = stream.flow_rate ?? stream.flowRate ?? stream.FlowRate ?? 0;

      const [balanceRaw, netFlowRateRaw] = await Promise.all([
        query(superTokenKey, 'BalanceOf', senderHex),
        query(superTokenKey, 'NetFlowRate', senderHex),
      ]);

      const balance = BigInt(balanceRaw ?? 0);
      const netFlowRate = BigInt(netFlowRateRaw ?? 0);
      const outflowRate = netFlowRate < 0n ? -netFlowRate : 0n;

      const risk = computeRisk({
        account: senderHex,
        balance,
        outflowRate,
        criticalSecs,
      });

      const tokMeta = getTokenByVaraAddress(tokenAddr);

      results.push({
        stream_id: Number(streamId),
        sender: stream.sender ?? stream.Sender,
        token: tokenAddr,
        token_symbol: tokMeta?.symbol ?? null,
        decimals: tokMeta?.decimals ?? null,
        stream_flow_rate: String(flowRateRaw),
        ...risk,
        balance_display: tokMeta
          ? toDisplayUnits(balance.toString(), tokMeta.decimals)
          : balance.toString(),
      });
    } catch (err) {
      results.push({
        stream_id: Number(streamId),
        error: err.message,
        status: 'error',
      });
    }
  }

  return results;
}

/**
 * Scan ALL active streams and return those that are critical or insolvent.
 * Intended for the liquidation keeper cron.
 *
 * @param {string} superTokenKey
 * @param {object} [opts]
 * @returns {Promise<Array<StreamSolvency>>}
 */
export async function scanAtRiskStreams(superTokenKey = 'superToken', opts = {}) {
  const totalRaw = await query('streamCore', 'TotalStreams');
  const total = Number(totalRaw ?? 0);
  if (total === 0) return [];

  // Collect all stream IDs 1..total (stream IDs are sequential u64 starting at 1)
  const allIds = Array.from({ length: total }, (_, i) => BigInt(i + 1));
  const solvency = await checkStreamsSolvency(allIds, superTokenKey, opts);

  return solvency.filter(
    s => s.status === 'Critical' || s.status === 'Insolvent'
  );
}

// ---------------------------------------------------------------------------
// Pure computation — no I/O
// ---------------------------------------------------------------------------

function computeRisk({ account, balance, outflowRate, criticalSecs }) {
  if (outflowRate === 0n) {
    return {
      account,
      balance: balance.toString(),
      outflow_rate: '0',
      seconds_remaining: null,   // infinite
      health_factor: 1000,
      status: 'Solvent',
    };
  }

  if (balance === 0n) {
    return {
      account,
      balance: '0',
      outflow_rate: outflowRate.toString(),
      seconds_remaining: 0,
      health_factor: 0,
      status: 'Insolvent',
    };
  }

  const secondsRemaining = Number(balance / outflowRate);
  const minBuffer = outflowRate * BigInt(criticalSecs);
  const healthFactor = minBuffer === 0n
    ? 1000
    : Math.min(1000, Number((balance * 100n) / minBuffer));

  const status = secondsRemaining === 0
    ? 'Insolvent'
    : balance < minBuffer
      ? 'Critical'
      : 'Solvent';

  return {
    account,
    balance: balance.toString(),
    outflow_rate: outflowRate.toString(),
    seconds_remaining: secondsRemaining,
    health_factor: healthFactor,
    status,
  };
}

// Event Indexer Service
// Subscribes to on-chain events from StreamCore and TokenVault via sails-js,
// persisting them as authoritative rows for KPI/activity analytics.
// Captures all events — including payload-signed transactions that bypass the API.
//
// sails-js (>=0.5) exposes per-event subscriptions:
//   contract.services.<Service>.events.<EventName>.subscribe(cb)
// The callback receives the DECODED event payload directly (snake_case fields,
// matching the IDL), not a { event, args } wrapper.

import { getApi, getContract } from '../sails-client.mjs';
import { logStreamEvent, logVaultEvent } from './stream-history.mjs';
import { getTokenByVaraAddress } from '../config/tokens.mjs';
import { toDisplayUnits } from '../utils/decimals.mjs';

let isRunning = false;
let unsubscribers = [];

// ─── Pure helpers (exported for unit testing) ────────────────

/**
 * Convert a Gear/Sails actor_id (hex string, byte array, or {value}) to a 0x hex string.
 */
export function actorIdToHex(actorId) {
  if (actorId == null) return null;
  if (typeof actorId === 'string') {
    return actorId.startsWith('0x') ? actorId : actorId;
  }
  if (typeof actorId === 'object') {
    if (actorId.value != null) return '0x' + Buffer.from(actorId.value).toString('hex');
    if (Array.isArray(actorId)) return '0x' + Buffer.from(actorId).toString('hex');
  }
  return String(actorId);
}

/**
 * Convert a Gear/Sails u128/u64 (bigint, number, hex, decimal string) to a decimal string.
 */
export function bigIntToString(value) {
  if (value == null) return '0';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value.startsWith('0x')) {
      try { return BigInt(value).toString(); } catch { return '0'; }
    }
    return value;
  }
  return '0';
}

/**
 * Build the logStreamEvent() argument object for a decoded StreamCore event.
 * `tokenInfo` (optional) is the resolved token registry entry — supplied by the
 * caller for events where the token is known (directly or via stream lookup).
 * Returns null for events we don't index.
 * @returns {object|null}
 */
export function buildStreamEventLog(eventName, data, tokenInfo = null, extra = {}) {
  if (!data) return null;
  const tokenAddress = extra.tokenAddress ?? (data.token != null ? actorIdToHex(data.token) : null);
  const tokenSymbol = tokenInfo?.symbol ?? null;

  switch (eventName) {
    case 'StreamCreated':
      return {
        streamId: bigIntToString(data.id),
        eventType: 'created',
        sender: actorIdToHex(data.sender),
        receiver: actorIdToHex(data.receiver),
        tokenAddress,
        tokenSymbol,
        flowRate: bigIntToString(data.flow_rate),
        amount: bigIntToString(data.initial_deposit),
        metadata: { source: 'on_chain_event', startTime: bigIntToString(data.start_time) },
      };
    case 'StreamUpdated':
      return {
        streamId: bigIntToString(data.id),
        eventType: 'updated',
        metadata: {
          source: 'on_chain_event',
          oldFlowRate: bigIntToString(data.old_flow_rate),
          newFlowRate: bigIntToString(data.new_flow_rate),
          updatedAt: bigIntToString(data.updated_at),
        },
      };
    case 'StreamStopped':
      return {
        streamId: bigIntToString(data.id),
        eventType: 'stopped',
        amount: bigIntToString(data.total_streamed),
        metadata: {
          source: 'on_chain_event',
          stoppedAt: bigIntToString(data.stopped_at),
          senderRefund: bigIntToString(data.sender_refund),
        },
      };
    case 'StreamPaused':
      return {
        streamId: bigIntToString(data.id),
        eventType: 'paused',
        metadata: { source: 'on_chain_event', pausedAt: bigIntToString(data.paused_at) },
      };
    case 'StreamResumed':
      return {
        streamId: bigIntToString(data.id),
        eventType: 'resumed',
        metadata: { source: 'on_chain_event', resumedAt: bigIntToString(data.resumed_at) },
      };
    case 'Withdrawn':
      return {
        streamId: bigIntToString(data.id),
        eventType: 'withdraw',
        receiver: actorIdToHex(data.receiver),
        tokenAddress,
        tokenSymbol,
        amount: bigIntToString(data.amount),
        metadata: { source: 'on_chain_event', timestamp: bigIntToString(data.timestamp) },
      };
    case 'Deposited':
      return {
        streamId: bigIntToString(data.id),
        eventType: 'deposit',
        sender: actorIdToHex(data.sender),
        tokenAddress,
        tokenSymbol,
        amount: bigIntToString(data.amount),
        metadata: { source: 'on_chain_event', newBuffer: bigIntToString(data.new_buffer) },
      };
    case 'StreamLiquidated':
      return {
        streamId: bigIntToString(data.id),
        eventType: 'liquidated',
        metadata: {
          source: 'on_chain_event',
          liquidatedAt: bigIntToString(data.liquidated_at),
          shortfall: bigIntToString(data.shortfall),
        },
      };
    default:
      return null;
  }
}

/**
 * Build the logVaultEvent() argument object for a decoded TokenVault event.
 * IDL event names are TokensDeposited / TokensWithdrawn, with an `owner` field.
 * @returns {object|null}
 */
export function buildVaultEventLog(eventName, data, tokenInfo = null) {
  if (!data) return null;
  const tokenAddress = data.token != null ? actorIdToHex(data.token) : null;
  const decimals = tokenInfo?.decimals ?? 18;
  const amount = bigIntToString(data.amount);

  switch (eventName) {
    case 'TokensDeposited':
      return {
        wallet: actorIdToHex(data.owner),
        eventType: 'deposit',
        tokenAddress,
        tokenSymbol: tokenInfo?.symbol ?? null,
        amount,
        amountDisplay: toDisplayUnits(amount, decimals),
        metadata: { source: 'on_chain_event', newBalance: bigIntToString(data.new_balance) },
      };
    case 'TokensWithdrawn':
      return {
        wallet: actorIdToHex(data.owner),
        eventType: 'withdraw',
        tokenAddress,
        tokenSymbol: tokenInfo?.symbol ?? null,
        amount,
        amountDisplay: toDisplayUnits(amount, decimals),
        metadata: { source: 'on_chain_event', remaining: bigIntToString(data.remaining) },
      };
    case 'FeeCollected':
      // Protocol fee skimmed on stream create/deposit and credited to treasury.
      // Logged against the treasury wallet (the recipient) with event_type 'fee'
      // so getProtocolFees() can sum it; payer is preserved in metadata.
      return {
        wallet: actorIdToHex(data.treasury),
        eventType: 'fee',
        tokenAddress,
        tokenSymbol: tokenInfo?.symbol ?? null,
        amount,
        amountDisplay: toDisplayUnits(amount, decimals),
        metadata: { source: 'on_chain_event', payer: actorIdToHex(data.payer) },
      };
    default:
      return null;
  }
}

// ─── Async event processing ──────────────────────────────────

async function handleStreamEvent(eventName, data) {
  try {
    let tokenInfo = null;
    let tokenAddress = data?.token != null ? actorIdToHex(data.token) : null;

    // Withdrawn/Deposited carry no token field — resolve via stream lookup.
    if ((eventName === 'Withdrawn' || eventName === 'Deposited') && data?.id != null) {
      const streamCore = getContract('streamCore');
      if (streamCore) {
        try {
          const stream = await streamCore.services.StreamService.queries.GetStream(data.id).call();
          if (stream?.token != null) tokenAddress = actorIdToHex(stream.token);
        } catch (err) {
          console.warn(`[event-indexer] GetStream(${data.id}) failed: ${err.message}`);
        }
      }
    }

    if (tokenAddress) tokenInfo = getTokenByVaraAddress(tokenAddress);

    const logArgs = buildStreamEventLog(eventName, data, tokenInfo, { tokenAddress });
    if (!logArgs) {
      console.log(`[event-indexer] Unhandled StreamCore event: ${eventName}`);
      return;
    }
    await logStreamEvent(logArgs);
    console.log(`[event-indexer] StreamCore ${eventName}: stream ${logArgs.streamId}`);
  } catch (err) {
    console.error(`[event-indexer] Error processing StreamCore ${eventName}: ${err.message}`);
  }
}

async function handleVaultEvent(eventName, data) {
  try {
    const tokenAddress = data?.token != null ? actorIdToHex(data.token) : null;
    const tokenInfo = tokenAddress ? getTokenByVaraAddress(tokenAddress) : null;

    const logArgs = buildVaultEventLog(eventName, data, tokenInfo);
    if (!logArgs) {
      console.log(`[event-indexer] Unhandled TokenVault event: ${eventName}`);
      return;
    }
    await logVaultEvent(logArgs);
    console.log(`[event-indexer] TokenVault ${eventName}: ${logArgs.wallet} ${logArgs.amountDisplay} ${logArgs.tokenSymbol || ''}`);
  } catch (err) {
    console.error(`[event-indexer] Error processing TokenVault ${eventName}: ${err.message}`);
  }
}

const STREAM_EVENTS = [
  'StreamCreated', 'StreamUpdated', 'StreamStopped', 'StreamPaused',
  'StreamResumed', 'Withdrawn', 'Deposited', 'StreamLiquidated',
];
const VAULT_EVENTS = ['TokensDeposited', 'TokensWithdrawn', 'FeeCollected'];

async function subscribeEvents(contract, serviceName, eventNames, handler) {
  const service = contract?.services?.[serviceName];
  if (!service?.events) {
    console.warn(`[event-indexer] ${serviceName} has no events to subscribe to`);
    return;
  }
  for (const name of eventNames) {
    const evt = service.events[name];
    if (!evt?.subscribe) {
      console.warn(`[event-indexer] ${serviceName}.${name} not subscribable (IDL mismatch?)`);
      continue;
    }
    try {
      const unsub = await evt.subscribe((payload) => handler(name, payload));
      unsubscribers.push(unsub);
      console.log(`[event-indexer] Subscribed to ${serviceName}.${name}`);
    } catch (err) {
      console.error(`[event-indexer] Failed to subscribe ${serviceName}.${name}: ${err.message}`);
    }
  }
}

/**
 * Start the event indexer. Opens live subscriptions to StreamCore and TokenVault events.
 */
export async function startEventIndexer() {
  if (isRunning) {
    console.log('[event-indexer] Already running');
    return;
  }

  const api = getApi();
  if (!api) {
    console.error('[event-indexer] Gear API not connected — indexer not started');
    return;
  }

  const streamCore = getContract('streamCore');
  const tokenVault = getContract('tokenVault');
  if (!streamCore || !tokenVault) {
    console.error('[event-indexer] Contracts not loaded — indexer not started');
    return;
  }
  if (!streamCore.programId || !tokenVault.programId) {
    console.error('[event-indexer] Program IDs not set — indexer not started');
    return;
  }

  console.log('[event-indexer] Starting event indexer...');
  unsubscribers = [];

  await subscribeEvents(streamCore, 'StreamService', STREAM_EVENTS, handleStreamEvent);
  await subscribeEvents(tokenVault, 'VaultService', VAULT_EVENTS, handleVaultEvent);

  if (unsubscribers.length === 0) {
    console.warn('[event-indexer] No subscriptions established — indexer inactive');
    isRunning = false;
    return;
  }

  isRunning = true;
  console.log(`[event-indexer] Running with ${unsubscribers.length} subscription(s)`);
}

/**
 * Stop the event indexer and tear down all subscriptions.
 */
export async function stopEventIndexer() {
  if (!isRunning) {
    console.log('[event-indexer] Not running');
    return;
  }
  console.log('[event-indexer] Stopping event indexer...');
  for (const unsub of unsubscribers) {
    try {
      if (typeof unsub === 'function') unsub();
    } catch (err) {
      console.error(`[event-indexer] Error unsubscribing: ${err.message}`);
    }
  }
  unsubscribers = [];
  isRunning = false;
  console.log('[event-indexer] Stopped');
}

export function isIndexerRunning() {
  return isRunning;
}

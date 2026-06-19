// Event Indexer Service
// Subscribes to on-chain events from Gear API for authoritative KPI metrics
// Captures all events including payload-signed transactions that bypass the API

import { getApi, getContract } from '../sails-client.mjs';
import { logStreamEvent, logVaultEvent } from './stream-history.mjs';
import { getTokenByVaraAddress } from '../config/tokens.mjs';
import { toDisplayUnits } from '../utils/decimals.mjs';

let isRunning = false;
let unsubscribers = [];

/**
 * Convert Gear API actor_id to hex string
 */
function actorIdToHex(actorId) {
  if (!actorId) return null;
  if (typeof actorId === 'string' && actorId.startsWith('0x')) {
    return actorId;
  }
  if (typeof actorId === 'object' && actorId.value) {
    return '0x' + Buffer.from(actorId.value).toString('hex');
  }
  return String(actorId);
}

/**
 * Convert Gear API u128/u64 to string
 */
function bigIntToString(value) {
  if (value == null) return '0';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return '0';
}

/**
 * Process StreamCore events
 */
async function processStreamCoreEvent(eventData) {
  const { event, args } = eventData;
  const eventName = event.name;

  try {
    switch (eventName) {
      case 'StreamCreated': {
        const data = args;
        const token = actorIdToHex(data.token);
        const tokenInfo = getTokenByVaraAddress(token);

        await logStreamEvent({
          streamId: bigIntToString(data.id),
          eventType: 'created',
          sender: actorIdToHex(data.sender),
          receiver: actorIdToHex(data.receiver),
          tokenAddress: token,
          tokenSymbol: tokenInfo?.symbol || null,
          flowRate: bigIntToString(data.flow_rate),
          amount: bigIntToString(data.initial_deposit),
          metadata: {
            source: 'on_chain_event',
            startTime: bigIntToString(data.start_time),
          },
        });
        console.log(`[event-indexer] StreamCreated: ${data.id}`);
        break;
      }

      case 'StreamUpdated': {
        const data = args;
        await logStreamEvent({
          streamId: bigIntToString(data.id),
          eventType: 'updated',
          metadata: {
            source: 'on_chain_event',
            oldFlowRate: bigIntToString(data.old_flow_rate),
            newFlowRate: bigIntToString(data.new_flow_rate),
            updatedAt: bigIntToString(data.updated_at),
          },
        });
        console.log(`[event-indexer] StreamUpdated: ${data.id}`);
        break;
      }

      case 'StreamStopped': {
        const data = args;
        await logStreamEvent({
          streamId: bigIntToString(data.id),
          eventType: 'stopped',
          amount: bigIntToString(data.total_streamed),
          metadata: {
            source: 'on_chain_event',
            stoppedAt: bigIntToString(data.stopped_at),
            senderRefund: bigIntToString(data.sender_refund),
          },
        });
        console.log(`[event-indexer] StreamStopped: ${data.id}`);
        break;
      }

      case 'StreamPaused': {
        const data = args;
        await logStreamEvent({
          streamId: bigIntToString(data.id),
          eventType: 'paused',
          metadata: {
            source: 'on_chain_event',
            pausedAt: bigIntToString(data.paused_at),
          },
        });
        console.log(`[event-indexer] StreamPaused: ${data.id}`);
        break;
      }

      case 'StreamResumed': {
        const data = args;
        await logStreamEvent({
          streamId: bigIntToString(data.id),
          eventType: 'resumed',
          metadata: {
            source: 'on_chain_event',
            resumedAt: bigIntToString(data.resumed_at),
          },
        });
        console.log(`[event-indexer] StreamResumed: ${data.id}`);
        break;
      }

      case 'Withdrawn': {
        const data = args;
        const streamCore = getContract('streamCore');
        if (!streamCore) {
          console.warn('[event-indexer] StreamCore contract not loaded, cannot fetch stream details');
          return;
        }

        const stream = await streamCore.services.StreamService.queries.GetStream(data.id).call();
        const token = actorIdToHex(stream.token);
        const tokenInfo = getTokenByVaraAddress(token);

        await logStreamEvent({
          streamId: bigIntToString(data.id),
          eventType: 'withdraw',
          receiver: actorIdToHex(data.receiver),
          tokenAddress: token,
          tokenSymbol: tokenInfo?.symbol || null,
          amount: bigIntToString(data.amount),
          metadata: {
            source: 'on_chain_event',
            timestamp: bigIntToString(data.timestamp),
          },
        });
        console.log(`[event-indexer] Withdrawn: stream ${data.id}, amount ${data.amount}`);
        break;
      }

      case 'Deposited': {
        const data = args;
        const streamCore = getContract('streamCore');
        if (!streamCore) {
          console.warn('[event-indexer] StreamCore contract not loaded, cannot fetch stream details');
          return;
        }

        const stream = await streamCore.services.StreamService.queries.GetStream(data.id).call();
        const token = actorIdToHex(stream.token);
        const tokenInfo = getTokenByVaraAddress(token);

        await logStreamEvent({
          streamId: bigIntToString(data.id),
          eventType: 'deposit',
          sender: actorIdToHex(data.sender),
          tokenAddress: token,
          tokenSymbol: tokenInfo?.symbol || null,
          amount: bigIntToString(data.amount),
          metadata: {
            source: 'on_chain_event',
            newBuffer: bigIntToString(data.new_buffer),
          },
        });
        console.log(`[event-indexer] Deposited: stream ${data.id}, amount ${data.amount}`);
        break;
      }

      case 'StreamLiquidated': {
        const data = args;
        await logStreamEvent({
          streamId: bigIntToString(data.id),
          eventType: 'liquidated',
          metadata: {
            source: 'on_chain_event',
            liquidatedAt: bigIntToString(data.liquidated_at),
            shortfall: bigIntToString(data.shortfall),
          },
        });
        console.log(`[event-indexer] StreamLiquidated: ${data.id}`);
        break;
      }

      default:
        console.log(`[event-indexer] Unhandled StreamCore event: ${eventName}`);
    }
  } catch (err) {
    console.error(`[event-indexer] Error processing ${eventName}:`, err.message);
  }
}

/**
 * Process TokenVault events
 */
async function processTokenVaultEvent(eventData) {
  const { event, args } = eventData;
  const eventName = event.name;

  try {
    switch (eventName) {
      case 'Deposited': {
        const data = args;
        const token = actorIdToHex(data.token);
        const tokenInfo = getTokenByVaraAddress(token);
        const amountDisplay = toDisplayUnits(bigIntToString(data.amount), tokenInfo?.decimals || 18);

        await logVaultEvent({
          wallet: actorIdToHex(data.wallet),
          eventType: 'deposit',
          tokenAddress: token,
          tokenSymbol: tokenInfo?.symbol || null,
          amount: bigIntToString(data.amount),
          amountDisplay,
          metadata: {
            source: 'on_chain_event',
          },
        });
        console.log(`[event-indexer] Vault Deposited: ${data.wallet}, ${amountDisplay} ${tokenInfo?.symbol}`);
        break;
      }

      case 'Withdrawn': {
        const data = args;
        const token = actorIdToHex(data.token);
        const tokenInfo = getTokenByVaraAddress(token);
        const amountDisplay = toDisplayUnits(bigIntToString(data.amount), tokenInfo?.decimals || 18);

        await logVaultEvent({
          wallet: actorIdToHex(data.wallet),
          eventType: 'withdraw',
          tokenAddress: token,
          tokenSymbol: tokenInfo?.symbol || null,
          amount: bigIntToString(data.amount),
          amountDisplay,
          metadata: {
            source: 'on_chain_event',
          },
        });
        console.log(`[event-indexer] Vault Withdrawn: ${data.wallet}, ${amountDisplay} ${tokenInfo?.symbol}`);
        break;
      }

      default:
        console.log(`[event-indexer] Unhandled TokenVault event: ${eventName}`);
    }
  } catch (err) {
    console.error(`[event-indexer] Error processing ${eventName}:`, err.message);
  }
}

/**
 * Start the event indexer
 */
export async function startEventIndexer() {
  if (isRunning) {
    console.log('[event-indexer] Already running');
    return;
  }

  const api = getApi();
  if (!api) {
    console.error('[event-indexer] Gear API not connected');
    return;
  }

  const streamCore = getContract('streamCore');
  const tokenVault = getContract('tokenVault');

  if (!streamCore || !tokenVault) {
    console.error('[event-indexer] Contracts not loaded');
    return;
  }

  console.log('[event-indexer] Starting event indexer...');
  console.log('[event-indexer] Event indexer disabled - Gear API event subscription requires further research');
  isRunning = false;
}

/**
 * Stop the event indexer
 */
export async function stopEventIndexer() {
  if (!isRunning) {
    console.log('[event-indexer] Not running');
    return;
  }

  console.log('[event-indexer] Stopping event indexer...');

  for (const unsub of unsubscribers) {
    try {
      unsub();
    } catch (err) {
      console.error('[event-indexer] Error unsubscribing:', err.message);
    }
  }

  unsubscribers = [];
  isRunning = false;
  console.log('[event-indexer] Stopped');
}

/**
 * Check if indexer is running
 */
export function isIndexerRunning() {
  return isRunning;
}

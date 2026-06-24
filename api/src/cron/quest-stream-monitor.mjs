import { getAllRegisteredUsers, awardSeeds, isQuestCompleted } from '../services/quest-service.mjs';
import { query as sailsQuery } from '../sails-client.mjs';
import { queryOne } from '../services/db.mjs';
import { decodeAddress } from '@polkadot/util-crypto';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Convert SS58 or hex wallet to lowercase hex pubkey for matching stream_events.sender
function walletToHexPubkey(wallet) {
  try {
    if (wallet.startsWith('0x') && wallet.length === 66) return wallet.toLowerCase();
    const pub = decodeAddress(wallet);
    return '0x' + Buffer.from(pub).toString('hex');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Q5: Check if registered users have created a stream on GrowStreams
// Primary: polls the streamCore contract on-chain
// Fallback: checks the stream_events DB table (indexed by the event-indexer)
// ---------------------------------------------------------------------------
export async function runStreamCheck() {
  console.log('[quest-stream] Running stream creation check (Q5)...');
  const users = await getAllRegisteredUsers();
  if (!users.length) return;

  let checked = 0;
  let awarded = 0;

  for (const user of users) {
    try {
      // Skip if already completed
      if (await isQuestCompleted(user.wallet, 'create-stream')) continue;

      checked++;

      let hasStream = false;
      let source = 'unknown';

      // 1. Primary: query on-chain via streamCore contract
      try {
        const result = await sailsQuery('streamCore', 'GetSenderStreams', user.wallet);
        if (result && ((Array.isArray(result) && result.length > 0) || (result.length > 0))) {
          hasStream = true;
          source = 'stream-core-contract';
          console.log(`[quest-stream] On-chain: found ${result.length} stream(s) for ${user.wallet}`);
        }
      } catch (err) {
        if (!err.message?.includes('not found') && !err.message?.includes('not loaded')) {
          console.warn(`[quest-stream] On-chain query failed for ${user.wallet}: ${err.message}`);
        }
        // Fall through to DB fallback — do NOT continue
      }

      // 2. Fallback: check stream_events DB table (populated by the event-indexer)
      if (!hasStream) {
        try {
          const hexPubkey = walletToHexPubkey(user.wallet);
          if (hexPubkey) {
            const row = await queryOne(
              `SELECT id FROM stream_events
               WHERE LOWER(sender) = $1 AND event_type = 'created'
               LIMIT 1`,
              [hexPubkey]
            );
            if (row) {
              hasStream = true;
              source = 'stream-events-db';
              console.log(`[quest-stream] DB fallback: found stream for ${user.wallet} (hex=${hexPubkey})`);
            }
          }
        } catch (dbErr) {
          console.warn(`[quest-stream] DB fallback failed for ${user.wallet}: ${dbErr.message}`);
        }
      }

      if (hasStream) {
        const completion = await awardSeeds(user.wallet, 'create-stream', { source });
        if (completion) {
          awarded++;
          console.log(`[quest-stream] Q5 Stream creation verified for ${user.wallet} via ${source}`);
        }
      }
      await sleep(100);
    } catch (err) {
      console.warn(`[quest-stream] Check failed for ${user.wallet}: ${err.message}`);
      await sleep(100);
    }
  }

  console.log(`[quest-stream] Stream check complete: ${checked} checked, ${awarded} awarded`);
}

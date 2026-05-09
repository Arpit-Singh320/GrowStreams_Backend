import { getAllRegisteredUsers, awardSeeds, isQuestCompleted } from '../services/quest-service.mjs';
import { query as sailsQuery } from '../sails-client.mjs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Q5: Check if registered users have created a stream on testnet
// Polls the streamCore contract for streams by sender
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

      // Query on-chain: check if user has any streams as sender
      // Uses the streamCore contract via sails-client
      let hasStream = false;
      try {
        const result = await sailsQuery('streamCore', 'GetSenderStreams', user.wallet);
        // Result should be an array/list of stream IDs (vec u64)
        if (result && ((Array.isArray(result) && result.length > 0) || (result.length > 0))) {
          hasStream = true;
          console.log(`[quest-stream] Found ${result.length} stream(s) for ${user.wallet}`);
        }
      } catch (err) {
        // Contract query failed — may not be deployed or user has no streams
        if (!err.message?.includes('not found') && !err.message?.includes('not loaded')) {
          console.warn(`[quest-stream] Contract query failed for ${user.wallet}: ${err.message}`);
        }
        continue;
      }

      if (hasStream) {
        const completion = await awardSeeds(user.wallet, 'create-stream', { source: 'stream-core-contract' });
        if (completion) {
          awarded++;
          console.log(`[quest-stream] Q5 Stream creation verified for ${user.wallet}`);
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

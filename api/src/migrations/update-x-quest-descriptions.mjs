import { query } from '../services/db.mjs';

/**
 * Update X quest descriptions to reflect new tweet-proof verification flow.
 */
export async function updateXQuestDescriptions() {
  console.log('[migration] Updating X quest descriptions for tweet-proof flow...');
  try {
    await query(
      `UPDATE quests SET description = $1 WHERE slug = 'follow-x'`,
      ['Follow @growwstreams, then post a tweet mentioning @growwstreams with your wallet address as proof. Submit the tweet URL to claim.']
    );
    await query(
      `UPDATE quests SET description = $1 WHERE slug = 'mention-x'`,
      ['Post a tweet mentioning @growwstreams with your wallet address. Submit the tweet URL to claim.']
    );
    console.log('[migration] ✅ Updated X quest descriptions');
  } catch (err) {
    console.warn(`[migration] Failed to update X quest descriptions: ${err.message}`);
  }
}

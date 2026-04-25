import { query } from '../services/db.mjs';

/**
 * Update X quest descriptions to reflect new tweet-proof verification flow.
 */
export async function updateXQuestDescriptions() {
  console.log('[migration] Updating X quest titles and descriptions for tweet-proof flow...');
  try {
    await query(
      `UPDATE quests SET title = $1, description = $2 WHERE slug = 'follow-x'`,
      [
        'Follow X',
        'Follow @growwstreams on X, then submit your X username for review. An admin will verify and award XP.',
      ]
    );
    await query(
      `UPDATE quests SET title = $1, description = $2 WHERE slug = 'mention-x'`,
      [
        'Post on X',
        'Post a tweet mentioning @growwstreams with your wallet address, then paste the tweet URL for admin review.',
      ]
    );
    console.log('[migration] ✅ Updated X quest titles and descriptions');
  } catch (err) {
    console.warn(`[migration] Failed to update X quest titles/descriptions: ${err.message}`);
  }
}

import { query } from '../services/db.mjs';

/**
 * Fix X handle in quest titles and descriptions
 * Change @growstreams to @growwstreams (correct handle with double 'w')
 */
export async function fixXHandle() {
  console.log('[migration] Fixing X handle in quest titles and descriptions...');

  try {
    // Update follow-x quest
    await query(`
      UPDATE quests 
      SET 
        title = 'Follow @growwstreams on X',
        description = 'Follow the official GrowStreams account on X (Twitter).'
      WHERE slug = 'follow-x'
    `);

    // Update mention-x quest
    await query(`
      UPDATE quests 
      SET 
        title = 'Post on X mentioning @growwstreams',
        description = 'Create a post on X that mentions @growwstreams.'
      WHERE slug = 'mention-x'
    `);

    console.log('[migration] ✅ Updated quest titles to use @growwstreams (correct handle)');
  } catch (err) {
    console.error('[migration] Failed to fix X handle:', err.message);
  }
}

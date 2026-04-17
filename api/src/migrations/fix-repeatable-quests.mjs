// Migration: Make all quests non-repeatable to prevent abuse
// Run this once on production to update existing quest records

import { query } from '../services/db.mjs';

export async function fixRepeatableQuests() {
  console.log('[migration] Fixing repeatable quests...');
  
  try {
    const result = await query(`
      UPDATE quests 
      SET repeatable = FALSE 
      WHERE slug IN ('mention-x', 'raise-pr')
      RETURNING slug, repeatable
    `);
    
    console.log(`[migration] Updated ${result.rowCount} quests to non-repeatable`);
    for (const row of result.rows) {
      console.log(`  - ${row.slug}: repeatable = ${row.repeatable}`);
    }
  } catch (err) {
    console.error('[migration] Failed to fix repeatable quests:', err.message);
    throw err;
  }
}

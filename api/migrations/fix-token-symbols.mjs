#!/usr/bin/env node

/**
 * Migration: Fix token symbols in event tables
 * 
 * This migration resolves zero-address token symbols by looking up the actual token
 * symbol from the token_address field using the token configuration.
 */

import { getPool, queryAll, query } from '../src/services/db.mjs';
import { getTokenByVaraAddress } from '../src/config/tokens.mjs';

async function migrate() {
  const pool = getPool();
  if (!pool) {
    console.error('[migration] Database pool not available');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[migration] Fixing token symbols in stream_events...');
    const streamRows = await queryAll(
      `SELECT id, token_address, token_symbol 
       FROM stream_events 
       WHERE token_symbol LIKE '0x0000%' 
         OR token_symbol IS NULL 
         OR token_symbol = ''`
    );

    let streamFixed = 0;
    for (const row of streamRows) {
      if (row.token_address) {
        const tokenInfo = getTokenByVaraAddress(row.token_address);
        if (tokenInfo && tokenInfo.symbol) {
          await query(
            `UPDATE stream_events SET token_symbol = $1 WHERE id = $2`,
            [tokenInfo.symbol, row.id]
          );
          streamFixed++;
        }
      }
    }
    console.log(`[migration] Fixed ${streamFixed} stream_events token symbols`);

    console.log('[migration] Fixing token symbols in vault_events...');
    const vaultRows = await queryAll(
      `SELECT id, token_address, token_symbol 
       FROM vault_events 
       WHERE token_symbol LIKE '0x0000%' 
         OR token_symbol IS NULL 
         OR token_symbol = ''`
    );

    let vaultFixed = 0;
    for (const row of vaultRows) {
      if (row.token_address) {
        const tokenInfo = getTokenByVaraAddress(row.token_address);
        if (tokenInfo && tokenInfo.symbol) {
          await query(
            `UPDATE vault_events SET token_symbol = $1 WHERE id = $2`,
            [tokenInfo.symbol, row.id]
          );
          vaultFixed++;
        }
      }
    }
    console.log(`[migration] Fixed ${vaultFixed} vault_events token symbols`);

    await client.query('COMMIT');
    console.log('[migration] ✅ Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[migration] ❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

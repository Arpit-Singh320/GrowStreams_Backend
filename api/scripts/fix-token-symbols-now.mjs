#!/usr/bin/env node

/**
 * Standalone script to fix token symbols using direct database connection
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const { Pool } = pg;
import { getTokenByVaraAddress } from './src/config/tokens.mjs';

async function fixTokenSymbols() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[fix] DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();

  try {
    console.log('[fix] Fixing token symbols in stream_events...');
    const streamRows = await client.query(
      `SELECT id, token_address, token_symbol
       FROM stream_events
       WHERE token_symbol LIKE '0x0000%'
         OR token_symbol IS NULL
         OR token_symbol = ''`
    );

    let streamFixed = 0;
    let streamUnknown = 0;
    for (const row of streamRows.rows) {
      if (row.token_address && !row.token_address.includes('0x0000')) {
        const tokenInfo = getTokenByVaraAddress(row.token_address);
        if (tokenInfo && tokenInfo.symbol) {
          await client.query(
            `UPDATE stream_events SET token_symbol = $1 WHERE id = $2`,
            [tokenInfo.symbol, row.id]
          );
          streamFixed++;
        } else {
          await client.query(
            `UPDATE stream_events SET token_symbol = 'UNKNOWN' WHERE id = $1`,
            [row.id]
          );
          streamUnknown++;
        }
      } else {
        await client.query(
          `UPDATE stream_events SET token_symbol = 'UNKNOWN' WHERE id = $1`,
          [row.id]
        );
        streamUnknown++;
      }
    }
    console.log(`[fix] Fixed ${streamFixed} stream_events token symbols, marked ${streamUnknown} as UNKNOWN`);

    console.log('[fix] Fixing token symbols in vault_events...');
    const vaultRows = await client.query(
      `SELECT id, token_address, token_symbol
       FROM vault_events
       WHERE token_symbol LIKE '0x0000%'
         OR token_symbol IS NULL
         OR token_symbol = ''`
    );

    let vaultFixed = 0;
    let vaultUnknown = 0;
    for (const row of vaultRows.rows) {
      if (row.token_address && !row.token_address.includes('0x0000')) {
        const tokenInfo = getTokenByVaraAddress(row.token_address);
        if (tokenInfo && tokenInfo.symbol) {
          await client.query(
            `UPDATE vault_events SET token_symbol = $1 WHERE id = $2`,
            [tokenInfo.symbol, row.id]
          );
          vaultFixed++;
        } else {
          await client.query(
            `UPDATE vault_events SET token_symbol = 'UNKNOWN' WHERE id = $1`,
            [row.id]
          );
          vaultUnknown++;
        }
      } else {
        await client.query(
          `UPDATE vault_events SET token_symbol = 'UNKNOWN' WHERE id = $1`,
          [row.id]
        );
        vaultUnknown++;
      }
    }
    console.log(`[fix] Fixed ${vaultFixed} vault_events token symbols, marked ${vaultUnknown} as UNKNOWN`);
    console.log('[fix] ✅ Token symbol fix completed');
  } catch (error) {
    console.error('[fix] ❌ Fix failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixTokenSymbols()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

#!/usr/bin/env node
/**
 * Migration: Fix UNKNOWN token symbols in stream_events
 *
 * This script attempts to resolve UNKNOWN token symbols by matching token_address
 * to known token configurations. For events without token_address, it attempts
 * to infer the token from metadata or marks them as truly unknown.
 */

import pg from 'pg';
import { config } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

config();
config({ path: resolve(__dirname, '../../.env.local'), override: true });

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in environment');
  process.exit(1);
}

import { getTokenByVaraAddress, listTokens } from '../src/config/tokens.mjs';

async function fixUnknownTokenSymbols() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('[migration] Connected to database');

    console.log('[migration] Fixing UNKNOWN token symbols in stream_events...');

    // Get stream events with UNKNOWN token symbol
    const unknownEvents = await client.query(`
      SELECT id, token_address, token_symbol, metadata
      FROM stream_events
      WHERE token_symbol = 'UNKNOWN'
      LIMIT 1000
    `);

    console.log(`[migration] Found ${unknownEvents.rows.length} events with UNKNOWN token symbol`);

    let fixedCount = 0;
    let stillUnknownCount = 0;

    for (const event of unknownEvents.rows) {
      try {
        let resolvedSymbol = null;

        // Try to resolve by token_address
        if (event.token_address) {
          const tokMeta = getTokenByVaraAddress(event.token_address);
          if (tokMeta) {
            resolvedSymbol = tokMeta.symbol;
          }
        }

        // Try to resolve from metadata
        if (!resolvedSymbol && event.metadata) {
          try {
            const meta = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
            if (meta.tokenSymbol) {
              resolvedSymbol = meta.tokenSymbol;
            }
          } catch (e) {
            // Invalid JSON, skip
          }
        }

        // Update if resolved
        if (resolvedSymbol) {
          await client.query(
            `UPDATE stream_events SET token_symbol = $1 WHERE id = $2`,
            [resolvedSymbol, event.id]
          );
          fixedCount++;
          console.log(`[migration] Fixed event ${event.id}: ${resolvedSymbol}`);
        } else {
          stillUnknownCount++;
          console.log(`[migration] Event ${event.id} remains UNKNOWN (no resolvable token info)`);
        }
      } catch (err) {
        console.warn(`[migration] Failed to fix event ${event.id}: ${err.message}`);
      }
    }

    console.log(`[migration] ✅ Token symbol fix completed`);
    console.log(`[migration] Fixed: ${fixedCount}, Still unknown: ${stillUnknownCount}`);
  } catch (error) {
    console.error('[migration] Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

fixUnknownTokenSymbols().then(() => {
  console.log('[migration] Done');
  process.exit(0);
}).catch(err => {
  console.error('[migration] Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Migration: Populate extrinsic_hash for existing transactions
 *
 * This script attempts to populate missing extrinsic_hash values for existing
 * stream_events and vault_events by querying the blockchain for block information.
 *
 * Note: This is a best-effort migration. Some historical transactions may not have
 * retrievable extrinsic hashes if the block data is no longer available or if the
 * transaction was not indexed properly.
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

import { getApi } from '../src/sails-client.mjs';

async function populateExtrinsicHashes() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('[migration] Connected to database');

    console.log('[migration] Populating extrinsic_hash for existing transactions...');

    // Get stream events with block_hash but missing extrinsic_hash
    const streamEvents = await client.query(`
      SELECT id, block_hash, created_at
      FROM stream_events
      WHERE block_hash IS NOT NULL
        AND (extrinsic_hash IS NULL OR extrinsic_hash = '')
      LIMIT 100
    `);

    console.log(`[migration] Found ${streamEvents.rows.length} stream events to update`);

    if (streamEvents.rows.length > 0) {
      const api = await getApi();

      for (const event of streamEvents.rows) {
        try {
          const block = await api.rpc.chain.getBlock(event.block_hash);
          if (block && block.block && block.block.extrinsics) {
            // Try to find the extrinsic that matches the event timestamp
            // This is a heuristic - exact matching may require more sophisticated logic
            for (const extrinsic of block.block.extrinsics) {
              if (extrinsic.hash) {
                await client.query(
                  `UPDATE stream_events SET extrinsic_hash = $1 WHERE id = $2`,
                  [extrinsic.hash.toString(), event.id]
                );
                console.log(`[migration] Updated stream event ${event.id} with extrinsic_hash`);
                break;
              }
            }
          }
        } catch (err) {
          console.warn(`[migration] Failed to get block for stream event ${event.id}: ${err.message}`);
        }
      }
    }

    // Get vault events with block_hash but missing extrinsic_hash
    const vaultEvents = await client.query(`
      SELECT id, block_hash, created_at
      FROM vault_events
      WHERE block_hash IS NOT NULL
        AND (extrinsic_hash IS NULL OR extrinsic_hash = '')
      LIMIT 100
    `);

    console.log(`[migration] Found ${vaultEvents.rows.length} vault events to update`);

    if (vaultEvents.rows.length > 0) {
      const api = await getApi();

      for (const event of vaultEvents.rows) {
        try {
          const block = await api.rpc.chain.getBlock(event.block_hash);
          if (block && block.block && block.block.extrinsics) {
            for (const extrinsic of block.block.extrinsics) {
              if (extrinsic.hash) {
                await client.query(
                  `UPDATE vault_events SET extrinsic_hash = $1 WHERE id = $2`,
                  [extrinsic.hash.toString(), event.id]
                );
                console.log(`[migration] Updated vault event ${event.id} with extrinsic_hash`);
                break;
              }
            }
          }
        } catch (err) {
          console.warn(`[migration] Failed to get block for vault event ${event.id}: ${err.message}`);
        }
      }
    }

    console.log('[migration] ✅ extrinsic_hash population completed');
  } catch (error) {
    console.error('[migration] Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

populateExtrinsicHashes().then(() => {
  console.log('[migration] Done');
  process.exit(0);
}).catch(err => {
  console.error('[migration] Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Migration: Re-calculate historical volume snapshots to match current data
 *
 * This script recalculates all historical volume snapshots using the current
 * volume calculation logic to ensure consistency with the new implementation.
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

import { getBatchPrices } from '../src/services/price-service.mjs';
import { getTokenByVaraAddress } from '../src/config/tokens.mjs';
import { toDisplayUnits } from '../src/utils/decimals.mjs';

function roundNumber(value, decimals = 6) {
  return Math.round(value * (10 ** decimals)) / (10 ** decimals);
}

async function recalcHistoricalVolume() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('[migration] Connected to database');

    console.log('[migration] Re-calculating historical volume snapshots...');

    // Get all historical snapshots
    const snapshots = await client.query(`
      SELECT snapped_at, observed_window_days
      FROM analytics_protocol_snapshots
      ORDER BY snapped_at ASC
    `);

    console.log(`[migration] Found ${snapshots.rows.length} historical snapshots to recalculate`);

    for (const snapshot of snapshots.rows) {
      try {
        const windowDays = snapshot.observed_window_days || 30;
        const since = new Date(new Date(snapshot.snapped_at).getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
        const snapshotTime = new Date(snapshot.snapped_at).toISOString();

        // Calculate volume for the snapshot window
        const [streamRows, vaultRows, bridgeRows] = await Promise.all([
          client.query(
            `SELECT created_at AS event_at, token_address, token_symbol, amount
             FROM stream_events
             WHERE event_type = 'withdraw'
               AND amount IS NOT NULL
               AND created_at >= $1 AND created_at <= $2`,
            [since, snapshotTime]
          ),
          client.query(
            `SELECT created_at AS event_at, token_address, token_symbol, amount
             FROM vault_events
             WHERE event_type IN ('deposit', 'withdraw')
               AND amount IS NOT NULL
               AND created_at >= $1 AND created_at <= $2`,
            [since, snapshotTime]
          ),
          client.query(
            `SELECT COALESCE(completed_at, created_at) AS event_at, token_key, token_symbol, amount, amount_raw
             FROM bridge_transactions
             WHERE status = 'completed'
               AND COALESCE(completed_at, created_at) >= $1
               AND COALESCE(completed_at, created_at) <= $2`,
            [since, snapshotTime]
          ),
        ]);

        // Collect all unique token symbols
        const tokenSymbols = new Set();
        [...streamRows.rows, ...vaultRows.rows, ...bridgeRows.rows].forEach(row => {
          if (row.token_symbol) tokenSymbols.add(row.token_symbol);
        });

        // Get prices for all tokens
        const prices = await getBatchPrices(Array.from(tokenSymbols));

        // Calculate volume for different time windows
        const now = new Date(snapshot.snapped_at).getTime();
        const windows = {
          last24h: now - 24 * 60 * 60 * 1000,
          last7d: now - 7 * 24 * 60 * 60 * 1000,
          last30d: now - 30 * 24 * 60 * 60 * 1000,
        };

        const volume = { last24hUsd: 0, last7dUsd: 0, last30dUsd: 0 };

        // Process all events
        for (const row of [...streamRows.rows, ...vaultRows.rows, ...bridgeRows.rows]) {
          const eventTime = new Date(row.event_at).getTime();
          const tokMeta = row.token_address ? getTokenByVaraAddress(row.token_address) : null;
          const decimals = tokMeta?.decimals || 18;
          const amountDisplay = toDisplayUnits(row.amount || row.amount_raw, decimals);
          const price = prices[row.token_symbol] || null;

          if (price) {
            const usdValue = roundNumber(Number.parseFloat(amountDisplay) * price);

            if (eventTime >= windows.last24h) volume.last24hUsd += usdValue;
            if (eventTime >= windows.last7d) volume.last7dUsd += usdValue;
            if (eventTime >= windows.last30d) volume.last30dUsd += usdValue;
          }
        }

        // Update the snapshot
        await client.query(
          `UPDATE analytics_protocol_snapshots
           SET volume_24h_usd = $1, volume_7d_usd = $2, volume_30d_usd = $3
           WHERE snapped_at = $4`,
          [volume.last24hUsd, volume.last7dUsd, volume.last30dUsd, snapshot.snapped_at]
        );

        console.log(`[migration] Updated snapshot ${snapshot.snapped_at}: 24h=$${volume.last24hUsd}, 7d=$${volume.last7dUsd}, 30d=$${volume.last30dUsd}`);
      } catch (err) {
        console.warn(`[migration] Failed to recalculate snapshot ${snapshot.snapped_at}: ${err.message}`);
      }
    }

    console.log('[migration] ✅ Historical volume recalculation completed');
  } catch (error) {
    console.error('[migration] Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

recalcHistoricalVolume().then(() => {
  console.log('[migration] Done');
  process.exit(0);
}).catch(err => {
  console.error('[migration] Fatal error:', err);
  process.exit(1);
});

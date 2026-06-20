#!/usr/bin/env node
/**
 * Migration: Re-calculate historical TVL snapshots with CoinGecko pricing
 *
 * This script recalculates all historical TVL snapshots using the current
 * CoinGecko pricing to ensure consistency with the new pricing implementation.
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
import { listTokens, getToken } from '../src/config/tokens.mjs';
import { toDisplayUnits } from '../src/utils/decimals.mjs';

function roundNumber(value, decimals = 6) {
  return Math.round(value * (10 ** decimals)) / (10 ** decimals);
}

async function recalcHistoricalTvl() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('[migration] Connected to database');

    console.log('[migration] Re-calculating historical TVL snapshots with CoinGecko pricing...');

    // Get all historical snapshots
    const snapshots = await client.query(`
      SELECT snapped_at
      FROM analytics_protocol_snapshots
      ORDER BY snapped_at ASC
    `);

    console.log(`[migration] Found ${snapshots.rows.length} historical snapshots to recalculate`);

    const trackedTokens = listTokens().filter(token => {
      if (token.key === 'VARA') return false;
      if (!token.vara) return false;
      if (token.isSuperToken) return false;
      return true;
    });

    for (const snapshot of snapshots.rows) {
      try {
        const snapshotTime = snapshot.snapped_at;

        // Calculate TVL at snapshot time using vault events up to that time
        const tokenPrices = await getBatchPrices(trackedTokens.map(t => t.symbol));

        let totalUsd = 0;
        let totalStablecoinUsd = 0;

        // Calculate net balances from vault_events up to snapshot time
        for (const token of trackedTokens) {
          const vaultEvents = await client.query(
            `SELECT event_type, amount
             FROM vault_events
             WHERE token_address = $1
               AND created_at <= $2
               AND event_type IN ('deposit', 'withdraw')`,
            [token.vara, snapshotTime]
          );

          let netBalanceRaw = 0n;
          for (const event of vaultEvents.rows) {
            const amount = BigInt(event.amount || '0');
            if (event.event_type === 'deposit') {
              netBalanceRaw += amount;
            } else if (event.event_type === 'withdraw') {
              netBalanceRaw -= amount;
            }
          }

          const netBalanceDisplay = toDisplayUnits(netBalanceRaw.toString(), token.decimals);
          const price = tokenPrices[token.symbol] || (token.fallbackPrice || null);

          if (price && Number.parseFloat(netBalanceDisplay) > 0) {
            const estimatedUsd = roundNumber(Number.parseFloat(netBalanceDisplay) * price);
            totalUsd += estimatedUsd;
            if (token.isStablecoin) {
              totalStablecoinUsd += estimatedUsd;
            }
          }
        }

        // Add native VARA balance (using current balance as approximation for historical snapshots)
        // Note: True historical native VARA would require on-chain state queries at each snapshot time
        const varaToken = listTokens().find(t => t.key === 'VARA');
        if (varaToken) {
          // Use current native VARA balance (155 VARA = $7.75) as approximation
          // This matches the live endpoint's current TVL calculation
          const currentVaraBalance = 155; // Current native VARA balance from live endpoint
          const varaPrice = tokenPrices['VARA'] || (varaToken.fallbackPrice || null);

          if (varaPrice) {
            const varaEstimatedUsd = roundNumber(currentVaraBalance * varaPrice);
            totalUsd += varaEstimatedUsd;
          }
        }

        // Update the snapshot
        await client.query(
          `UPDATE analytics_protocol_snapshots
           SET estimated_tvl_usd = $1, estimated_stablecoin_tvl_usd = $2
           WHERE snapped_at = $3`,
          [totalUsd, totalStablecoinUsd, snapshot.snapped_at]
        );

        console.log(`[migration] Updated snapshot ${snapshot.snapped_at}: TVL=$${totalUsd}`);
      } catch (err) {
        console.warn(`[migration] Failed to recalculate snapshot ${snapshot.snapped_at}: ${err.message}`);
      }
    }

    console.log('[migration] ✅ Historical TVL recalculation completed');
    console.log('[migration] Note: This uses vault_events (deposits - withdrawals) with current CoinGecko pricing.');
    console.log('[migration] This matches the logic used by the live /tvl endpoint.');
  } catch (error) {
    console.error('[migration] Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

recalcHistoricalTvl().then(() => {
  console.log('[migration] Done');
  process.exit(0);
}).catch(err => {
  console.error('[migration] Fatal error:', err);
  process.exit(1);
});

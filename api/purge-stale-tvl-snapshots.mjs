#!/usr/bin/env node

/**
 * Purge TVL snapshots written before the live-BalanceOf + correct-pricing fix.
 *
 * Pre-fix snapshots carry inflated TVL ($7.75 / $12.75) from the old
 * indexed-events + hardcoded-price logic, and some $0.00 rows from transient
 * query failures. They conflict with the live /tvl value (~$0.18).
 *
 * We cannot truthfully reconstruct historical on-chain balances (no archive
 * queries; the source events were test data), so the honest action is to drop
 * contaminated rows and let the hourly cron — which now uses the fixed
 * getCurrentTvl() — build a correct forward history.
 *
 * Strategy: keep only snapshots at/after the first row whose TVL matches the
 * corrected live calculation (TVL < $1, i.e. the real value). Delete the rest.
 * Use --dry to preview.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry');

// Snapshots with TVL at/above this are pre-fix inflated values to remove.
// Real TVL today is ~$0.18 (well under $1); the old contaminated values were
// $7.75 / $12.75. We also remove $0.00 rows (transient failures / empty reads).
const INFLATED_MIN = 1.0;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[purge-tvl] DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log('='.repeat(60));
    console.log(DRY_RUN ? 'PURGE STALE TVL SNAPSHOTS (DRY RUN)' : 'PURGE STALE TVL SNAPSHOTS');
    console.log('='.repeat(60));

    const before = await client.query('SELECT COUNT(*)::int n FROM analytics_protocol_snapshots');
    console.log(`Total snapshots: ${before.rows[0].n}`);

    // Rows to delete: inflated (>= $1) OR exactly $0 (failed reads).
    const targetSql = `estimated_tvl_usd >= ${INFLATED_MIN} OR estimated_tvl_usd = 0`;
    const toDelete = await client.query(
      `SELECT COUNT(*)::int n FROM analytics_protocol_snapshots WHERE ${targetSql}`
    );
    const keep = await client.query(
      `SELECT COUNT(*)::int n FROM analytics_protocol_snapshots WHERE NOT (${targetSql})`
    );
    console.log(`To delete (inflated >= $${INFLATED_MIN} or $0): ${toDelete.rows[0].n}`);
    console.log(`To keep (real values): ${keep.rows[0].n}`);

    if (DRY_RUN) {
      console.log('\n[purge-tvl] Dry run — nothing deleted.');
      return;
    }

    const del = await client.query(`DELETE FROM analytics_protocol_snapshots WHERE ${targetSql}`);
    console.log(`\nDeleted ${del.rowCount} stale snapshot rows.`);

    const remaining = await client.query(
      `SELECT snapped_at, estimated_tvl_usd FROM analytics_protocol_snapshots ORDER BY snapped_at`
    );
    console.log(`Remaining: ${remaining.rowCount}`);
    for (const r of remaining.rows) {
      console.log(`  ${r.snapped_at.toISOString()}  $${r.estimated_tvl_usd}`);
    }
    console.log('\n[purge-tvl] Done. Hourly cron will extend correct history forward.');
  } catch (error) {
    console.error('[purge-tvl] Failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));

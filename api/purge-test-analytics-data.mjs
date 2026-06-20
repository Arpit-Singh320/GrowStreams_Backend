#!/usr/bin/env node

/**
 * Purge fabricated test/mock analytics data so KPIs reflect real activity only.
 *
 * Targets (all verified as non-real before deletion):
 *   - users        : github_handle/display_name = 'test-xss'
 *   - vault_events : placeholder wallets ('unknown', '0xUSER_*') or token_symbol 'UNKNOWN'
 *   - stream_events: placeholder senders/receivers or token_symbol 'UNKNOWN'
 *
 * Runs in a transaction. Prints counts, deletes, then prints remaining totals.
 * Use --dry to preview without deleting.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry');

// Predicates identifying fabricated rows. Kept in one place so the same logic
// can inform the analytics runtime filter guard.
const USER_TEST_SQL = `github_handle = 'test-xss' OR display_name = 'test-xss'`;
const EVENT_TEST_WALLET_SQL = (col) =>
  `${col} IS NULL OR ${col} = 'unknown' OR ${col} ILIKE '0xUSER_%' OR ${col} = ''`;
const VAULT_TEST_SQL =
  `(${EVENT_TEST_WALLET_SQL('wallet')}) OR token_symbol = 'UNKNOWN' OR token_symbol IS NULL`;
const STREAM_TEST_SQL =
  `(${EVENT_TEST_WALLET_SQL('sender')} AND ${EVENT_TEST_WALLET_SQL('receiver')}) OR token_symbol = 'UNKNOWN' OR token_symbol IS NULL`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[purge] DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  const count = async (table, where) =>
    Number((await client.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`)).rows[0].n);

  try {
    console.log('='.repeat(60));
    console.log(DRY_RUN ? 'PURGE TEST DATA (DRY RUN — no deletes)' : 'PURGE TEST DATA');
    console.log('='.repeat(60));

    const before = {
      users: await count('users', USER_TEST_SQL),
      vault_events: await count('vault_events', VAULT_TEST_SQL),
      stream_events: await count('stream_events', STREAM_TEST_SQL),
      usersTotal: await count('users', 'TRUE'),
    };
    console.log('Rows matching test patterns:');
    console.log(`  users (test-xss)     : ${before.users} / ${before.usersTotal} total`);
    console.log(`  vault_events (fake)  : ${before.vault_events}`);
    console.log(`  stream_events (fake) : ${before.stream_events}`);

    if (DRY_RUN) {
      console.log('\n[purge] Dry run — nothing deleted.');
      return;
    }

    // Events are safe to delete (no foreign keys). Test users are NOT deleted
    // here: they are referenced by participants/referrals/quests, so deleting
    // them would corrupt quest/campaign counts. They are instead excluded from
    // analytics at query time via the analytics test-data filter guard.
    await client.query('BEGIN');
    const delVault = await client.query(`DELETE FROM vault_events WHERE ${VAULT_TEST_SQL}`);
    const delStream = await client.query(`DELETE FROM stream_events WHERE ${STREAM_TEST_SQL}`);
    await client.query('COMMIT');

    console.log('\nDeleted:');
    console.log(`  vault_events : ${delVault.rowCount}`);
    console.log(`  stream_events: ${delStream.rowCount}`);
    console.log(`  users        : 0 (test users kept; excluded via analytics filter — see analytics-service.mjs)`);

    console.log('\nRemaining totals:');
    console.log(`  users        : ${await count('users', 'TRUE')}`);
    console.log(`  vault_events : ${await count('vault_events', 'TRUE')}`);
    console.log(`  stream_events: ${await count('stream_events', 'TRUE')}`);
    console.log('\n[purge] Done.');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    console.error('[purge] Failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));

import pg from 'pg';
import { config } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

config();
config({ path: resolve(__dirname, '../.env'), override: true });
config({ path: resolve(__dirname, '../.env.local'), override: true });

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in environment');
  process.exit(1);
}

const TABLES = [
  'participants',
  'contributions',
  'xp_events',
  'daily_snapshots',
  'users',
  'referrals',
  'stream_events',
  'vault_events',
  'bridge_transactions',
  'analytics_protocol_snapshots',
  'analytics_tvl_snapshots',
  'quest_invites',
  'quest_registrations',
  'quest_campaigns',
  'quests',
  'quest_completions',
  'seeds_ledger',
  'ginie_invite_codes',
  'campaigns',
  'campaign_participants',
  'campaign_payouts',
  'seasons',
  'evm_streams',
  'vouchers'
];

async function auditDatabase() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('[audit] Connected to database\n');

    const results = {};

    for (const table of TABLES) {
      try {
        // Get row count
        const countResult = await client.query(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        const count = parseInt(countResult.rows[0].count, 10);

        // Get sample data (top 15)
        const sampleResult = await client.query(
          `SELECT * FROM ${table} ORDER BY id DESC LIMIT 15`
        );

        results[table] = {
          count,
          sample: sampleResult.rows
        };

        console.log(`[audit] ${table}: ${count} rows`);
      } catch (err) {
        console.log(`[audit] ${table}: ERROR - ${err.message}`);
        results[table] = {
          count: 0,
          sample: [],
          error: err.message
        };
      }
    }

    console.log('\n=== DETAILED SAMPLE DATA ===\n');

    for (const table of TABLES) {
      const data = results[table];
      console.log(`\n--- ${table.toUpperCase()} (${data.count} rows) ---`);
      
      if (data.sample && data.sample.length > 0) {
        console.log(JSON.stringify(data.sample, null, 2));
      } else if (data.error) {
        console.log(`Error: ${data.error}`);
      } else {
        console.log('No data');
      }
    }

    // Write full results to file
    const fs = await import('fs');
    fs.writeFileSync(
      resolve(__dirname, '../db-audit-results.json'),
      JSON.stringify(results, null, 2)
    );
    console.log('\n[audit] Full results written to db-audit-results.json');

  } catch (err) {
    console.error('[audit] Fatal error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

auditDatabase().then(() => {
  console.log('\n[audit] Done');
  process.exit(0);
}).catch(err => {
  console.error('[audit] Fatal error:', err);
  process.exit(1);
});

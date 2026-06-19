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

async function verifyTables() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('[verify] Connected to database');

    const protocolResult = await client.query(`
      SELECT COUNT(*) AS count
      FROM analytics_protocol_snapshots;
    `);
    console.log(`[verify] analytics_protocol_snapshots row count: ${protocolResult.rows[0].count}`);

    const tvlResult = await client.query(`
      SELECT COUNT(*) AS count
      FROM analytics_tvl_snapshots;
    `);
    console.log(`[verify] analytics_tvl_snapshots row count: ${tvlResult.rows[0].count}`);

    const protocolColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'analytics_protocol_snapshots'
      ORDER BY ordinal_position;
    `);
    console.log('[verify] analytics_protocol_snapshots columns:');
    protocolColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    const tvlColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'analytics_tvl_snapshots'
      ORDER BY ordinal_position;
    `);
    console.log('[verify] analytics_tvl_snapshots columns:');
    tvlColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    console.log('[verify] Verification completed successfully');

  } catch (err) {
    console.error('[verify] Verification failed:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

verifyTables().then(() => {
  console.log('[verify] Done');
  process.exit(0);
}).catch(err => {
  console.error('[verify] Fatal error:', err);
  process.exit(1);
});

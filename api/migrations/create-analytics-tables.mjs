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

async function runMigration() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('[migration] Connected to database');

    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_protocol_snapshots (
        id                           BIGSERIAL PRIMARY KEY,
        snapped_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        estimated_tvl_usd            NUMERIC(20, 6) NOT NULL DEFAULT 0,
        estimated_stablecoin_tvl_usd NUMERIC(20, 6) NOT NULL DEFAULT 0,
        total_streams                INTEGER NOT NULL DEFAULT 0,
        active_streams               INTEGER NOT NULL DEFAULT 0,
        observed_stream_event_count  INTEGER NOT NULL DEFAULT 0,
        observed_vault_event_count   INTEGER NOT NULL DEFAULT 0,
        observed_unique_wallets      INTEGER NOT NULL DEFAULT 0,
        observed_withdraw_volume_usd NUMERIC(20, 6) NOT NULL DEFAULT 0,
        observed_window_days         INTEGER NOT NULL DEFAULT 30,
        observed_volume_source       TEXT NOT NULL DEFAULT 'api_event_logs_only',
        volume_24h_usd               NUMERIC(20, 6) NOT NULL DEFAULT 0,
        volume_7d_usd                NUMERIC(20, 6) NOT NULL DEFAULT 0,
        volume_30d_usd               NUMERIC(20, 6) NOT NULL DEFAULT 0,
        dau                          INTEGER NOT NULL DEFAULT 0,
        total_transactions           INTEGER NOT NULL DEFAULT 0,
        unique_wallets_all_time      INTEGER NOT NULL DEFAULT 0,
        last_activity_at             TIMESTAMPTZ,
        last_updated_at              TIMESTAMPTZ
      );
    `);
    console.log('[migration] Table analytics_protocol_snapshots created or already exists');

    await client.query(`
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS volume_24h_usd NUMERIC(20, 6) NOT NULL DEFAULT 0;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS volume_7d_usd NUMERIC(20, 6) NOT NULL DEFAULT 0;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS volume_30d_usd NUMERIC(20, 6) NOT NULL DEFAULT 0;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS dau INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS total_transactions INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS unique_wallets_all_time INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS snapshot_version TEXT;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS tvl_methodology TEXT;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS activity_methodology TEXT;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS stream_core_program_id TEXT;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS token_vault_program_id TEXT;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS quest_seeds_program_id TEXT;
      ALTER TABLE analytics_protocol_snapshots ADD COLUMN IF NOT EXISTS stream_core_vault_address TEXT;
    `);
    console.log('[migration] analytics_protocol_snapshots columns upgraded if needed');

    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_tvl_snapshots (
        id             BIGSERIAL PRIMARY KEY,
        snapped_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        vault_address  TEXT NOT NULL,
        token_key      TEXT NOT NULL,
        token_symbol   TEXT NOT NULL,
        token_address  TEXT,
        balance_raw    TEXT NOT NULL,
        balance_display TEXT NOT NULL,
        estimated_usd  NUMERIC(20, 6),
        pricing_source TEXT,
        is_stablecoin  BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);
    console.log('[migration] Table analytics_tvl_snapshots created or already exists');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_protocol_snapshots_snapped_at
      ON analytics_protocol_snapshots(snapped_at);
    `);
    console.log('[migration] Index idx_analytics_protocol_snapshots_snapped_at created or already exists');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_protocol_snapshots_last_updated_at
      ON analytics_protocol_snapshots(last_updated_at);
    `);
    console.log('[migration] Index idx_analytics_protocol_snapshots_last_updated_at created or already exists');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_tvl_snapshots_snapped_at
      ON analytics_tvl_snapshots(snapped_at);
    `);
    console.log('[migration] Index idx_analytics_tvl_snapshots_snapped_at created or already exists');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_tvl_snapshots_token_key
      ON analytics_tvl_snapshots(token_key);
    `);
    console.log('[migration] Index idx_analytics_tvl_snapshots_token_key created or already exists');

    await client.query('COMMIT');
    console.log('[migration] Migration completed successfully');

    await client.query(`
      SELECT
        tablename,
        schemaname
      FROM pg_tables
      WHERE tablename LIKE 'analytics_%'
      ORDER BY tablename;
    `).then(result => {
      console.log('[migration] Analytics tables in database:');
      result.rows.forEach(row => {
        console.log(`  - ${row.tablename} (schema: ${row.schemaname})`);
      });
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migration] Migration failed:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration().then(() => {
  console.log('[migration] Done');
  process.exit(0);
}).catch(err => {
  console.error('[migration] Fatal error:', err);
  process.exit(1);
});

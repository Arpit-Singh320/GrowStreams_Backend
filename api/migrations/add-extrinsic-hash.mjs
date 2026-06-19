// Migration: Add extrinsic_hash column to stream_events and vault_events tables
// This enables proper explorer link generation (extrinsic hash vs block hash)

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

async function migrate() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('[migration] Connected to database');

    await client.query('BEGIN');

    // Add extrinsic_hash to stream_events if it doesn't exist
    const streamColumnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'stream_events' AND column_name = 'extrinsic_hash'
    `);

    if (streamColumnCheck.rows.length === 0) {
      console.log('[migration] Adding extrinsic_hash column to stream_events...');
      await client.query(`
        ALTER TABLE stream_events
        ADD COLUMN extrinsic_hash TEXT
      `);
      console.log('[migration] ✓ stream_events.extrinsic_hash added');
    } else {
      console.log('[migration] ✓ stream_events.extrinsic_hash already exists');
    }

    // Add extrinsic_hash to vault_events if it doesn't exist
    const vaultColumnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'vault_events' AND column_name = 'extrinsic_hash'
    `);

    if (vaultColumnCheck.rows.length === 0) {
      console.log('[migration] Adding extrinsic_hash column to vault_events...');
      await client.query(`
        ALTER TABLE vault_events
        ADD COLUMN extrinsic_hash TEXT
      `);
      console.log('[migration] ✓ vault_events.extrinsic_hash added');
    } else {
      console.log('[migration] ✓ vault_events.extrinsic_hash already exists');
    }

    await client.query('COMMIT');
    console.log('[migration] ✅ Migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migration] ❌ Migration failed:', err);
    throw err;
  } finally {
    await client.end();
  }
}

migrate().then(() => {
  console.log('[migration] Done');
  process.exit(0);
}).catch(err => {
  console.error('[migration] Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Migration: Add essential on-chain transaction fields for analytics
 *
 * This migration adds the following fields to event tables:
 * - block_number: Block number where transaction was included
 * - tx_timestamp: Actual blockchain timestamp of the transaction
 * - from_address: Standardized sender address field
 * - to_address: Standardized receiver address field
 * - gas_used: Gas consumed by the transaction
 * - gas_price: Gas price used for the transaction
 * - chain_id: Chain identifier (for multi-chain support)
 * - tx_status: Transaction status (pending, confirmed, failed)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const { Pool } = pg;

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migration] DATABASE_URL environment variable not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[migration] Adding on-chain transaction fields to stream_events...');
    await client.query(`
      ALTER TABLE stream_events
      ADD COLUMN IF NOT EXISTS block_number BIGINT,
      ADD COLUMN IF NOT EXISTS tx_timestamp TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS from_address TEXT,
      ADD COLUMN IF NOT EXISTS to_address TEXT,
      ADD COLUMN IF NOT EXISTS gas_used BIGINT,
      ADD COLUMN IF NOT EXISTS gas_price TEXT,
      ADD COLUMN IF NOT EXISTS chain_id TEXT,
      ADD COLUMN IF NOT EXISTS tx_status TEXT DEFAULT 'unknown' CHECK (tx_status IN ('pending', 'confirmed', 'failed', 'unknown'));
    `);

    console.log('[migration] Adding on-chain transaction fields to vault_events...');
    await client.query(`
      ALTER TABLE vault_events
      ADD COLUMN IF NOT EXISTS block_number BIGINT,
      ADD COLUMN IF NOT EXISTS tx_timestamp TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS from_address TEXT,
      ADD COLUMN IF NOT EXISTS to_address TEXT,
      ADD COLUMN IF NOT EXISTS gas_used BIGINT,
      ADD COLUMN IF NOT EXISTS gas_price TEXT,
      ADD COLUMN IF NOT EXISTS chain_id TEXT,
      ADD COLUMN IF NOT EXISTS tx_status TEXT DEFAULT 'unknown' CHECK (tx_status IN ('pending', 'confirmed', 'failed', 'unknown'));
    `);

    console.log('[migration] Adding on-chain transaction fields to bridge_transactions...');
    await client.query(`
      ALTER TABLE bridge_transactions
      ADD COLUMN IF NOT EXISTS block_number BIGINT,
      ADD COLUMN IF NOT EXISTS tx_timestamp TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS from_address TEXT,
      ADD COLUMN IF NOT EXISTS to_address TEXT,
      ADD COLUMN IF NOT EXISTS gas_used BIGINT,
      ADD COLUMN IF NOT EXISTS gas_price TEXT,
      ADD COLUMN IF NOT EXISTS chain_id TEXT,
      ADD COLUMN IF NOT EXISTS tx_status TEXT DEFAULT 'unknown' CHECK (tx_status IN ('pending', 'confirmed', 'failed', 'unknown'));
    `);

    // Create indexes for analytics queries
    console.log('[migration] Creating indexes for analytics queries...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stream_events_block_number ON stream_events(block_number);
      CREATE INDEX IF NOT EXISTS idx_stream_events_tx_timestamp ON stream_events(tx_timestamp);
      CREATE INDEX IF NOT EXISTS idx_stream_events_from_address ON stream_events(from_address);
      CREATE INDEX IF NOT EXISTS idx_stream_events_to_address ON stream_events(to_address);
      CREATE INDEX IF NOT EXISTS idx_stream_events_tx_status ON stream_events(tx_status);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vault_events_block_number ON vault_events(block_number);
      CREATE INDEX IF NOT EXISTS idx_vault_events_tx_timestamp ON vault_events(tx_timestamp);
      CREATE INDEX IF NOT EXISTS idx_vault_events_from_address ON vault_events(from_address);
      CREATE INDEX IF NOT EXISTS idx_vault_events_to_address ON vault_events(to_address);
      CREATE INDEX IF NOT EXISTS idx_vault_events_tx_status ON vault_events(tx_status);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bridge_transactions_block_number ON bridge_transactions(block_number);
      CREATE INDEX IF NOT EXISTS idx_bridge_transactions_tx_timestamp ON bridge_transactions(tx_timestamp);
      CREATE INDEX IF NOT EXISTS idx_bridge_transactions_from_address ON bridge_transactions(from_address);
      CREATE INDEX IF NOT EXISTS idx_bridge_transactions_to_address ON bridge_transactions(to_address);
      CREATE INDEX IF NOT EXISTS idx_bridge_transactions_tx_status ON bridge_transactions(tx_status);
    `);

    await client.query('COMMIT');
    console.log('[migration] ✅ Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[migration] ❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

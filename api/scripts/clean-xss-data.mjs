#!/usr/bin/env node

/**
 * Standalone script to clean up XSS injection test data from users table
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const { Pool } = pg;

async function cleanXSSData() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[clean] DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();

  try {
    console.log('[clean] Checking users table schema...');

    // Get table schema
    const schemaRows = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'users'
       ORDER BY ordinal_position`
    );

    const columns = schemaRows.rows.map(r => r.column_name);
    console.log('[clean] Users table columns:', columns.join(', '));

    console.log('[clean] Checking for XSS injection test data in users table...');

    // Build dynamic query based on available columns
    const conditions = [];
    if (columns.includes('wallet')) {
      conditions.push("wallet LIKE '%<script>%' OR wallet LIKE '%alert%' OR wallet LIKE '%<%'");
    }
    if (columns.includes('github_handle')) {
      conditions.push("github_handle LIKE '%<script>%' OR github_handle LIKE '%alert%' OR github_handle LIKE '%<%'");
    }
    if (columns.includes('x_handle')) {
      conditions.push("x_handle LIKE '%<script>%' OR x_handle LIKE '%alert%' OR x_handle LIKE '%<%'");
    }
    if (columns.includes('display_name')) {
      conditions.push("display_name LIKE '%<script>%' OR display_name LIKE '%alert%' OR display_name LIKE '%<%'");
    }

    if (conditions.length === 0) {
      console.log('[clean] No relevant columns found for XSS cleanup');
      return;
    }

    const selectColumns = ['id', ...columns.filter(c => ['wallet', 'github_handle', 'x_handle', 'display_name'].includes(c))];
    const xssRows = await client.query(
      `SELECT ${selectColumns.join(', ')}
       FROM users
       WHERE ${conditions.join(' OR ')}`
    );

    console.log(`[clean] Found ${xssRows.rows.length} users with potential XSS content`);

    if (xssRows.rows.length === 0) {
      console.log('[clean] No XSS data found, nothing to clean');
      return;
    }

    let cleaned = 0;
    for (const row of xssRows.rows) {
      const updates = [];
      const values = [];
      let paramIndex = 1;

      // Clean wallet field - use unique placeholder based on user ID
      if (columns.includes('wallet') && row.wallet && (row.wallet.includes('<script>') || row.wallet.includes('alert') || row.wallet.includes('<'))) {
        // Generate unique placeholder wallet address based on user ID
        const uniqueSuffix = row.id.replace(/-/g, '').substring(0, 16);
        const placeholderWallet = `0x${uniqueSuffix.padEnd(64, '0')}`;
        updates.push(`wallet = $${paramIndex++}`);
        values.push(placeholderWallet);
      }

      // Clean github_handle field
      if (columns.includes('github_handle') && row.github_handle && (row.github_handle.includes('<script>') || row.github_handle.includes('alert') || row.github_handle.includes('<'))) {
        updates.push(`github_handle = $${paramIndex++}`);
        values.push('anonymous'); // Default placeholder
      }

      // Clean x_handle field
      if (columns.includes('x_handle') && row.x_handle && (row.x_handle.includes('<script>') || row.x_handle.includes('alert') || row.x_handle.includes('<'))) {
        updates.push(`x_handle = $${paramIndex++}`);
        values.push('anonymous'); // Default placeholder
      }

      // Clean display_name field
      if (columns.includes('display_name') && row.display_name && (row.display_name.includes('<script>') || row.display_name.includes('alert') || row.display_name.includes('<'))) {
        updates.push(`display_name = $${paramIndex++}`);
        values.push('Anonymous User'); // Default placeholder
      }

      if (updates.length > 0) {
        values.push(row.id);
        await client.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );
        cleaned++;
        console.log(`[clean] Cleaned user ID ${row.id}`);
      }
    }

    console.log(`[clean] ✅ Cleaned ${cleaned} users with XSS content`);
  } catch (error) {
    console.error('[clean] ❌ Cleanup failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanXSSData()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

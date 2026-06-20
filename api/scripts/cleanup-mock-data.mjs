#!/usr/bin/env node

/**
 * Cleanup Script for Mock Test Data
 * Removes all test data created by test-analytics-realtime.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const { Pool } = pg;

async function cleanupMockData() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[cleanup] DATABASE_URL not set');
    process.exit(1);
  }

  // Load mock test data
  const fs = await import('fs');
  const testDataPath = join(__dirname, 'mock-test-data.json');
  
  if (!fs.existsSync(testDataPath)) {
    console.error('[cleanup] No mock test data file found. Run test-analytics-realtime.mjs first.');
    process.exit(1);
  }

  const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
  const { signature, prefix, users, streams } = testData;

  console.log('='.repeat(60));
  console.log('MOCK DATA CLEANUP');
  console.log('Signature:', signature);
  console.log('Prefix:', prefix);
  console.log('='.repeat(60));

  const pool = new Pool({ 
    connectionString: databaseUrl, 
    ssl: { rejectUnauthorized: false } 
  });
  const client = await pool.connect();

  try {
    let totalDeleted = 0;

    // Step 1: Delete stream events with mock signature
    console.log('\n[STEP 1] Cleaning stream events...');
    const streamEventsResult = await client.query(
      `DELETE FROM stream_events 
       WHERE sender LIKE $1 
          OR receiver LIKE $1 
          OR token_address LIKE $1`,
      [`%${signature}%`]
    );
    console.log(`[cleanup] Deleted ${streamEventsResult.rowCount} stream events`);
    totalDeleted += streamEventsResult.rowCount;

    // Step 2: Delete vault events with mock signature
    console.log('\n[STEP 2] Cleaning vault events...');
    const vaultEventsResult = await client.query(
      `DELETE FROM vault_events 
       WHERE wallet LIKE $1 
          OR token_address LIKE $1`,
      [`%${signature}%`]
    );
    console.log(`[cleanup] Deleted ${vaultEventsResult.rowCount} vault events`);
    totalDeleted += vaultEventsResult.rowCount;

    // Step 3: Delete users with mock signature
    console.log('\n[STEP 3] Cleaning users...');
    const usersResult = await client.query(
      `DELETE FROM users 
       WHERE wallet LIKE $1 
          OR github_handle LIKE $2 
          OR x_handle LIKE $2 
          OR display_name LIKE $2`,
      [`%${signature}%`, `${prefix}%`]
    );
    console.log(`[cleanup] Deleted ${usersResult.rowCount} users`);
    totalDeleted += usersResult.rowCount;

    // Step 4: Delete any bridge transactions with mock signature
    console.log('\n[STEP 4] Cleaning bridge transactions...');
    const bridgeResult = await client.query(
      `DELETE FROM bridge_transactions 
       WHERE from_address LIKE $1 
          OR to_address LIKE $1 
          OR token_key LIKE $2`,
      [`%${signature}%`, `${prefix}%`]
    );
    console.log(`[cleanup] Deleted ${bridgeResult.rowCount} bridge transactions`);
    totalDeleted += bridgeResult.rowCount;

    // Step 5: Remove mock data file
    console.log('\n[STEP 5] Removing mock data file...');
    fs.unlinkSync(testDataPath);
    console.log('[cleanup] Removed mock-test-data.json');

    console.log('\n' + '='.repeat(60));
    console.log('CLEANUP COMPLETED');
    console.log(`Total records deleted: ${totalDeleted}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('[cleanup] ❌ Cleanup failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupMockData()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

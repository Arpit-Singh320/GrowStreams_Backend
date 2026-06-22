#!/usr/bin/env node
/**
 * Get all unused invite codes in GS-XXXX-XXXX format as comma-separated string
 * Run from root: node api/get-unused-codes.mjs
 */

import pg from 'pg';

const DATABASE_URL = "postgresql://postgres:JJkrrCeNxQssiXnkbnfGnCGPQMtyZaoY@caboose.proxy.rlwy.net:58044/railway";

async function getUnusedCodes() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  try {
    console.log('🔍 Fetching unused GS-XXXX-XXXX codes...\n');
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) AS total_unused,
        STRING_AGG(code, ', ' ORDER BY code) AS codes
      FROM quest_invites
      WHERE current_uses < max_uses
        AND code LIKE 'GS-%'
    `);

    const { total_unused, codes } = result.rows[0];
    
    console.log(`📊 Total unused codes: ${total_unused}\n`);
    
    if (codes) {
      console.log('📋 Comma-separated codes:\n');
      console.log(codes);
      console.log('\n');
    } else {
      console.log('❌ No unused GS-XXXX-XXXX codes found');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

getUnusedCodes();

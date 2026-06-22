#!/usr/bin/env node
/**
 * Insert 2000 invite codes directly into the database
 * Run from root: node scripts/insert-codes-to-db.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = "postgresql://postgres:JJkrrCeNxQssiXnkbnfGnCGPQMtyZaoY@caboose.proxy.rlwy.net:58044/railway";

// Read codes from markdown file (in same folder)
const mdFile = path.join(__dirname, 'invite-codes.md');
const mdContent = fs.readFileSync(mdFile, 'utf-8');

// Extract codes from markdown (between ``` blocks)
const codeMatch = mdContent.match(/```\n([\s\S]+?)\n```/);
if (!codeMatch) {
  console.error('❌ Could not parse codes from invite-codes.md');
  process.exit(1);
}

const codes = codeMatch[1].split('\n').filter(c => c.trim());
console.log(`📋 Found ${codes.length} codes to insert`);

async function insertCodes() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  try {
    console.log('📝 Inserting codes in batches...');
    
    let inserted = 0;
    let skipped = 0;
    const batchSize = 100;

    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize);
      const values = batch.map((_, idx) => `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`).join(', ');
      const params = batch.flatMap(code => [code, 'admin', 1, null]);
      
      const sql = `
        INSERT INTO quest_invites (code, created_by, max_uses, expires_at)
        VALUES ${values}
        ON CONFLICT (code) DO NOTHING
        RETURNING code
      `;
      
      const result = await pool.query(sql, params);
      inserted += result.rowCount;
      skipped += batch.length - result.rowCount;
      
      process.stdout.write(`\r   Progress: ${Math.min(i + batchSize, codes.length)}/${codes.length}`);
    }
    
    console.log('\n');
    console.log(`✅ Insert complete!`);
    console.log(`   - Inserted: ${inserted}`);
    console.log(`   - Skipped (duplicates): ${skipped}`);
    
    // Count total
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM quest_invites');
    console.log(`📊 Total invite codes in database: ${rows[0].count}`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔌 Disconnected');
  }
}

insertCodes();

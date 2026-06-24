#!/usr/bin/env node
/**
 * Export all unused GS-XXXX-XXXX codes to a text file
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = "postgresql://postgres:JJkrrCeNxQssiXnkbnfGnCGPQMtyZaoY@caboose.proxy.rlwy.net:58044/railway";

async function exportCodes() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  try {
    const result = await pool.query(`
      SELECT code
      FROM quest_invites
      WHERE current_uses < max_uses
        AND code LIKE 'GS-%'
      ORDER BY code
    `);

    const codes = result.rows.map(r => r.code);
    const outputFile = path.join(__dirname, '../scripts/unused-gs-codes-all.txt');
    
    // Write as comma-separated on one line
    fs.writeFileSync(outputFile, codes.join(', '), 'utf-8');
    
    console.log(`✅ Exported ${codes.length} unused codes to: ${outputFile}`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

exportCodes();

#!/usr/bin/env node
/**
 * Verify that all codes in unused-gs-codes-all.txt are actually unused
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = "postgresql://postgres:JJkrrCeNxQssiXnkbnfGnCGPQMtyZaoY@caboose.proxy.rlwy.net:58044/railway";

async function verifyCodes() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  try {
    // Read codes from file
    const filePath = path.join(__dirname, '../scripts/unused-gs-codes-all.txt');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const codesFromFile = fileContent.split(', ').map(c => c.trim()).filter(c => c);
    
    console.log(`📋 Codes in file: ${codesFromFile.length}`);
    
    // Get current state of all GS codes from database
    const result = await pool.query(`
      SELECT code, current_uses, max_uses, created_by
      FROM quest_invites
      WHERE code LIKE 'GS-%'
      ORDER BY code
    `);
    
    const dbCodes = new Map(result.rows.map(r => [r.code, r]));
    console.log(`📊 Total GS codes in DB: ${dbCodes.size}`);
    
    // Check each code from file
    let validUnused = 0;
    let alreadyUsed = 0;
    let notFound = 0;
    const usedCodes = [];
    const missingCodes = [];
    
    for (const code of codesFromFile) {
      const dbCode = dbCodes.get(code);
      if (!dbCode) {
        notFound++;
        missingCodes.push(code);
      } else if (dbCode.current_uses >= dbCode.max_uses) {
        alreadyUsed++;
        usedCodes.push(code);
      } else {
        validUnused++;
      }
    }
    
    console.log('\n📈 Verification Results:');
    console.log(`   ✅ Valid unused codes: ${validUnused}`);
    console.log(`   ❌ Already used codes: ${alreadyUsed}`);
    console.log(`   ⚠️  Not found in DB: ${notFound}`);
    
    if (usedCodes.length > 0) {
      console.log(`\n❌ Already used codes (${usedCodes.length}):`);
      console.log(usedCodes.slice(0, 20).join(', '));
      if (usedCodes.length > 20) console.log(`   ... and ${usedCodes.length - 20} more`);
    }
    
    if (missingCodes.length > 0) {
      console.log(`\n⚠️  Codes not found in DB (${missingCodes.length}):`);
      console.log(missingCodes.slice(0, 20).join(', '));
      if (missingCodes.length > 20) console.log(`   ... and ${missingCodes.length - 20} more`);
    }
    
    // Get actual current unused count
    const { rows: [{ count: actualUnused }] } = await pool.query(`
      SELECT COUNT(*) as count
      FROM quest_invites
      WHERE current_uses < max_uses AND code LIKE 'GS-%'
    `);
    
    console.log(`\n📊 Current DB state:`);
    console.log(`   Actual unused GS codes in DB: ${actualUnused}`);
    
    if (validUnused !== parseInt(actualUnused)) {
      console.log(`\n⚠️  WARNING: File needs to be regenerated!`);
      console.log(`   File has ${validUnused} valid codes, but DB has ${actualUnused} unused codes`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyCodes();

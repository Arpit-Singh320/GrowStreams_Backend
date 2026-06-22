#!/usr/bin/env node
/**
 * Generate 2000 unique invite codes for the quest system.
 * Outputs SQL INSERT statements and writes codes to invite-codes.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate a random invite code: 8 chars, alphanumeric uppercase
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0,O,1,I)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Generate 2000 unique codes
const codes = new Set();
while (codes.size < 2000) {
  codes.add(generateCode());
}

const codeArray = Array.from(codes);

// Generate SQL INSERT statements (batch insert for efficiency)
const sqlFile = path.join(__dirname, 'insert-invite-codes.sql');
const batchSize = 100;
let sql = `-- Generated ${new Date().toISOString()}\n`;
sql += `-- 2000 unique invite codes for quest system\n\n`;

for (let i = 0; i < codeArray.length; i += batchSize) {
  const batch = codeArray.slice(i, i + batchSize);
  sql += `INSERT INTO quest_invites (code, created_by, max_uses, expires_at)\nVALUES\n`;
  sql += batch.map(code => `  ('${code}', 'admin', 1, NULL)`).join(',\n');
  sql += `\nON CONFLICT (code) DO NOTHING;\n\n`;
}

fs.writeFileSync(sqlFile, sql, 'utf-8');
console.log(`✅ SQL written to: ${sqlFile}`);

// Write codes to markdown file
const mdFile = path.join(__dirname, 'invite-codes.md');
let md = `# GrowStreams Quest Invite Codes\n\n`;
md += `**Generated:** ${new Date().toISOString()}\n`;
md += `**Total codes:** ${codeArray.length}\n\n`;
md += `## All Codes\n\n`;
md += '```\n';
md += codeArray.join('\n');
md += '\n```\n';

fs.writeFileSync(mdFile, md, 'utf-8');
console.log(`✅ Markdown written to: ${mdFile}`);

console.log(`\n📋 Summary:`);
console.log(`   - ${codeArray.length} unique codes generated`);
console.log(`   - SQL: ${sqlFile}`);
console.log(`   - MD:  ${mdFile}`);
console.log(`\nTo insert into database, run:`);
console.log(`   psql $DATABASE_URL -f ${sqlFile}`);

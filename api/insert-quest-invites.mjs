import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Read the 100 codes from txt file
const codes = readFileSync(join(__dirname, 'growstreams-codes.txt'), 'utf8')
  .split('\n').map(c => c.trim()).filter(Boolean);

console.log(`Inserting ${codes.length} codes into quest_invites...`);

let inserted = 0;
for (const code of codes) {
  const res = await client.query(
    `INSERT INTO quest_invites (code, created_by, max_uses, expires_at)
     VALUES ($1, 'SYSTEM', 1, NULL)
     ON CONFLICT (code) DO NOTHING`,
    [code]
  );
  if (res.rowCount > 0) inserted++;
}

console.log(`Inserted ${inserted} new codes, ${codes.length - inserted} already existed.`);

// Verify
const count = await client.query(`SELECT COUNT(*) as total, SUM(CASE WHEN current_uses < max_uses THEN 1 ELSE 0 END) as available FROM quest_invites`);
console.log('quest_invites stats:', count.rows[0]);

client.release();
await pool.end();

/**
 * One-time seed script: insert 1000 Ginie invite codes into ginie_invite_codes table.
 * Run with:  node api/seed-ginie-codes.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const codes = JSON.parse(readFileSync(join(__dirname, 'ginie-codes.json'), 'utf8'));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function seed() {
  const client = await pool.connect();
  try {
    let inserted = 0;
    let skipped = 0;
    for (const code of codes) {
      const res = await client.query(
        `INSERT INTO ginie_invite_codes (code) VALUES ($1) ON CONFLICT (code) DO NOTHING`,
        [code.trim()]
      );
      if (res.rowCount > 0) inserted++;
      else skipped++;
    }
    console.log(`[seed] Ginie codes: ${inserted} inserted, ${skipped} skipped (already existed)`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });

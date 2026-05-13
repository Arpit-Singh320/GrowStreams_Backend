import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

console.log('=== quest_campaigns (ALL) ===');
const r = await client.query(`SELECT id, slug, title, status, sort_order FROM quest_campaigns ORDER BY sort_order, created_at`);
console.log(r.rows);

client.release();
await pool.end();

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// All campaigns regardless of status or slug
const all = await client.query(`SELECT id, slug, title, status, sort_order, partner, reward_summary FROM quest_campaigns ORDER BY created_at DESC`);
console.log('ALL quest_campaigns:');
all.rows.forEach(r => console.log(r));

client.release();
await pool.end();

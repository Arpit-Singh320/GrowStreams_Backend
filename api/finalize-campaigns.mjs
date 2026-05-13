import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Check what's in growstreams-m1-launch
const m1 = await client.query(`SELECT slug, title, status, meta FROM quest_campaigns WHERE slug = 'growstreams-m1-launch'`);
console.log('M1 campaign:', m1.rows[0]);

// Also check any ACTIVE ones right now
const active = await client.query(`SELECT slug, title, status FROM quest_campaigns WHERE status = 'ACTIVE'`);
console.log('Currently ACTIVE:', active.rows);

const ended = await client.query(`SELECT slug, title, status FROM quest_campaigns WHERE status = 'ENDED'`);
console.log('Currently ENDED:', ended.rows);

client.release();
await pool.end();

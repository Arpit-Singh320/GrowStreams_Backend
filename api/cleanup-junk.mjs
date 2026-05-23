import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Delete junk campaigns (empty slug, 'check', 'growstreams-mainnet-program', 'growstreams-m1-launch')
const junk = ['', 'check', 'growstreams-mainnet-program', 'growstreams-m1-launch'];
await client.query(`DELETE FROM quests WHERE campaign_id IN (SELECT id FROM quest_campaigns WHERE slug = ANY($1))`, [junk]);
const del = await client.query(`DELETE FROM quest_campaigns WHERE slug = ANY($1) RETURNING slug, title`, [junk]);
console.log('Deleted junk:', del.rows);

const remaining = await client.query(`SELECT slug, title, status FROM quest_campaigns ORDER BY sort_order`);
console.log('\nFinal campaigns:', remaining.rows);

client.release();
await pool.end();

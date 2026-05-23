import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

const q = await client.query(`SELECT id, slug, seeds_reward, active, quest_type FROM quests WHERE slug = 'welcome-bonus'`);
console.log('welcome-bonus quest:', q.rows[0] || 'NOT FOUND');

// Also check all WELCOME type quests
const all = await client.query(`SELECT id, slug, seeds_reward, active, quest_type FROM quests WHERE quest_type = 'WELCOME'`);
console.log('\nAll WELCOME quests:', all.rows);

client.release();
await pool.end();

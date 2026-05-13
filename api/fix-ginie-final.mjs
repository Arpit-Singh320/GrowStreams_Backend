import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Get full details of growstreams-m1-launch
const m1 = await client.query(`SELECT * FROM quest_campaigns WHERE slug = 'growstreams-m1-launch'`);
console.log('growstreams-m1-launch full:', JSON.stringify(m1.rows[0], null, 2));

client.release();
await pool.end();

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const client = await pool.connect();

// Move to ENDED (past campaigns)
await client.query(`
  UPDATE quest_campaigns
  SET status = 'ENDED'
  WHERE slug IN ('ginie-x-growstreams', 'growstreams')
`);

// Ensure only the two Ginie ones are ACTIVE
await client.query(`
  UPDATE quest_campaigns
  SET status = 'ACTIVE'
  WHERE slug IN ('ginie-invite-giveaway', 'ginie')
`);

// Verify
const rows = await client.query(`SELECT slug, status, title FROM quest_campaigns ORDER BY sort_order`);
console.log(rows.rows);

client.release();
await pool.end();

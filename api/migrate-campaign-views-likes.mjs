import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

await client.query(`
  ALTER TABLE quest_campaigns
    ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS likes INTEGER NOT NULL DEFAULT 0;
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS campaign_likes (
    wallet TEXT NOT NULL,
    campaign_slug TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (wallet, campaign_slug)
  );
`);

console.log('✅ Migration done: views/likes added to quest_campaigns, campaign_likes table created');
client.release();
await pool.end();

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

const slugs = ['ginie-x-growstreams', 'growstreams'];

// Delete quests belonging to these campaigns
const deleted_quests = await client.query(`
  DELETE FROM quests WHERE campaign_id IN (
    SELECT id FROM quest_campaigns WHERE slug = ANY($1)
  ) RETURNING slug
`, [slugs]);
console.log('Deleted quests:', deleted_quests.rows.map(r => r.slug));

// Delete the campaigns themselves
const deleted_campaigns = await client.query(`
  DELETE FROM quest_campaigns WHERE slug = ANY($1) RETURNING slug, title
`, [slugs]);
console.log('Deleted campaigns:', deleted_campaigns.rows);

// Verify remaining
const remaining = await client.query(`SELECT slug, title, status FROM quest_campaigns ORDER BY sort_order`);
console.log('\nRemaining campaigns:', remaining.rows);

client.release();
await pool.end();

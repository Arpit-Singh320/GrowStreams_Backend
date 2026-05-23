import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const { rows } = await pool.query(`
  SELECT q.slug, q.quest_type, q.active, q.seeds_reward, q.meta
  FROM quests q
  JOIN quest_campaigns qc ON q.campaign_id = qc.id
  WHERE qc.slug LIKE '%1mb%'
  ORDER BY q.sort_order
`);
console.log(JSON.stringify(rows, null, 2));

// Also check what campaigns have '1mb' in their slug
const camps = await pool.query(`SELECT slug, title, status FROM quest_campaigns WHERE slug LIKE '%1mb%'`);
console.log('\nCampaigns:', JSON.stringify(camps.rows, null, 2));

await pool.end();

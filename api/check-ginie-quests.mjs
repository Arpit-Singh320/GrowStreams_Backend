import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// All active quests grouped by campaign
const quests = await client.query(`
  SELECT q.slug, q.title, q.quest_type, q.active, qc.slug as campaign_slug, qc.title as campaign_title
  FROM quests q
  LEFT JOIN quest_campaigns qc ON qc.id = q.campaign_id
  WHERE q.active = TRUE
  ORDER BY qc.slug, q.sort_order
`);
console.log('Active quests:');
quests.rows.forEach(r => console.log(`  [${r.campaign_slug || 'NO CAMPAIGN'}] ${r.slug} (${r.quest_type})`));

// Check the 'ginie' campaign
const ginie = await client.query(`SELECT id FROM quest_campaigns WHERE slug = 'ginie'`);
console.log('\nGinie campaign id:', ginie.rows[0]?.id);
console.log('Quest count for ginie campaign:', (await client.query(`SELECT COUNT(*) as cnt FROM quests WHERE campaign_id = $1 AND active = TRUE`, [ginie.rows[0]?.id])).rows[0]);

client.release();
await pool.end();

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Get the ginie campaign id
const ginieRow = await client.query(`SELECT id FROM quest_campaigns WHERE slug = 'ginie'`);
const ginieId = ginieRow.rows[0]?.id;
if (!ginieId) { console.error('ginie campaign not found'); process.exit(1); }
console.log('Ginie campaign id:', ginieId);

// Move the 5 quests from growstreams-m1-launch to ginie
const m1Row = await client.query(`SELECT id FROM quest_campaigns WHERE slug = 'growstreams-m1-launch'`);
const m1Id = m1Row.rows[0]?.id;

const moved = await client.query(
  `UPDATE quests SET campaign_id = $1 WHERE campaign_id = $2 RETURNING slug, title`,
  [ginieId, m1Id]
);
console.log('Moved quests to ginie:', moved.rows.map(r => r.slug));

// Set growstreams-m1-launch to ENDED (it's now empty)
await client.query(`UPDATE quest_campaigns SET status = 'ENDED' WHERE slug = 'growstreams-m1-launch'`);
console.log('growstreams-m1-launch → ENDED');

// Also update the ginie campaign metadata to match what was shown
await client.query(`
  UPDATE quest_campaigns SET
    description = 'Build with Ginie on GrowStreams & Win from a 100,000 VARA Reward Pool 🚀 Complete all tasks, earn Seeds, and compete for 100,000 VARA tokens. Top 5 users on the leaderboard win. Prizes distributed via Telegram after campaign ends.',
    reward_summary = 'Total rewards 100,000 VARA Tokens',
    difficulty = 'MEDIUM',
    partner = 'Ginie',
    badge_label = 'Ginie Pioneer',
    bonus_xp = 50,
    sort_order = 2,
    meta = '{"color": "#f59e0b", "accent": "#fbbf24", "token": "SEEDS", "partner_url": "https://ginie.xyz", "logo_url": "/ginie-logo.ico"}'
  WHERE slug = 'ginie'
`);

// Final state
const all = await client.query(`SELECT slug, title, status FROM quest_campaigns ORDER BY sort_order`);
console.log('\nFinal campaign state:');
all.rows.forEach(r => console.log(`  [${r.status}] ${r.slug} — ${r.title}`));

const questCheck = await client.query(`
  SELECT q.slug, qc.slug as campaign FROM quests q
  LEFT JOIN quest_campaigns qc ON qc.id = q.campaign_id
  WHERE q.active = TRUE ORDER BY qc.slug, q.sort_order
`);
console.log('\nFinal quest assignments:');
questCheck.rows.forEach(r => console.log(`  [${r.campaign || 'none'}] ${r.slug}`));

client.release();
await pool.end();

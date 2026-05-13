import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Upsert the standalone "Ginie" campaign
await client.query(`
  INSERT INTO quest_campaigns (slug, title, description, partner, badge_label, difficulty, status, reward_summary, bonus_xp, sort_order, meta)
  VALUES (
    'ginie',
    'Ginie',
    'Build with Ginie on GrowStreams & Win from a 100,000 VARA Reward Pool 🚀',
    'Ginie',
    'Ginie Pioneer',
    'MEDIUM',
    'ACTIVE',
    'Total rewards 100,00 VARA Tokens',
    50,
    1,
    '{"color": "#f59e0b", "accent": "#fbbf24", "token": "SEEDS", "partner_url": "https://ginie.xyz", "logo_url": "/ginie-logo.ico"}'
  )
  ON CONFLICT (slug) DO UPDATE SET
    status = 'ACTIVE',
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    reward_summary = EXCLUDED.reward_summary,
    meta = EXCLUDED.meta;
`);

console.log('Ginie campaign upserted');

const all = await client.query(`SELECT slug, title, status FROM quest_campaigns ORDER BY sort_order`);
console.log('All campaigns:', all.rows);

client.release();
await pool.end();

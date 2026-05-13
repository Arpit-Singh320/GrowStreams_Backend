/**
 * One-time: seed the Ginie invite giveaway campaign + quests into production DB.
 */
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

// 1. Ensure ginie_invite_codes table exists
await client.query(`
  CREATE TABLE IF NOT EXISTS ginie_invite_codes (
    id          SERIAL PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,
    claimed_by  TEXT,
    claimed_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_ginie_invite_codes_claimed ON ginie_invite_codes(claimed_by);
`);
console.log('[1] ginie_invite_codes table OK');

// 2. Upsert the campaign
await client.query(`
  INSERT INTO quest_campaigns (slug, title, description, partner, banner_url, badge_label, difficulty, status, reward_summary, bonus_xp, sort_order, meta)
  VALUES (
    'ginie-invite-giveaway',
    'GINIE Invite Codes Giveaway',
    'Complete both quests to unlock an exclusive Ginie invite code. Ginie is the AI-powered development environment that generates production-ready DAML smart contracts and deploys them to Canton — all from plain English.',
    'Ginie',
    '/ginie-banner.png',
    'Ginie Access',
    'EASY',
    'ACTIVE',
    'Earn 100 XP + unlock a Ginie invite code',
    0,
    -1,
    '{"color": "#10b981", "accent": "#34d399", "token": "SEEDS", "partner_url": "https://ginie.xyz", "logo_url": "/ginie-logo.ico", "reward_type": "invite_code", "reward_partner": "Ginie", "telegram_url": "https://t.me/+ol0aeN9HO05mMjQ9"}'
  )
  ON CONFLICT (slug) DO UPDATE SET
    title          = EXCLUDED.title,
    description    = EXCLUDED.description,
    banner_url     = EXCLUDED.banner_url,
    reward_summary = EXCLUDED.reward_summary,
    status         = EXCLUDED.status,
    meta           = EXCLUDED.meta;
`);
console.log('[2] Campaign upserted');

// 3. Upsert the 2 quests
const campaignRow = await client.query(`SELECT id FROM quest_campaigns WHERE slug = 'ginie-invite-giveaway'`);
const campaignId = campaignRow.rows[0].id;

await client.query(`
  INSERT INTO quests (slug, title, description, quest_type, seeds_reward, icon, repeatable, active, sort_order, campaign_id, meta)
  VALUES
    (
      'ginie-welcome',
      'Join the Ginie × GrowStreams Giveaway',
      'Welcome to the Ginie Invite Code Giveaway! You automatically receive 100 XP for joining this special campaign. Complete this + the Telegram quest to unlock your Ginie invite code.',
      'WELCOME',
      100,
      'gift',
      FALSE,
      TRUE,
      0,
      $1,
      '{}'
    ),
    (
      'ginie-join-telegram',
      'Join the Ginie Telegram Group',
      'Join the official Ginie Telegram community to stay updated on the latest AI-powered smart contract development tools and the Canton ecosystem.',
      'TELEGRAM_JOIN',
      0,
      'send',
      FALSE,
      TRUE,
      1,
      $1,
      '{"url": "https://t.me/+ol0aeN9HO05mMjQ9"}'
    )
  ON CONFLICT (slug) DO UPDATE SET
    title        = EXCLUDED.title,
    description  = EXCLUDED.description,
    quest_type   = EXCLUDED.quest_type,
    seeds_reward = EXCLUDED.seeds_reward,
    icon         = EXCLUDED.icon,
    sort_order   = EXCLUDED.sort_order,
    campaign_id  = EXCLUDED.campaign_id,
    meta         = EXCLUDED.meta;
`, [campaignId]);
console.log('[3] Quests upserted');

// 4. Verify
const check = await client.query(`SELECT id, slug, active, quest_type FROM quests WHERE slug IN ('ginie-welcome','ginie-join-telegram')`);
console.log('[4] Quests in DB:', check.rows);

client.release();
await pool.end();
console.log('Done.');

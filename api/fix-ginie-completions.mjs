/**
 * For any quest_registrations wallet that does NOT yet have ginie-welcome or
 * ginie-join-telegram completions, backfill them.
 * Run once after seeding the quests.
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

// Get quest IDs
const q = await client.query(`SELECT id, slug FROM quests WHERE slug IN ('ginie-welcome','ginie-join-telegram')`);
const welcomeId = q.rows.find(r => r.slug === 'ginie-welcome')?.id;
const telegramId = q.rows.find(r => r.slug === 'ginie-join-telegram')?.id;
if (!welcomeId || !telegramId) { console.error('Quests not found!'); process.exit(1); }
console.log(`Welcome quest id=${welcomeId}, Telegram quest id=${telegramId}`);

// Check how many completions exist already
const existing = await client.query(`
  SELECT COUNT(*) as cnt FROM quest_completions
  WHERE quest_id IN ($1, $2)`, [welcomeId, telegramId]);
console.log(`Existing completions for these quests: ${existing.rows[0].cnt}`);

// No backfill needed yet — future users get awarded via campaignJoin route.
// Just show any registrations that might need the award.
const registrations = await client.query(`SELECT wallet FROM quest_registrations LIMIT 5`);
console.log('Sample registered wallets:', registrations.rows.map(r => r.wallet));

client.release();
await pool.end();

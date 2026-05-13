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

console.log('=== ginie_invite_codes ===');
const codes = await client.query(`SELECT COUNT(*) as total, COUNT(claimed_by) as claimed FROM ginie_invite_codes`);
console.log(codes.rows[0]);

console.log('\n=== ginie quest completions ===');
const comps = await client.query(`
  SELECT qc.wallet, q.slug, qc.status, qc.created_at
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  WHERE q.slug IN ('ginie-welcome','ginie-join-telegram')
  ORDER BY qc.created_at DESC
  LIMIT 20
`);
console.log(comps.rows);

console.log('\n=== ginie quests exist? ===');
const quests = await client.query(`SELECT id, slug, active, quest_type, seeds_reward FROM quests WHERE slug IN ('ginie-welcome','ginie-join-telegram')`);
console.log(quests.rows);

client.release();
await pool.end();

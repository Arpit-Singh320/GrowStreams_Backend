import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Check any PENDING completions for VISIT_URL or TELEGRAM_JOIN quests
const { rows } = await pool.query(`
  SELECT qc.id, qc.wallet, qc.status, qc.proof, qc.created_at, q.slug, q.quest_type
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  WHERE q.quest_type IN ('VISIT_URL', 'TELEGRAM_JOIN')
    AND qc.status = 'PENDING'
  ORDER BY qc.created_at DESC
  LIMIT 20
`);
console.log('PENDING VISIT_URL/TELEGRAM_JOIN completions:', rows.length);
console.log(JSON.stringify(rows, null, 2));

// Also check the /me endpoint structure — what does pendingSubmission look like
const { rows: sample } = await pool.query(`
  SELECT qc.id, qc.wallet, qc.status, qc.seeds_awarded, q.slug, q.quest_type
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  WHERE q.slug = 'explore-the-extension'
  ORDER BY qc.created_at DESC
  LIMIT 5
`);
console.log('\nRecent explore-the-extension completions:', JSON.stringify(sample, null, 2));

// Check the join-telegram quest completions across ALL campaigns
const { rows: tgPending } = await pool.query(`
  SELECT qc.id, qc.wallet, qc.status, q.slug, q.quest_type, qc.created_at
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  WHERE q.quest_type = 'TELEGRAM_JOIN'
    AND qc.status = 'PENDING'
  ORDER BY qc.created_at DESC
  LIMIT 10
`);
console.log('\nPENDING TELEGRAM_JOIN:', JSON.stringify(tgPending, null, 2));

await pool.end();

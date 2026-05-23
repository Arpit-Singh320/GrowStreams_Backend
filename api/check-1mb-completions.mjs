import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Check recent completions/attempts for the explore-the-extension quest
const { rows } = await pool.query(`
  SELECT qc.id, qc.wallet, qc.status, qc.proof, qc.seeds_awarded, qc.tx_hash, qc.created_at
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  WHERE q.slug = 'explore-the-extension'
  ORDER BY qc.created_at DESC
  LIMIT 20
`);
console.log('explore-the-extension completions:', JSON.stringify(rows, null, 2));

// Check if there are any PENDING submissions stuck
const { rows: pending } = await pool.query(`
  SELECT qc.id, qc.wallet, qc.status, qc.proof, qc.created_at, q.slug, q.quest_type
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  JOIN quest_campaigns qc2 ON q.campaign_id = qc2.id
  WHERE qc2.slug = '1mb-install-browse-earn-pay'
    AND qc.status = 'PENDING'
  ORDER BY qc.created_at DESC
  LIMIT 20
`);
console.log('\nPENDING completions in 1MB campaign:', JSON.stringify(pending, null, 2));

await pool.end();

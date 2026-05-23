import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

const { rows } = await client.query(`
  SELECT qc.id, qc.wallet, qc.seeds_awarded, qc.verified_at, q.slug, qc.tx_hash
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  WHERE qc.status = 'VERIFIED' AND qc.tx_hash IS NULL
  ORDER BY qc.verified_at DESC
  LIMIT 20
`);

console.log(`\nVERIFIED completions with no tx_hash: ${rows.length}\n`);
rows.forEach(r => {
  console.log(`  #${r.id} | ${r.slug} | ${r.seeds_awarded} XP | wallet=${r.wallet.slice(0,18)}... | verified=${r.verified_at}`);
});

client.release();
await pool.end();

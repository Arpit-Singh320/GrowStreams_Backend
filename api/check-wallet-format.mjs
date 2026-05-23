import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Check a sample explore-the-extension completion wallet format
const { rows } = await pool.query(`
  SELECT DISTINCT qc.wallet, LENGTH(qc.wallet) as len
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  WHERE q.slug = 'explore-the-extension'
  LIMIT 5
`);
console.log('Wallet formats:', JSON.stringify(rows, null, 2));

// Check registrations for EVM wallets
const { rows: regs } = await pool.query(`
  SELECT wallet, evm_address, wallet_type, LENGTH(wallet) as wlen
  FROM quest_registrations
  WHERE wallet LIKE '0x%'
  LIMIT 5
`);
console.log('\nEVM registrations:', JSON.stringify(regs, null, 2));

// Check what wallet format the user in the screenshot has (recent failed attempts)
const { rows: recent } = await pool.query(`
  SELECT qc.wallet, LENGTH(qc.wallet) as wlen, qc.status, q.slug, q.quest_type
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  WHERE q.slug = 'explore-the-extension' AND qc.status != 'VERIFIED'
  ORDER BY qc.created_at DESC LIMIT 5
`);
console.log('\nRecent non-verified explore attempts:', JSON.stringify(recent, null, 2));

await pool.end();

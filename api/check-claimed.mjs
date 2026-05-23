import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Check which code is claimed and by whom
const claimed = await client.query(`SELECT id, code, claimed_by FROM ginie_invite_codes WHERE claimed_by IS NOT NULL`);
console.log('Claimed codes:', claimed.rows);

// Check quest_registrations to see wallet format
const regs = await client.query(`SELECT wallet, evm_address FROM quest_registrations LIMIT 5`);
console.log('\nSample registrations (wallet format):');
regs.rows.forEach(r => console.log(`  wallet=${r.wallet}  evm=${r.evm_address}`));

client.release();
await pool.end();

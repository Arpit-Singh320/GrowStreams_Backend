import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const TIMEOUT_MS = 60_000;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

console.log('Connecting to Vara...');
const { connect, getContract, getKeyring } = await import('./src/sails-client.mjs');
await connect();
console.log('Connected.\n');

const { decodeAddress } = await import('@polkadot/util-crypto');
const keyring = getKeyring();
const seedsContract = getContract('questSeeds');
if (!seedsContract) { console.error('questSeeds not loaded'); process.exit(1); }

const { rows: pending } = await client.query(`
  SELECT qc.id, qc.wallet, qc.seeds_awarded, qc.quest_id, q.slug
  FROM quest_completions qc
  JOIN quests q ON q.id = qc.quest_id
  WHERE qc.status = 'VERIFIED' AND qc.tx_hash IS NULL AND qc.seeds_awarded > 0
  ORDER BY qc.id ASC
`);

console.log(`Found ${pending.length} completions missing tx_hash\n`);
if (pending.length === 0) { client.release(); await pool.end(); process.exit(0); }

let succeeded = 0;
let failed = 0;

// Mint one at a time directly — no serialCommand queue, with timeout
for (const row of pending) {
  try {
    let walletHex = row.wallet;
    if (!row.wallet.startsWith('0x')) {
      walletHex = '0x' + Buffer.from(decodeAddress(row.wallet)).toString('hex');
    }

    console.log(`Minting ${row.seeds_awarded} XP → #${row.id} (${row.slug})`);

    const service = seedsContract.services['SeedsService'];
    const fn = service.functions['Mint'];
    const tx = fn(walletHex, row.seeds_awarded, `quest:${row.slug}`);
    tx.withAccount(keyring);
    tx.withGas(50_000_000_000n);

    const { blockHash } = await Promise.race([
      tx.signAndSend(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
    ]);

    await client.query(`UPDATE quest_completions SET tx_hash = $1 WHERE id = $2`, [blockHash, row.id]);
    await client.query(
      `UPDATE seeds_ledger SET tx_hash = $1 WHERE quest_id = $2 AND wallet = $3 AND tx_hash IS NULL`,
      [blockHash, row.quest_id, row.wallet]
    );

    console.log(`   ✅ tx=${blockHash}`);
    succeeded++;
  } catch (err) {
    console.error(`   ❌ #${row.id}: ${err.message}`);
    failed++;
  }
  // Small delay to avoid nonce collisions on Vara mainnet
  await new Promise(r => setTimeout(r, 1000));
}

console.log(`\n=== Done: ${succeeded} minted, ${failed} failed ===`);
client.release();
await pool.end();
process.exit(0);

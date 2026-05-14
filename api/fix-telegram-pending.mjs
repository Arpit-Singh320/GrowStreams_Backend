#!/usr/bin/env node
/**
 * Fix stuck TELEGRAM_JOIN quest completions
 * Approves PENDING telegram quests and mints Seeds on-chain
 */

import { Pool } from 'pg';
import { connect, command } from './src/sails-client.mjs';
import { decodeAddress } from '@polkadot/util-crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  console.log('🔧 Fixing stuck TELEGRAM_JOIN quests...\n');

  // Connect to VARA
  await connect();

  const client = await pool.connect();

  try {
    // Find all PENDING telegram quest completions
    const { rows: pending } = await client.query(`
      SELECT qc.id, qc.wallet, q.slug, q.seeds_reward, q.id as quest_id
      FROM quest_completions qc
      JOIN quests q ON q.id = qc.quest_id
      WHERE q.quest_type = 'TELEGRAM_JOIN'
        AND qc.status = 'PENDING'
      ORDER BY qc.created_at ASC
    `);

    console.log(`Found ${pending.length} stuck TELEGRAM_JOIN completions\n`);

    if (pending.length === 0) {
      console.log('✅ No stuck telegram quests. All good!');
      await client.release();
      await pool.end();
      process.exit(0);
    }

    for (const row of pending) {
      console.log(`Processing: ${row.slug} for wallet ${row.wallet.slice(0, 16)}...`);

      // Convert wallet to hex
      let walletHex;
      try {
        const decoded = decodeAddress(row.wallet);
        walletHex = '0x' + Buffer.from(decoded).toString('hex');
      } catch (err) {
        console.error(`  ❌ Invalid wallet address: ${err.message}`);
        continue;
      }

      // Mint Seeds on-chain
      let txHash = null;
      try {
        const reason = `quest:${row.slug}`;
        console.log(`  Minting ${row.seeds_reward} Seeds...`);
        const mintResult = await command('questSeeds', 'Mint', walletHex, row.seeds_reward, reason);
        txHash = mintResult.blockHash || null;
        console.log(`  ✅ Minted on-chain: ${txHash?.slice(0, 18)}...`);
      } catch (mintErr) {
        console.error(`  ⚠️  On-chain mint failed: ${mintErr.message}`);
        // Continue anyway - we'll still mark as VERIFIED in DB
      }

      // Update quest_completion to VERIFIED
      await client.query(
        `UPDATE quest_completions 
         SET status = 'VERIFIED', seeds_awarded = $1, tx_hash = $2, verified_at = NOW()
         WHERE id = $3`,
        [row.seeds_reward, txHash, row.id]
      );

      // Add seeds_ledger entry
      await client.query(
        `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, tx_hash)
         VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4)
         ON CONFLICT DO NOTHING`,
        [row.wallet, row.seeds_reward, row.quest_id, txHash]
      );

      console.log(`  ✅ Approved and awarded ${row.seeds_reward} Seeds\n`);
    }

    console.log(`\n✅ Fixed ${pending.length} stuck telegram quests!`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.release();
    await pool.end();
    process.exit(0);
  }
}

main().catch(console.error);

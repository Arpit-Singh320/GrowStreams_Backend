#!/usr/bin/env node
/**
 * Fix: find all wallets that have created a stream but haven't gotten create-stream XP
 * and award them now.
 */

import pg from 'pg';
import { decodeAddress } from '@polkadot/util-crypto';

const DATABASE_URL = "postgresql://postgres:JJkrrCeNxQssiXnkbnfGnCGPQMtyZaoY@caboose.proxy.rlwy.net:58044/railway";
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

function walletToHex(wallet) {
  try {
    if (wallet.startsWith('0x') && wallet.length === 66) return wallet.toLowerCase();
    const pub = decodeAddress(wallet);
    return '0x' + Buffer.from(pub).toString('hex');
  } catch { return null; }
}

async function main() {
  console.log('🔍 Finding wallets with streams but no create-stream XP...\n');

  // First: clear all stale PENDING create-stream completions
  const cleared = await pool.query(`
    DELETE FROM quest_completions qc
    USING quests q
    WHERE q.id = qc.quest_id AND q.slug = 'create-stream'
      AND qc.status = 'PENDING'
    RETURNING qc.wallet
  `);
  console.log(`🧹 Cleared ${cleared.rows.length} stale PENDING completions`);

  // Get quest info
  const questRes = await pool.query(`SELECT id, seeds_reward FROM quests WHERE slug = 'create-stream' LIMIT 1`);
  if (!questRes.rows.length) { console.error('Quest not found!'); process.exit(1); }
  const { id: questId, seeds_reward: seedsReward } = questRes.rows[0];
  console.log(`📋 Quest ID=${questId}, reward=${seedsReward} XP\n`);

  // Get season
  const seasonRes = await pool.query(`SELECT id FROM seasons WHERE status = 'ACTIVE' LIMIT 1`);
  const seasonId = seasonRes.rows[0]?.id || null;

  // Get all registered wallets
  const users = await pool.query(`SELECT wallet FROM quest_registrations`);
  console.log(`👥 Total registered users: ${users.rows.length}`);

  let awarded = 0;
  let alreadyDone = 0;
  let noStream = 0;

  for (const { wallet } of users.rows) {
    const hexPubkey = walletToHex(wallet);
    if (!hexPubkey) continue;

    // Check if already VERIFIED
    const existing = await pool.query(`
      SELECT id FROM quest_completions
      WHERE wallet = $1 AND quest_id = $2 AND status = 'VERIFIED'
      LIMIT 1
    `, [wallet, questId]);
    if (existing.rows.length) { alreadyDone++; continue; }

    // Check stream_events DB
    const stream = await pool.query(`
      SELECT id, stream_id FROM stream_events
      WHERE LOWER(sender) = $1 AND event_type = 'created'
      LIMIT 1
    `, [hexPubkey.toLowerCase()]);

    if (!stream.rows.length) { noStream++; continue; }

    // Award!
    await pool.query(`
      INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded, verified_at, season_id)
      VALUES ($1, $2, 'VERIFIED', $3, $4, NOW(), $5)
      ON CONFLICT DO NOTHING
    `, [wallet, questId, JSON.stringify({ source: 'auto-fix', stream_id: String(stream.rows[0].stream_id) }), seedsReward, seasonId]);

    await pool.query(`
      INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, season_id)
      VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4)
      ON CONFLICT DO NOTHING
    `, [wallet, seedsReward, questId, seasonId]);

    console.log(`✅ Awarded ${seedsReward} XP → ${wallet} (stream_id=${stream.rows[0].stream_id})`);
    awarded++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Newly awarded: ${awarded}`);
  console.log(`   ⏭️  Already done: ${alreadyDone}`);
  console.log(`   ❌ No stream found: ${noStream}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * Backfill: manually award 'create-a-streams' campaign quest to any wallet
 * that has a stream in stream_events but hasn't received XP yet.
 * Usage: node api/backfill-stream-quest.mjs [wallet]  (omit wallet to process all)
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

async function awardStreamQuest(wallet, questId, seedsReward, seasonId) {
  const hexPubkey = walletToHex(wallet);
  if (!hexPubkey) { console.warn(`  ⚠️  Cannot decode wallet: ${wallet}`); return false; }

  // Check stream exists
  const stream = await pool.query(
    `SELECT id, stream_id FROM stream_events WHERE LOWER(sender) = $1 AND event_type = 'created' LIMIT 1`,
    [hexPubkey.toLowerCase()]
  );
  if (!stream.rows.length) {
    console.log(`  ❌ No stream found for ${wallet}`);
    return false;
  }

  // Check already awarded
  const existing = await pool.query(
    `SELECT id FROM quest_completions WHERE wallet = $1 AND quest_id = $2 AND status = 'VERIFIED' LIMIT 1`,
    [wallet, questId]
  );
  if (existing.rows.length) {
    console.log(`  ⏭️  Already awarded for ${wallet}`);
    return false;
  }

  await pool.query(
    `INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded, verified_at, season_id)
     VALUES ($1, $2, 'VERIFIED', $3, $4, NOW(), $5) ON CONFLICT DO NOTHING`,
    [wallet, questId, JSON.stringify({ source: 'backfill', stream_id: String(stream.rows[0].stream_id) }), seedsReward, seasonId]
  );
  await pool.query(
    `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, season_id)
     VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4) ON CONFLICT DO NOTHING`,
    [wallet, seedsReward, questId, seasonId]
  );
  console.log(`  ✅ Awarded ${seedsReward} XP → ${wallet} (stream_id=${stream.rows[0].stream_id})`);
  return true;
}

async function main() {
  const targetWallet = process.argv[2];

  // Get all ONCHAIN_STREAM quests
  const quests = await pool.query(
    `SELECT id, slug, seeds_reward FROM quests WHERE quest_type = 'ONCHAIN_STREAM' AND active = TRUE`
  );
  console.log(`\n📋 Active ONCHAIN_STREAM quests: ${quests.rows.map(q => `"${q.slug}" (${q.seeds_reward} XP)`).join(', ')}`);

  const seasonRes = await pool.query(`SELECT id FROM seasons WHERE status = 'ACTIVE' LIMIT 1`);
  const seasonId = seasonRes.rows[0]?.id || null;

  let totalAwarded = 0;

  for (const quest of quests.rows) {
    console.log(`\n🔍 Processing quest: "${quest.slug}" (${quest.seeds_reward} XP)`);

    const wallets = targetWallet
      ? [{ wallet: targetWallet }]
      : (await pool.query(`SELECT wallet FROM quest_registrations`)).rows;

    for (const { wallet } of wallets) {
      const awarded = await awardStreamQuest(wallet, quest.id, quest.seeds_reward, seasonId);
      if (awarded) totalAwarded++;
    }
  }

  console.log(`\n📊 Total newly awarded: ${totalAwarded}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

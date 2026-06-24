#!/usr/bin/env node
/**
 * Debug: check quest status and stream_events for a wallet
 * Usage: node api/debug-quest.mjs <wallet>
 */

import pg from 'pg';

const DATABASE_URL = "postgresql://postgres:JJkrrCeNxQssiXnkbnfGnCGPQMtyZaoY@caboose.proxy.rlwy.net:58044/railway";

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const wallet = process.argv[2];
  if (!wallet) {
    // Show all PENDING create-stream completions
    const pending = await pool.query(`
      SELECT qc.id, qc.wallet, qc.status, qc.created_at, qc.proof
      FROM quest_completions qc
      JOIN quests q ON q.id = qc.quest_id
      WHERE q.slug = 'create-stream' AND qc.status = 'PENDING'
      ORDER BY qc.created_at DESC
      LIMIT 20
    `);
    console.log(`\n📋 PENDING 'create-stream' completions: ${pending.rows.length}`);
    for (const r of pending.rows) {
      console.log(`  - wallet: ${r.wallet}`);
      console.log(`    status: ${r.status}, created: ${r.created_at}`);
    }

    // Also show recent stream_events
    const events = await pool.query(`
      SELECT id, sender, event_type, created_at, stream_id
      FROM stream_events
      WHERE event_type = 'created'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log(`\n📊 Recent 'created' stream_events: ${events.rows.length}`);
    for (const e of events.rows) {
      console.log(`  stream_id=${e.stream_id}, sender=${e.sender}, at=${e.created_at}`);
    }
    await pool.end();
    return;
  }

  // Convert SS58 to hex
  let hexPubkey = wallet;
  if (!wallet.startsWith('0x')) {
    const { decodeAddress } = await import('@polkadot/util-crypto');
    const pub = decodeAddress(wallet);
    hexPubkey = '0x' + Buffer.from(pub).toString('hex');
  }
  console.log(`\n🔍 Checking wallet: ${wallet}`);
  console.log(`   hex pubkey: ${hexPubkey}`);

  // Check quest completion status
  const completions = await pool.query(`
    SELECT qc.id, qc.status, qc.created_at, qc.proof, qc.seeds_awarded
    FROM quest_completions qc
    JOIN quests q ON q.id = qc.quest_id
    WHERE q.slug = 'create-stream' AND qc.wallet = $1
    ORDER BY qc.created_at DESC
  `, [wallet]);
  console.log(`\n📋 Quest completions for 'create-stream': ${completions.rows.length}`);
  for (const c of completions.rows) {
    console.log(`  status=${c.status}, seeds=${c.seeds_awarded}, created=${c.created_at}`);
  }

  // Check stream_events
  const streams = await pool.query(`
    SELECT id, stream_id, event_type, created_at
    FROM stream_events
    WHERE LOWER(sender) = $1 AND event_type = 'created'
    LIMIT 5
  `, [hexPubkey.toLowerCase()]);
  console.log(`\n📊 stream_events for this wallet: ${streams.rows.length}`);
  for (const s of streams.rows) {
    console.log(`  stream_id=${s.stream_id}, at=${s.created_at}`);
  }

  // Force clear PENDING and award if stream exists
  if (streams.rows.length > 0 && completions.rows.some(c => c.status === 'PENDING')) {
    console.log('\n⚡ Stream exists but quest is PENDING — fixing now...');
    await pool.query(`
      DELETE FROM quest_completions qc
      USING quests q
      WHERE q.id = qc.quest_id AND q.slug = 'create-stream'
        AND qc.wallet = $1 AND qc.status = 'PENDING'
    `, [wallet]);

    const quest = await pool.query(`SELECT id, seeds_reward FROM quests WHERE slug = 'create-stream' LIMIT 1`);
    if (quest.rows.length) {
      const { id: questId, seeds_reward } = quest.rows[0];
      const season = await pool.query(`SELECT id FROM seasons WHERE is_active = true LIMIT 1`);
      const seasonId = season.rows[0]?.id || null;

      await pool.query(`
        INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded, verified_at, season_id)
        VALUES ($1, $2, 'VERIFIED', $3, $4, NOW(), $5)
        ON CONFLICT DO NOTHING
      `, [wallet, questId, JSON.stringify({ source: 'manual-fix', stream_id: streams.rows[0].stream_id }), seeds_reward, seasonId]);

      await pool.query(`
        INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, season_id)
        VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4)
        ON CONFLICT DO NOTHING
      `, [wallet, seeds_reward, questId, seasonId]);

      console.log(`✅ Quest VERIFIED! Awarded ${seeds_reward} XP to ${wallet}`);
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

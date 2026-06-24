#!/usr/bin/env node
import pg from 'pg';

const DATABASE_URL = "postgresql://postgres:JJkrrCeNxQssiXnkbnfGnCGPQMtyZaoY@caboose.proxy.rlwy.net:58044/railway";
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  // List all quests in the 'growstreams' campaign
  const res = await pool.query(`
    SELECT q.id, q.slug, q.title, q.quest_type, q.seeds_reward, q.active
    FROM quests q
    JOIN quest_campaigns c ON c.id = q.campaign_id
    WHERE c.slug = 'growstreams'
    ORDER BY q.sort_order
  `);
  console.log('\n📋 Quests in growStreams campaign:');
  for (const q of res.rows) {
    console.log(`  id=${q.id} slug="${q.slug}" type=${q.quest_type} reward=${q.seeds_reward} active=${q.active}`);
  }

  // Also check completions for the campaign quests for wallet containing UdgV
  const wallet = process.argv[2];
  if (wallet) {
    console.log(`\n📊 Completions for wallet ${wallet}:`);
    const completions = await pool.query(`
      SELECT qc.id, q.slug, qc.status, qc.seeds_awarded, qc.created_at
      FROM quest_completions qc
      JOIN quests q ON q.id = qc.quest_id
      WHERE qc.wallet = $1
      ORDER BY qc.created_at DESC
    `, [wallet]);
    for (const c of completions.rows) {
      console.log(`  slug="${c.slug}" status=${c.status} seeds=${c.seeds_awarded} at=${c.created_at}`);
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

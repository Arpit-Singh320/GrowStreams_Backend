/**
 * quest-evm-stream-monitor.mjs
 *
 * Polls the evm_streams table for PENDING rows and checks whether the
 * Vara.eth runtime has confirmed them (stream_id assigned on-chain via
 * the Mirror stateHash changing). Also awards ONCHAIN_STREAM_ETH quest
 * completions once a stream is confirmed ACTIVE.
 *
 * Runs every 10 minutes via cron.
 */

import { query as dbQuery, queryAll } from '../services/db.mjs';
import { checkStreamExists } from '../vara-eth-client.mjs';

const QUEST_SLUG = 'ONCHAIN_STREAM_ETH';

export async function runEvmStreamCheck() {
  // 1. Check pending evm_streams — mark ACTIVE if the sender has a stream confirmed
  let pending = [];
  try {
    pending = await queryAll(
      `SELECT * FROM evm_streams WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 50`
    );
  } catch (err) {
    console.warn('[evm-stream-monitor] DB query failed:', err.message);
    return;
  }

  for (const row of pending) {
    try {
      const exists = await checkStreamExists(row.sender);
      if (exists) {
        await dbQuery(
          `UPDATE evm_streams SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
        console.log(`[evm-stream-monitor] Stream id=${row.id} sender=${row.sender} marked ACTIVE`);

        // 2. Award ONCHAIN_STREAM_ETH quest if not already completed
        await awardEvmStreamQuest(row.sender);
      }
    } catch (err) {
      console.warn(`[evm-stream-monitor] Check failed for row id=${row.id}: ${err.message}`);
    }
  }
}

async function awardEvmStreamQuest(senderAddress) {
  try {
    // Find the ONCHAIN_STREAM_ETH quest
    const quest = await dbQuery(
      `SELECT id, seeds_reward FROM quests WHERE slug = $1 LIMIT 1`,
      [QUEST_SLUG]
    );
    if (!quest.rows.length) return;

    const { id: questId, seeds_reward: seedsReward } = quest.rows[0];

    // Check if already awarded for this wallet
    const existing = await dbQuery(
      `SELECT id FROM quest_completions
       WHERE wallet = $1 AND quest_id = $2 AND status = 'VERIFIED'
       LIMIT 1`,
      [senderAddress.toLowerCase(), questId]
    );
    if (existing.rows.length) return;

    // Insert completion
    await dbQuery(
      `INSERT INTO quest_completions (wallet, quest_id, status, seeds_awarded, proof, verified_at)
       VALUES ($1, $2, 'VERIFIED', $3, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [
        senderAddress.toLowerCase(),
        questId,
        seedsReward,
        JSON.stringify({ type: 'evm_stream', network: 'vara-eth-hoodi', verifiedBy: 'evm-stream-monitor' }),
      ]
    );

    // Insert seeds ledger entry
    await dbQuery(
      `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id)
       VALUES ($1, $2, 'QUEST_COMPLETE', $3)
       ON CONFLICT DO NOTHING`,
      [senderAddress.toLowerCase(), seedsReward, questId]
    );

    console.log(`[evm-stream-monitor] ONCHAIN_STREAM_ETH quest awarded to ${senderAddress} (${seedsReward} seeds)`);
  } catch (err) {
    console.warn(`[evm-stream-monitor] Quest award failed for ${senderAddress}: ${err.message}`);
  }
}

-- Fix stuck Telegram quest submissions
-- This script will approve all PENDING telegram quest completions

-- First, check what's stuck
SELECT 
  qc.id,
  qc.wallet,
  q.slug,
  q.quest_type,
  qc.status,
  qc.created_at
FROM quest_completions qc
JOIN quests q ON q.id = qc.quest_id
WHERE q.quest_type = 'TELEGRAM_JOIN'
  AND qc.status = 'PENDING'
ORDER BY qc.created_at DESC;

-- If you want to auto-approve them all, uncomment and run this:
/*
UPDATE quest_completions qc
SET 
  status = 'VERIFIED',
  seeds_awarded = q.seeds_reward,
  verified_at = NOW()
FROM quests q
WHERE qc.quest_id = q.id
  AND q.quest_type = 'TELEGRAM_JOIN'
  AND qc.status = 'PENDING';

-- Also add seeds_ledger entries for the approved quests
INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, tx_hash)
SELECT 
  qc.wallet,
  q.seeds_reward,
  'QUEST_COMPLETE',
  q.id,
  NULL
FROM quest_completions qc
JOIN quests q ON q.id = qc.quest_id
WHERE q.quest_type = 'TELEGRAM_JOIN'
  AND qc.status = 'VERIFIED'
  AND NOT EXISTS (
    SELECT 1 FROM seeds_ledger sl
    WHERE sl.wallet = qc.wallet AND sl.quest_id = q.id
  );
*/

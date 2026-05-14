# Fix: Telegram Quest Stuck in "Pending"

## Problem
The "Join Telegram Community" quest is stuck in "Pending" status instead of auto-approving immediately.

## Root Cause
The quest should be auto-approved (honor system), but something is preventing the auto-approval logic from running properly.

## Solution Applied

### 1. **Code Fixes** ✅
Updated `api/src/routes/quests.mjs`:
- Added logging to track when TELEGRAM_JOIN quests are claimed
- Added warning logs for unhandled quest types
- Ensured TELEGRAM_JOIN quests auto-approve immediately

### 2. **Fix Existing Stuck Quests**

Run this script to approve all currently stuck telegram quests:

```bash
cd api
node fix-telegram-pending.mjs
```

This will:
- Find all PENDING telegram quest completions
- Mint Seeds on-chain for each one
- Mark them as VERIFIED in the database
- Add seeds_ledger entries

### 3. **Verify the Fix**

After running the fix script, check:

```sql
-- Should return 0 rows
SELECT qc.id, qc.wallet, q.slug, qc.status
FROM quest_completions qc
JOIN quests q ON q.id = qc.quest_id
WHERE q.quest_type = 'TELEGRAM_JOIN'
  AND qc.status = 'PENDING';
```

### 4. **Test New Claims**

1. Have a user click "Open link" on the Telegram quest
2. Join the Telegram group
3. Click "Submit" or "Claim"
4. Should immediately show "Quest complete! 150 XP awarded" (or whatever the reward is)
5. Status should be "Verified" ✅, not "Pending" ⏳

## Monitoring

Check the API logs for these messages:
```
[quest-claim] Auto-approving TELEGRAM_JOIN quest: join-telegram for wallet 0x...
[quest-claim] Successfully awarded 150 Seeds for join-telegram
```

If you see:
```
[quest-claim] Unhandled quest type: TELEGRAM_JOIN for quest join-telegram
```

Then the quest_type in the database is wrong. Fix with:
```sql
UPDATE quests 
SET quest_type = 'TELEGRAM_JOIN' 
WHERE slug IN ('join-telegram', 'ginie-join-telegram', 'join-growstreams-telegram');
```

## Prevention

The code now has better logging, so if this happens again:
1. Check API logs for the quest claim attempt
2. Look for the quest_type being logged
3. Verify it matches 'TELEGRAM_JOIN' exactly

## Files Changed
- ✅ `api/src/routes/quests.mjs` - Added logging and ensured auto-approval
- ✅ `api/fix-telegram-pending.mjs` - Script to fix stuck quests
- ✅ `api/fix-telegram-quests.sql` - SQL queries for manual inspection

## Restart Required
Yes, restart the API server to apply the code changes:
```bash
cd api
npm run dev
```

Or if deployed on Railway, it will auto-restart on git push.

# Railway Environment Variables Setup

## Problem: "DB only" showing instead of transaction hashes

The backend on Railway is missing the `QUEST_SEEDS_ID` environment variable, so on-chain minting is failing silently and falling back to database-only recording.

## Solution: Add Environment Variable to Railway

### Step 1: Go to Railway Dashboard

1. Open: https://railway.app/
2. Navigate to your project: **growstreams-launch-production**
3. Click on the **API service**

### Step 2: Add Environment Variable

1. Click on the **"Variables"** tab
2. Click **"+ New Variable"**
3. Add the following:

```
Variable Name: QUEST_SEEDS_ID
Value: 0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241
```

### Step 3: Verify Other Required Variables

Make sure these are also set (they should already be there):

```
VARA_SEED=cereal earn donate pulp music step thunder garbage purpose elite assist onion
VARA_NODE=wss://testnet.vara.network
```

### Step 4: Redeploy

Railway will automatically redeploy when you add the variable. Wait for deployment to complete (~1-2 minutes).

### Step 5: Test

1. Go to https://www.growstreams.xyz/app/quests
2. Complete a new quest (or click "Claim" on a pending one)
3. Check "Recent Activity" - should now show **"View On-Chain"** button instead of "DB only"

---

## Verification

After adding the variable, check the Railway logs for:

```
[sails] Connected to wss://testnet.vara.network
[sails] Loaded contract: questSeeds (0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241)
[quest] On-chain mint SUCCESS: 300 Seeds to 0x..., tx=0x...
```

If you see these logs, on-chain minting is working! ✅

---

## Alternative: Use Railway CLI

If you prefer command line:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to project
railway link

# Add variable
railway variables set QUEST_SEEDS_ID=0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241

# Check variables
railway variables
```

---

## What Happens After Fix

**Before (DB only):**
- Seeds awarded ✅
- Recorded in database ✅
- **No on-chain transaction** ❌
- Shows "DB only" in UI

**After (On-chain):**
- Seeds awarded ✅
- Recorded in database ✅
- **On-chain mint transaction** ✅
- Shows "View On-Chain" button in UI
- Transaction visible on VARA Idea portal

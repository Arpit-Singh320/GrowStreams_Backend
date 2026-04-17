# GrowStreams Quest System - Deployment Guide

## Prerequisites

✅ Contract built: `quest-seeds.opt.wasm` exists  
✅ Deploy script dependencies installed  
⚠️ **VARA_SEED required** — set your 12-word mnemonic in `api/.env`

---

## Step 1: Set VARA_SEED

Edit `api/.env` and uncomment/set your seed phrase:

```env
VARA_SEED=word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
```

**Important:** This wallet needs VARA tokens on testnet for gas fees.

---

## Step 2: Deploy quest-seeds Contract

```powershell
cd scripts\deploy-js
node deploy-quest-seeds.mjs
```

**Expected output:**
```
🚀 Deploying quest-seeds...
✅ Deployed: 0x...
📝 Update your api/.env with:
   QUEST_SEEDS_ID=0x...
```

The script will:
- Deploy the Seeds token contract to VARA testnet
- Update `deploy-state.json` automatically
- Print the `programId` to add to your `.env`

---

## Step 3: Update api/.env

Copy the `QUEST_SEEDS_ID` from the deployment output:

```env
QUEST_SEEDS_ID=0x... (paste the programId here)
```

---

## Step 4: Set Other Required Environment Variables

For quests to work fully, set these in `api/.env`:

```env
# Database (required)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Admin (required for invite generation)
ADMIN_TOKEN=your-secret-admin-token

# X/Twitter API (required for follow & mention quests)
X_BEARER_TOKEN=your-twitter-bearer-token
GROWSTREAMS_X_HANDLE=GrowStreams

# GitHub (required for star & PR quests)
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=your-github-pat
GITHUB_REPO_OWNER=BlockX-AI
GITHUB_REPO_NAME=GrowStreams_Backend
```

---

## Step 5: Configure GitHub Webhook

1. Go to: `https://github.com/BlockX-AI/GrowStreams_Backend/settings/hooks`
2. Click **Add webhook**
3. Set:
   - **Payload URL:** `https://your-api-domain.com/api/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** (same as `GITHUB_WEBHOOK_SECRET` in .env)
   - **Events:** Select individual events: `Pull requests` and `Stars`
4. Click **Add webhook**

---

## Step 6: Start Backend API

```powershell
cd ..\..\api
npm run dev
```

**Expected output:**
```
[db] Running migrations...
[db] Seeded default quests
[sails] questSeeds loaded @ 0x...
[api] GrowStreams V2 API listening on port 3000
[cron] Quest monitoring jobs scheduled:
[cron]   quest-follow:     */5 * * * *   (every 5min)
[cron]   quest-mention:    */10 * * * *  (every 10min)
[cron]   quest-stream:     */5 * * * *   (every 5min)
```

---

## Step 7: Generate Invite Codes

```powershell
curl -X POST http://localhost:3000/api/quests/admin/generate-invites `
  -H "Authorization: Bearer your-admin-token" `
  -H "Content-Type: application/json" `
  -d '{"count": 10}'
```

**Response:**
```json
{
  "message": "Generated 10 invite codes",
  "codes": ["GS-ABCD-1234", "GS-EFGH-5678", ...]
}
```

---

## Step 8: Start Frontend (Local)

```powershell
cd ..\frontend
npm install
npm run dev
```

**Expected output:**
```
- Local:        http://localhost:3000
- Network:      http://192.168.x.x:3000
```

**Note:** Frontend runs on port 3000 by default. If API is also on 3000, change frontend port:
```powershell
$env:PORT=3001; npm run dev
```

---

## Step 9: Test Quest Flow

1. **Open frontend:** `http://localhost:3000/app/quests`
2. **Connect wallet** (VARA testnet)
3. **Enter invite code:** `GS-XXXX-XXXX`
4. **Register:** Email + X handle + GitHub username
5. **Complete quests:**
   - Q1: Follow @GrowStreams on X → wait 5min for cron
   - Q2: Post mentioning @GrowStreams → wait 10min for cron
   - Q3: Star the repo → click "Claim" (instant verification)
   - Q4: Open a PR → automatic via webhook
   - Q5: Create a stream on testnet → wait 5min for cron

6. **Check Seeds balance** in the dashboard

---

## Verification Checklist

- [ ] Contract deployed and `QUEST_SEEDS_ID` set
- [ ] Database migrations ran (5 quest tables created)
- [ ] Default quests seeded (5 quests in DB)
- [ ] Cron jobs scheduled (3 quest monitors)
- [ ] GitHub webhook configured (star + PR events)
- [ ] Invite codes generated
- [ ] Frontend accessible at `/app/quests`
- [ ] User can register with invite code
- [ ] On-chain Seeds minting works (check tx_hash in DB)

---

## Troubleshooting

### "VARA_SEED not set"
- Uncomment and set your 12-word mnemonic in `api/.env`

### "WASM not found"
- Run: `cd contracts && cargo build --release -p quest-seeds`

### "Insufficient balance"
- Fund your VARA wallet on testnet: https://idea.gear-tech.io/

### "X_BEARER_TOKEN not set, skipping follow check"
- This is a warning, not an error. X quests won't work without the token.
- Get a bearer token from Twitter Developer Portal

### "GitHub webhook signature invalid"
- Ensure `GITHUB_WEBHOOK_SECRET` matches the webhook secret in GitHub settings

### Seeds not minting on-chain
- Check `QUEST_SEEDS_ID` is set correctly
- Check `VARA_SEED` is set and wallet has balance
- Check API logs for mint errors
- Seeds will still be recorded in DB even if on-chain mint fails

---

## Production Deployment

For production (Railway, Vercel, etc.):

1. Set all env vars in your deployment platform
2. Deploy backend first (runs migrations automatically)
3. Deploy frontend with `NEXT_PUBLIC_API_URL` pointing to backend
4. Configure GitHub webhook with production URL
5. Generate invite codes via admin endpoint
6. Monitor logs for quest verification activity

---

## Support

If you encounter issues:
1. Check API logs for errors
2. Verify all env vars are set correctly
3. Test each quest type individually
4. Check database for quest_completions and seeds_ledger entries

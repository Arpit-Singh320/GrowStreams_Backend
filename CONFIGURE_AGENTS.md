# Quest Agents Configuration Guide

## Current Status

✅ **Frontend:** Running on `http://localhost:3000` → Connected to **production API**  
✅ **Quest-Seeds Contract:** Deployed to VARA testnet  
✅ **Backend API:** Can run locally or use production  

⚠️ **X Agent:** Not configured (X_BEARER_TOKEN missing)  
⚠️ **GitHub Agent:** Not configured (GITHUB_TOKEN + GITHUB_WEBHOOK_SECRET missing)

---

## Getting Invite Codes

### Option 1: From Production API (Recommended for Testing)

Contact your backend admin to generate invite codes on production:

```bash
curl -X POST https://growstreams-core-production.up.railway.app/api/quests/admin/generate-invites \
  -H "Authorization: Bearer <PRODUCTION_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"count": 10}'
```

### Option 2: Generate Locally (Requires PostgreSQL)

1. Set up local PostgreSQL database
2. Update `api/.env`:
   ```env
   DATABASE_URL=postgresql://user:pass@localhost:5432/growstreams
   ```
3. Start backend: `cd api && npm run dev`
4. Generate codes:
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:3000/api/quests/admin/generate-invites" `
     -Method POST `
     -Headers @{"Authorization"="Bearer admin-secret"; "Content-Type"="application/json"} `
     -Body '{"count": 10}'
   ```

### Option 3: Direct Database Insert (PostgreSQL)

```sql
INSERT INTO quest_invites (code, max_uses, created_by)
VALUES 
  ('GS-TEST-0001', 1, 'admin'),
  ('GS-TEST-0002', 1, 'admin'),
  ('GS-TEST-0003', 1, 'admin');
```

---

## Configuring X (Twitter) Agent

### Step 1: Get Twitter API Access

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new app (or use existing)
3. Navigate to **Keys and Tokens**
4. Generate **Bearer Token** (for read-only access)

### Step 2: Add to Environment

Edit `api/.env`:

```env
# X (Twitter) API
X_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAABearerTokenHere...
GROWSTREAMS_X_HANDLE=GrowStreams
```

### Step 3: Verify Configuration

Restart the backend and check logs:

```
[x-agent] X agent initialized with bearer token
[cron]   quest-follow:     */5 * * * *   (every 5min)
[cron]   quest-mention:    */10 * * * *  (every 10min)
```

### How X Quests Work

**Q1: Follow @GrowStreams**
- Cron runs every 5 minutes
- Checks if registered users follow @GrowStreams
- Awards Seeds automatically when verified

**Q2: Mention @GrowStreams**
- Cron runs every 10 minutes
- Strategy 1: Search API (requires Basic tier $100/mo)
- Strategy 2: Fallback to user timeline polling (free tier)
- Awards Seeds for each unique mention (repeatable quest)

### Twitter API Tiers

| Tier | Cost | Search API | User Timeline | Recommended |
|------|------|------------|---------------|-------------|
| Free | $0 | ❌ No | ✅ Yes (50 req/15min) | ✅ Use fallback |
| Basic | $100/mo | ✅ Yes | ✅ Yes | For production |
| Pro | $5000/mo | ✅ Yes | ✅ Yes | Not needed |

**Our implementation auto-falls back to timeline polling if search fails!**

---

## Configuring GitHub Agent

### Step 1: Generate Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Scopes needed:
   - `public_repo` (for star verification)
   - `read:org` (optional, for PR verification)
4. Copy the token

### Step 2: Generate Webhook Secret

```powershell
# Generate a random secret
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

### Step 3: Add to Environment

Edit `api/.env`:

```env
# GitHub
GITHUB_TOKEN=ghp_YourPersonalAccessTokenHere...
GITHUB_WEBHOOK_SECRET=your-random-secret-from-step-2
GITHUB_REPO_OWNER=BlockX-AI
GITHUB_REPO_NAME=GrowStreams_Backend
```

### Step 4: Configure GitHub Webhook

1. Go to: https://github.com/BlockX-AI/GrowStreams_Backend/settings/hooks
2. Click **Add webhook**
3. Configure:
   - **Payload URL:** `https://growstreams-core-production.up.railway.app/api/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** (paste `GITHUB_WEBHOOK_SECRET` from .env)
   - **SSL verification:** Enable
   - **Events:** Select individual events:
     - ✅ Pull requests
     - ✅ Stars
   - **Active:** ✅ Checked
4. Click **Add webhook**

### Step 5: Test Webhook

1. Star the repository
2. Check **Recent Deliveries** in webhook settings
3. Should see `200 OK` response
4. Check backend logs for:
   ```
   [quest] Awarded 50 Seeds to 0x... for star-repo
   ```

### How GitHub Quests Work

**Q3: Star the Repository**
- Webhook fires instantly when user stars repo
- Backend checks if GitHub username matches registered user
- Awards Seeds immediately
- Also verified on manual "Claim" click via GitHub API

**Q4: Raise a Pull Request**
- Webhook fires when PR is opened
- Backend checks if GitHub username matches registered user
- Awards Seeds immediately (repeatable quest)

---

## Testing Quest Flow

### 1. Get an Invite Code

Use one of the methods above to get a code like `GS-XXXX-XXXX`

### 2. Register for Quests

1. Open: http://localhost:3000/app/quests
2. Connect your VARA wallet
3. Enter invite code
4. Fill registration form:
   - Email: your@email.com
   - X Handle: your_twitter_handle (without @)
   - GitHub Username: your_github_username

### 3. Complete Quests

| Quest | Action | Verification | Time |
|-------|--------|--------------|------|
| Q1: Follow X | Follow @GrowStreams on Twitter | Cron (every 5min) | ~5 min |
| Q2: Mention X | Tweet mentioning @GrowStreams | Cron (every 10min) | ~10 min |
| Q3: Star Repo | Star BlockX-AI/GrowStreams_Backend | Webhook (instant) or Claim button | Instant |
| Q4: Raise PR | Open a PR on the repo | Webhook (instant) | Instant |
| Q5: Create Stream | Create a stream on VARA testnet | Cron (every 5min) | ~5 min |

### 4. Check Seeds Balance

- View in dashboard: Total Seeds earned
- View recent activity: List of completions with tx hashes
- Click tx hash → View on Subscan (VARA testnet)

---

## Troubleshooting

### "X_BEARER_TOKEN not set, X agent disabled"

**Solution:** Add X_BEARER_TOKEN to `api/.env` and restart backend

**Impact:** Q1 (Follow) and Q2 (Mention) quests won't work

**Workaround:** Users can still complete Q3, Q4, Q5

### "GitHub webhook signature invalid"

**Solution:** Ensure `GITHUB_WEBHOOK_SECRET` in .env matches webhook secret in GitHub

**Test:** Check webhook "Recent Deliveries" for error details

### "Quest claim submitted but not verified"

**For X quests:** Wait for cron to run (5-10 minutes)

**For GitHub star:** Click "Claim" button for instant verification

**For stream creation:** Wait for cron to run (5 minutes)

### Seeds not appearing on-chain

**Check:**
1. `QUEST_SEEDS_ID` is set correctly in .env
2. `VARA_SEED` is set and wallet has balance
3. Backend logs show mint transaction
4. Seeds are still recorded in database even if on-chain mint fails

---

## Production Deployment Checklist

- [ ] `VARA_SEED` set (wallet with VARA balance for gas)
- [ ] `QUEST_SEEDS_ID` set (deployed contract address)
- [ ] `X_BEARER_TOKEN` set (Twitter API access)
- [ ] `GITHUB_TOKEN` set (GitHub PAT)
- [ ] `GITHUB_WEBHOOK_SECRET` set (random secret)
- [ ] GitHub webhook configured with production URL
- [ ] Database migrations ran successfully
- [ ] Cron jobs scheduled and running
- [ ] Invite codes generated
- [ ] Test registration with dummy account
- [ ] Test each quest type end-to-end

---

## Quick Reference

### Environment Variables

```env
# Required for quests to work
DATABASE_URL=postgresql://...
VARA_SEED=word1 word2 ... word12
QUEST_SEEDS_ID=0x...
ADMIN_TOKEN=your-secret

# Required for X quests (Q1, Q2)
X_BEARER_TOKEN=AAAA...
GROWSTREAMS_X_HANDLE=GrowStreams

# Required for GitHub quests (Q3, Q4)
GITHUB_TOKEN=ghp_...
GITHUB_WEBHOOK_SECRET=random-secret
GITHUB_REPO_OWNER=BlockX-AI
GITHUB_REPO_NAME=GrowStreams_Backend
```

### API Endpoints

```
POST /api/quests/verify-invite { code }
POST /api/quests/register { wallet, email, x_username, github_username, invite_code }
GET  /api/quests (list all quests)
GET  /api/quests/me?wallet=0x... (user progress)
GET  /api/quests/seeds/:wallet (Seeds balance)
POST /api/quests/:slug/claim { wallet } (trigger verification)
GET  /api/quests/stats (global stats)

# Admin endpoints (require Bearer token)
POST /api/quests/admin/generate-invites { count, max_uses?, expires_at? }
GET  /api/quests/admin/invites?status=active
POST /api/quests/admin/award { wallet, quest_slug }
```

### Cron Schedule

```
quest-follow:  */5 * * * *   (every 5 minutes)
quest-mention: */10 * * * *  (every 10 minutes)
quest-stream:  */5 * * * *   (every 5 minutes)
```

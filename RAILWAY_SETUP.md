# GrowStreams API - Railway Deployment (Quick Setup)

## Railway Project Created ✅
- **Project:** growstreams-api-v3
- **URL:** https://railway.com/project/0996de5a-d685-41d0-beb4-ce58e7099e85
- **Account:** sfcssatyamsinghal@gmail.com

## Next Steps (via Railway Dashboard)

### 1. Add PostgreSQL Database
1. Go to: https://railway.com/project/0996de5a-d685-41d0-beb4-ce58e7099e85
2. Click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
3. Railway will auto-provision and set `DATABASE_URL`

### 2. Create API Service
1. Click **"+ New"** → **"GitHub Repo"**
2. Connect: `GrowStreams_Backend` repository
3. **Root Directory:** `/api`
4. **Branch:** `V3` (or your current branch)

### 3. Set Environment Variables
Go to the API service → **Variables** tab and add:

```bash
# Database (auto-set by Railway when you add Postgres)
DATABASE_URL=${{Postgres.DATABASE_URL}}
DB_SSL=true

# Vara Network
VARA_NODE=wss://testnet.vara.network
VARA_SEED=<your-12-word-seed-phrase>

# API Config
PORT=3002
NODE_ENV=production

# Contract Addresses
STREAM_CORE_ID=0x4b41175ab4b8a73b5d115e360a353af57aef41842657d9855f8ed396d30c2dba
TOKEN_VAULT_ID=0xd464e92cf8c766b33c6a6abea3ceb2f3e1c850e812df55fd1b7e2a59e82963ec
SPLITS_ROUTER_ID=0x8f9fcabb24ae57404b6c3a9fde57331a32e457326652fc535e773389d90b4395
PERMISSION_MANAGER_ID=0x467b350648690279e9bbf16fbc7c0525d8e5628d967382a36253c1c095fa4a0f
BOUNTY_ADAPTER_ID=0xc34b86ada8fcbb18c2b6efcd4f9299592e4d909bc7b803ed047ba5cfaf76eb32
IDENTITY_REGISTRY_ID=0xd07d3da386ad769e8ef37923666cb22efef479d2d5b32c1bbbd01e37c3cdeff7
GROW_TOKEN_ID=0x8c3cc925e34285243619fcb07fcd6622a9148426354c144819bf52b93de885bf
```

### 4. Configure Build Settings
Railway should auto-detect from `railway.json`:
- **Build Command:** Auto (Nixpacks)
- **Start Command:** `node src/index.mjs`
- **Root Directory:** `/api`

### 5. Deploy
Railway will auto-deploy when you:
- Push to GitHub (if auto-deploy enabled)
- Or click **"Deploy"** button in dashboard

### 6. Generate Public Domain
1. Go to **Settings** → **Networking**
2. Click **"Generate Domain"**
3. You'll get: `https://growstreams-api-v3-production.up.railway.app`

## Verify Deployment

```bash
# Check deployment status
railway status

# View logs
railway logs

# Test API
curl https://your-domain.railway.app/
```

Expected response:
```json
{
  "name": "GrowStreams V3 API",
  "version": "3.0.0",
  "status": "online"
}
```

## Alternative: CLI Deployment (if dashboard doesn't work)

```bash
cd api

# Link to project
railway link 0996de5a-d685-41d0-beb4-ce58e7099e85

# Set variables (one by one)
railway variables set VARA_NODE=wss://testnet.vara.network
railway variables set NODE_ENV=production
# ... etc

# Deploy
railway up --detach
```

## Troubleshooting

### Upload Timeout
- Use GitHub deployment instead of `railway up`
- Or split into smaller chunks
- Check internet connection

### Database Connection
- Ensure PostgreSQL is added first
- Verify `DATABASE_URL` is set
- Check `DB_SSL=true`

### Build Failures
- Check logs: `railway logs --build`
- Verify `package.json` is in `/api` directory
- Ensure Node 18+ is used

## Cost
- **Free Tier:** $5/month credit (sufficient for testnet)
- **Hobby:** $5/month (if you exceed free tier)

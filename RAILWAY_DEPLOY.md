# GrowStreams API — Railway Deployment Guide

## Prerequisites
- Railway CLI installed: `npm install -g @railway/cli`
- Railway account (free tier works)
- GitHub repository connected

## Step 1: Login to Railway
```bash
railway login
```
Complete authentication in browser.

## Step 2: Initialize Railway Project
```bash
cd api
railway init
```
- Select "Create new project"
- Name it: `growstreams-api`

## Step 3: Add PostgreSQL Database
```bash
railway add --database postgres
```

Railway will automatically:
- Provision a PostgreSQL instance
- Set `DATABASE_URL` environment variable
- Connect it to your service

## Step 4: Set Environment Variables
```bash
# Set from .env.railway template
railway variables set VARA_NODE=wss://testnet.vara.network
railway variables set VARA_SEED="your 12 word seed phrase"
railway variables set DB_SSL=true
railway variables set PORT=3002
railway variables set NODE_ENV=production

# Contract addresses
railway variables set STREAM_CORE_ID=0x4b41175ab4b8a73b5d115e360a353af57aef41842657d9855f8ed396d30c2dba
railway variables set TOKEN_VAULT_ID=0xd464e92cf8c766b33c6a6abea3ceb2f3e1c850e812df55fd1b7e2a59e82963ec
railway variables set SPLITS_ROUTER_ID=0x8f9fcabb24ae57404b6c3a9fde57331a32e457326652fc535e773389d90b4395
railway variables set PERMISSION_MANAGER_ID=0x467b350648690279e9bbf16fbc7c0525d8e5628d967382a36253c1c095fa4a0f
railway variables set BOUNTY_ADAPTER_ID=0xc34b86ada8fcbb18c2b6efcd4f9299592e4d909bc7b803ed047ba5cfaf76eb32
railway variables set IDENTITY_REGISTRY_ID=0xd07d3da386ad769e8ef37923666cb22efef479d2d5b32c1bbbd01e37c3cdeff7
railway variables set GROW_TOKEN_ID=0x8c3cc925e34285243619fcb07fcd6622a9148426354c144819bf52b93de885bf
```

Or set via Railway dashboard: https://railway.app/dashboard

## Step 5: Deploy
```bash
railway up
```

Railway will:
1. Build the app using Nixpacks
2. Install dependencies from `package.json`
3. Run database migrations (via `db.mjs` on startup)
4. Start the API with `node src/index.mjs`

## Step 6: Get Public URL
```bash
railway domain
```

This generates a public URL like: `https://growstreams-api-production.up.railway.app`

## Step 7: Verify Deployment
```bash
# Check logs
railway logs

# Test API
curl https://your-app.railway.app/
```

## Database Connection
Railway automatically sets `DATABASE_URL` in this format:
```
postgresql://user:password@host:port/database
```

The API's `db.mjs` will:
- Auto-create all tables on first startup
- Use SSL connection (`DB_SSL=true`)
- Run migrations automatically

## Monitoring
- **Logs:** `railway logs --follow`
- **Dashboard:** https://railway.app/dashboard
- **Metrics:** CPU, memory, network usage in Railway UI

## Updating
```bash
# Push changes
git push

# Railway auto-deploys on push (if GitHub connected)
# Or manual deploy:
railway up
```

## Environment Variables Reference
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Auto-set by Railway Postgres |
| `VARA_NODE` | ✅ | Vara testnet WebSocket URL |
| `VARA_SEED` | ✅ | 12-word seed phrase for admin account |
| `DB_SSL` | ✅ | Set to `true` for Railway Postgres |
| `PORT` | ⚠️ | Railway auto-sets, but we use 3002 |
| `NODE_ENV` | ⚠️ | Set to `production` |
| `*_ID` | ✅ | All 7 contract addresses |
| `X_BEARER_TOKEN` | ❌ | Optional Twitter integration |

## Troubleshooting

### Database Connection Errors
- Verify `DB_SSL=true` is set
- Check `DATABASE_URL` format in Railway dashboard
- Ensure PostgreSQL service is running

### Contract Loading Errors
- Verify all 7 `*_ID` environment variables are set
- Check contract addresses match `deploy-state.json`
- Ensure Vara testnet is accessible

### Build Failures
- Check Node.js version (should be 18+)
- Verify `package.json` has all dependencies
- Review build logs: `railway logs --build`

## Cost Estimate
- **Free Tier:** $5/month credit
  - 512MB RAM, 1GB storage
  - Enough for testnet/beta
- **Pro:** $20/month
  - 8GB RAM, 100GB storage
  - Production-ready

## Next Steps
1. Connect frontend to Railway API URL
2. Update CORS settings if needed
3. Set up custom domain (optional)
4. Configure GitHub auto-deploy

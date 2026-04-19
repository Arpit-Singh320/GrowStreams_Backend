# Update X/Twitter API Credentials on Railway

## New Credentials (Paid Account - Appforapi716)

You've purchased $5 credits and have a new X API app. Update these environment variables on Railway:

### Step 1: Go to Railway Dashboard

1. Open: https://railway.app/
2. Navigate to: **growstreams-launch-production**
3. Click on the **API service**
4. Click on **"Variables"** tab

### Step 2: Update/Add These Variables

```bash
X_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAAJR69AEAAAAA6viE%2FS4a0kd7dn1rBXWrOmxSUCU%3DSLlPrPAeP9hLK03SYV7hhuHza3Izb2X5WCIUfiSo4fivzleyI0

X_API_KEY=5sY0w3FA93jddOS9BoReLUm2X

X_API_SECRET=KBOqsTiZ4YecATdbyArBUFzFuoYD44FTuNXh6pve5p5x3PlgOv
```

**Note:** Remove or leave empty `X_ACCESS_TOKEN` and `X_ACCESS_SECRET` - they're not needed for App-Only Authentication (Bearer Token).

### Step 3: Verify Existing Variables

Make sure these are still set:

```bash
GROWSTREAMS_X_HANDLE=GrowStreams
VARA_SEED=cereal earn donate pulp music step thunder garbage purpose elite assist onion
VARA_NODE=wss://testnet.vara.network
QUEST_SEEDS_ID=0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241
```

### Step 4: Wait for Redeploy

Railway will automatically redeploy when you update variables (~1-2 minutes).

### Step 5: Verify X Agent is Working

Check Railway logs for:

```
[x-agent] Cleared X existing stream rules
[x-agent] Stream rules set
[x-agent] Filtered stream connected
```

**No more HTTP 402 errors!** ✅

---

## What This Fixes

### Before (Free Tier - HTTP 402)
```
[err] [x-agent] Failed to start stream (attempt 1/2): Request failed with code 402
[err] [x-agent] Failed to start stream (attempt 2/2): Request failed with code 402
```

### After (Paid Tier - Working)
```
[inf] [x-agent] Cleared 1 existing stream rules
[inf] [x-agent] Stream rules set
[inf] [x-agent] Filtered stream connected
```

---

## X Quest Monitoring

With the new credentials, these will work:

1. **Follow Quest** - Polls every 5 minutes to check if users follow @GrowStreams
2. **Mention Quest** - Polls every 10 minutes to check for mentions of @GrowStreams

Both will now award Seeds tokens automatically when detected!

---

## Testing Locally

If you want to test locally before deploying to Railway:

```bash
cd api
node src/index.mjs
```

Watch for:
- `[x-agent] Filtered stream connected` ✅
- No HTTP 402 errors ✅

---

## Important Notes

- **App Name:** Appforapi716
- **Access Level:** Read-only (sufficient for quest monitoring)
- **Cost:** $5 credits purchased
- **Rate Limits:** Much higher than free tier
- **Filtered Stream:** Now accessible (was blocked on free tier)

---

## If You See Errors

### "Invalid authentication credentials"
- Double-check the Bearer Token is copied correctly
- Ensure no extra spaces or line breaks

### "Could not authenticate you"
- Verify the API Key and Secret match the app
- Make sure the app is active in X Developer Portal

### Still getting HTTP 402
- Confirm billing is active in X Developer Portal
- Check that credits are loaded

---

## Summary

✅ Updated `.env` with new credentials  
⏳ **Next:** Update Railway environment variables  
⏳ **Then:** Wait for auto-redeploy  
⏳ **Finally:** Verify X agent is working in logs

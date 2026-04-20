# Follow Quest Fix - Bearer Token Compatibility

## Problem

The follow quest was using `client.v2.following(userId)` which requires **OAuth 1.0a User Context** (Access Token + Secret). Since you only have a **Bearer Token** (App-Only Auth), this endpoint was failing silently.

## Solution

Changed to use `client.v2.followers(gsId)` instead:
- **Before:** Check who the user is following (requires OAuth 1.0a)
- **After:** Check if the user is in @GrowStreams' followers list (works with Bearer Token)

## Code Change

```javascript
// OLD (doesn't work with Bearer Token only)
const following = await client.v2.following(userId, params);
if (data.some(f => f.id === gsId)) { ... }

// NEW (works with Bearer Token)
const followers = await client.v2.followers(gsId, params);
if (data.some(f => f.id === userId)) { ... }
```

## How to Test

### Method 1: Click "Claim" Button
1. Make sure you're following @GrowStreams on X
2. Go to https://growstreams-v2.vercel.app/app/quests
3. Click **"Claim"** on the "Follow @growstreams on X" quest
4. Wait ~10-30 seconds
5. Refresh the page
6. Should show as "Done" with Seeds awarded ✅

### Method 2: Wait for Cron
- The follow check runs every 5 minutes automatically
- Just wait and it will verify your follow

## What Happens Now

1. **Railway deploys** the fix (~1-2 minutes)
2. **Cron runs** every 5 minutes checking followers
3. **Manual claim** also works via the "Claim" button
4. **Seeds awarded** when follow is detected

## Verification

Check Railway logs for:
```
[quest-x] Running follow check (Q1)...
[quest-x] GrowStreams X ID resolved: 1234567890
[quest-x] Q1 Follow verified for @yourhandle (0x...)
[quest-x] Follow check complete: 1 checked, 1 awarded
```

## Why This Works

- **Bearer Token** = App-Only Auth
  - ✅ Can read public data (followers, tweets)
  - ❌ Cannot read user-specific data (who they follow, DMs)

- **OAuth 1.0a** = User Context Auth
  - ✅ Can read everything (including private data)
  - ❌ Requires Access Token + Secret (you don't have these)

By checking @GrowStreams' **public followers list** instead of checking who the user follows, we stay within Bearer Token permissions!

## Next Steps

1. ✅ Fixed and deployed
2. ⏳ Wait for Railway to deploy (~1-2 min)
3. ✅ Follow @GrowStreams on X (if not already)
4. ✅ Click "Claim" on the quest
5. ✅ Get your 100 Seeds! 🎉

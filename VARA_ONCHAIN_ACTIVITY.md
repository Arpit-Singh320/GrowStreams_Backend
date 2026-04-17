# GrowStreams Quest System - On-Chain Activity Report

## Contract Details

**Contract Address:** `0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241`

**Network:** VARA Testnet (`wss://testnet.vara.network`)

**Token:** Seeds (SEEDS)
- **Decimals:** 0
- **Type:** Fungible Token (Sails)
- **Use Case:** Quest reward system for GrowStreams platform

---

## On-Chain Verification Links

### Subscan Explorer
View all contract activity, transactions, and minting events:
```
https://vara.subscan.io/account/0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241
```

### VARA Idea Portal
View contract code, state, and interact with the contract:
```
https://idea.gear-tech.io/programs/0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241?node=wss://testnet.vara.network
```

---

## How Seeds Minting Works

### Quest Completion Flow

1. **User completes a quest** (e.g., creates a stream, stars GitHub repo)
2. **Backend verifies** the quest completion via:
   - On-chain queries (for stream creation)
   - GitHub API (for star/PR quests)
   - Twitter API (for follow/mention quests)
3. **Seeds are minted on-chain** via the `Mint` function:
   ```rust
   Mint(recipient: ActorId, amount: u128, reason: String)
   ```
4. **Transaction hash is recorded** in the database
5. **User sees confirmation** with "View TX" button linking to Subscan

### Server-Side Minting

Seeds are minted **server-side** using the backend's wallet (controlled by `VARA_SEED` environment variable). This design provides:

- ✅ **No gas fees for users** - Backend pays for all transactions
- ✅ **Instant minting** - No waiting for user wallet signatures
- ✅ **Better UX** - Works even if user's wallet is disconnected
- ✅ **Verifiable** - Every mint creates an on-chain transaction with a public hash

---

## Verifying On-Chain Activity

### Method 1: Via Subscan

1. Go to: https://vara.subscan.io/account/0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241
2. Click on **"Extrinsics"** tab
3. Look for **"Mint"** transactions
4. Each transaction shows:
   - Recipient wallet address
   - Amount of Seeds minted
   - Timestamp
   - Block number
   - Transaction hash

### Method 2: Via GrowStreams Frontend

1. Go to: https://www.growstreams.xyz/app/quests
2. Complete a quest
3. Scroll to **"Recent Activity"** section
4. Click the **"View TX"** button next to any Seeds reward
5. Opens Subscan with the specific transaction

### Method 3: Via Script (for developers)

```bash
cd scripts/deploy-js
node query-onchain-seeds.mjs
```

This outputs:
- Contract address
- Subscan link
- VARA Idea portal link
- Instructions for verification

---

## Quest Types & Seeds Rewards

| Quest | Reward | Verification Method | On-Chain? |
|-------|--------|---------------------|-----------|
| Follow @GrowStreams on X | 100 Seeds | Twitter API (cron every 5min) | ✅ Yes |
| Mention @GrowStreams on X | 150 Seeds | Twitter API (cron every 10min) | ✅ Yes |
| Star GitHub Repo | 100 Seeds | GitHub API (instant) | ✅ Yes |
| Raise a PR | 200 Seeds | GitHub Webhook (instant) | ✅ Yes |
| Create a Stream | 300 Seeds | On-chain query (cron every 5min) | ✅ Yes |

**Total possible Seeds per user:** 850 Seeds

---

## Technical Implementation

### Contract Functions

**Mint (Admin-only):**
```rust
Mint(recipient: ActorId, amount: u128, reason: String) -> Result<(), Error>
```
- Mints Seeds tokens to a recipient wallet
- Only callable by the admin (backend wallet)
- Reason field stores quest slug (e.g., "quest:create-stream")

**BalanceOf (Query):**
```rust
BalanceOf(account: ActorId) -> u128
```
- Returns the Seeds balance for any wallet
- Public query, no authentication required

### Database Schema

**seeds_ledger table:**
```sql
CREATE TABLE seeds_ledger (
  id            SERIAL PRIMARY KEY,
  wallet        TEXT NOT NULL,
  delta         INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  quest_id      INTEGER REFERENCES quests(id),
  tx_hash       TEXT,              -- On-chain transaction hash
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Every Seeds award is recorded with:
- Wallet address
- Amount (delta)
- Reason (quest completion)
- **Transaction hash** (for on-chain verification)

---

## Sample On-Chain Transactions

### Example Mint Transaction

**Transaction Hash:** `0x...` (visible in Recent Activity)

**Details:**
- **From:** Backend admin wallet (`kGiaMA7wophBP4BuJRyCUPTrkrgMfYFL78KaZmAF44WYjuPM2`)
- **To:** Quest-Seeds contract (`0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241`)
- **Function:** `Mint`
- **Parameters:**
  - `recipient`: User's wallet address
  - `amount`: Seeds reward (e.g., 300)
  - `reason`: Quest identifier (e.g., "quest:create-stream")

---

## Statistics & Metrics

To get live statistics, query the production API:

```bash
curl https://growstreams-launch-production.up.railway.app/api/quests/stats
```

**Response:**
```json
{
  "totalRegistered": 5,
  "totalSeedsMinted": 1200,
  "questsCompleted": 8,
  "activeQuests": 5
}
```

---

## For VARA Team Review

### Key Points

1. **Contract is live on VARA testnet** - Deployed and operational
2. **All Seeds minting is on-chain** - Every quest completion creates a blockchain transaction
3. **Publicly verifiable** - Anyone can view transactions on Subscan
4. **Production ready** - Currently running on https://www.growstreams.xyz
5. **Real user activity** - Users are completing quests and earning Seeds

### What to Check

- ✅ Contract deployment status
- ✅ Transaction history on Subscan
- ✅ Mint function calls and parameters
- ✅ Token balance queries
- ✅ Gas usage and optimization
- ✅ Contract state integrity

### Contact

For questions or to showcase this integration:
- **Live Demo:** https://www.growstreams.xyz/app/quests
- **Contract Explorer:** https://vara.subscan.io/account/0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241
- **GitHub:** https://github.com/BlockX-AI/GrowStreams_Backend

---

## Summary

GrowStreams has successfully implemented a **fully on-chain quest reward system** using VARA Network:

- ✅ **5 quest types** with Seeds rewards
- ✅ **Server-side minting** for better UX (no user gas fees)
- ✅ **Every reward is on-chain** with verifiable transaction hashes
- ✅ **Public transparency** via Subscan explorer
- ✅ **Production deployment** serving real users

This demonstrates VARA's capability to power **real-world dApp incentive systems** with seamless blockchain integration.

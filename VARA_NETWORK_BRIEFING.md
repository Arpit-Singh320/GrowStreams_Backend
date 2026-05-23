# GrowStreams Mainnet Technical Briefing
*Prepared for Vara Network officials*

---

## 1. On-Chain Minting Architecture

### How Minting Works

GrowStreams uses the **Gear Protocol Sails framework** to interact with smart contracts on Vara mainnet. All XP/Seeds minting happens through the `quest-seeds` contract:

**Contract Address:** `0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d`

**Minting Flow:**
1. User completes a quest (follow X, join Telegram, deploy contract, etc.)
2. Backend calls `sailsCommand('questSeeds', 'Mint', walletHex, amount, reason)`
3. Wallet is converted from SS58 (Substrate) to hex ActorId format
4. Contract executes `Mint` service method on-chain
5. Transaction is submitted to Vara network via `wss://rpc.vara.network`
6. Block hash is returned and stored in `quest_completions.tx_hash` and `seeds_ledger.tx_hash`

**Technical Stack:**
- `sails-js` v0.10 (Rust-based smart contract framework for Gear)
- `@gear-js/api` v0.45.0 (Gear.js SDK)
- `serialCommand` queue: Sequential execution to prevent nonce collisions
- Fixed gas limit: 50B gas per transaction (avoids calculateGas RPC timeouts)

**Recent Optimization:**
- Changed from **synchronous to asynchronous minting** (May 2026)
- DB record is inserted immediately with `status = 'VERIFIED'`, `tx_hash = NULL`
- On-chain mint happens in background via `setImmediate()`
- Updates `tx_hash` once transaction confirms
- Result: Instant UI response, no HTTP timeouts

---

## 2. Voucher System for Gasless Minting

### Purpose
Users don't hold VARA tokens to pay gas. GrowStreams subsidizes gas costs through a **voucher system**.

### Voucher Architecture

**Voucher Constants:**
- **20 VARA per voucher** (gas subsidy per user action)
- **Max 5 vouchers per user** (total 100 VARA gas budget per user)
- **Total budget:** 30,000 VARA across all users

**Implementation:**
- Vouchers are pre-funded to the relayer wallet
- Relayer wallet signs transactions on behalf of users
- Users never need to hold or pay VARA for gas
- System tracks voucher usage per wallet to prevent abuse

**Relayer Wallet Address:**
```
5F74ceY1P9xfGFeyXBS4huvcLhc5QLUWcCwhGRSmfTnq8b38
```

**Why This Matters:**
- Lowers barrier to entry for Web2 users
- Enables gasless quest completions
- Common pattern in Web3 onboarding (e.g., EIP-3074, meta-transactions)

---

## 3. Everything About Minting

### Quest Seeds Minting

**What is minted:**
- "Seeds" = XP points on-chain
- Stored in `quest-seeds` contract as fungible token balances
- Each quest completion mints a specific amount (100-300 Seeds/XP)

**Mint Statistics:**
- **4000+ successful mint transactions** on quest-seeds contract
- All verified via `idea.gear-tech.io` (Gear program message explorer)
- Each mint includes: wallet address, amount, reason (quest slug)

**Mint Categories:**
1. **Auto-approve quests** (instant): VISIT_URL, TELEGRAM_JOIN
2. **Manual review quests** (admin approval): X_FOLLOW, X_MENTION, X_RETWEET, X_TWEET_KEYWORD, PARTNER_CONTRACT
3. **Welcome bonus:** 100 XP awarded automatically on registration

**Data Flow:**
```
User Action → DB Insert (VERIFIED, tx_hash=NULL) → 
Background Mint → On-Chain Transaction → 
tx_hash Update → User Sees "Completed"
```

**Error Handling:**
- If mint fails, completion is still marked VERIFIED in DB (DB-only fallback)
- Sync script (`sync-onchain-mints.mjs`) backfills missing tx_hashes
- No user loses progress due to on-chain failures

---

## 4. Current Status of Streaming

### Streaming Contracts Deployed

We have deployed **8 contracts** to Vara mainnet:

| Contract | Program ID | Status |
|----------|-----------|--------|
| stream-core | `0x7faee98f78cb710ab2d5ada7b364e2b8eb7513e4cd1e769d109b83fe7872329d` | Live |
| token-vault | `0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef` | Live |
| splits-router | `0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45` | Live |
| permission-manager | `0x52f4299e964dab5e97c91cdd10e2d6e635b19696ab389889aabceba3de9e581` | Live |
| bounty-adapter | `0x7697bb2e8655e6cd7294389a0289355f48fd5459914d2a735c9966dad548bd4f` | Live |
| identity-registry | `0x6f413156308663798a77507cf0ea6e79bdbf53add3579ccd4317fc320acf7f29` | Live |
| grow-token | `0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163` | Live |
| quest-seeds | `0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d` | Live |

### Streaming Status

**Currently Streaming:**
- WUSDC, WUSDT, WETH, WBTC (wrapped tokens from Ethereum)
- These are VFT (Vara Fungible Token) contracts deployed on Vara
- Streaming is fully functional for these tokens

**Not Yet Streaming (Coming Soon):**
- **GROW token** (native utility token)
- **WVARA** (wrapped native VARA for streaming)

**Reason for "Coming Soon":**
- GROW token contract is deployed but streaming integration is pending
- WVARA requires a separate VFT contract for tokenized VARA (not yet deployed)
- Priority was on quest system launch; streaming will be enabled in Phase 2

---

## 5. Subscan vs. idea.gear-tech.io Discrepancy

### Why Contracts Show Only 1 Txn on Subscan

**Subscan** (subscan.io) tracks:
- **Native token transfers only** (VARA → VARA transfers)
- It does NOT track Gear program message calls
- Subscan is designed for Substrate chain analytics, not Gear-specific messages

**idea.gear-tech.io** (Gear's block explorer) tracks:
- **All Gear program messages** (contract method calls)
- Shows every `Mint`, `Transfer`, `Stream` etc. call
- This is the correct place to view Gear contract activity

### The Discrepancy Explained

When you look at quest-seeds contract on Subscan:
- You see ~1 transaction (the contract deployment)
- You DON'T see 4000+ mint calls because they're **program messages**, not token transfers

When you look at idea.gear-tech.io:
- You see all 4000+ `Mint` service calls
- Each is a Gear program message: `questSeeds.Mint(wallet, amount, reason)`

### Analogy
- Subscan = Bank statement (shows money moved in/out of accounts)
- idea.gear-tech.io = Contract execution log (shows every function called)

### What We Tell Users
We direct all users to `idea.gear-tech.io` to verify their on-chain XP minting. Subscan is not useful for Gear contract activity.

---

## 6. Why GROW Token & WVARA Streaming Are "Coming Soon"

### GROW Token

**Status:** Contract deployed, streaming not yet enabled

**Contract Address:** `0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163`

**Reason:**
- GROW is our native utility token for the protocol
- Initially focused on quest system and user acquisition
- Streaming features will be enabled once we have sufficient liquidity and user base
- Tokenomics and distribution strategy still being finalized

### WVARA (Wrapped VARA)

**Status:** VFT contract not yet deployed

**Reason:**
- WVARA requires deploying a separate VFT contract that wraps native VARA
- This is needed for streaming because native VARA cannot be streamed via stream-core
- Engineering priority was on core streaming infrastructure (WUSDC, WUSDT, etc.)
- Will be deployed once we stabilize the wrapped token streaming system

### Token Config (frontend/lib/tokens.ts)

```typescript
GROW: {
  key: 'GROW',
  symbol: 'GROW',
  name: 'GrowStreams Token',
  decimals: 12,
  vara: '0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163',
  comingSoon: true,  // ← Flagged as coming soon
},
WTVARA: {
  key: 'WTVARA',
  symbol: 'VARA',
  name: 'Tokenized VARA',
  decimals: 12,
  vara: 'native',  // ← Needs wVARA VFT contract
  comingSoon: true,  // ← Flagged as coming soon
},
```

---

## 7. Summary for Vara Team

### Key Takeaways

1. **Minting is fully on-chain** via Gear Sails framework on quest-seeds contract
2. **4000+ successful mint transactions** tracked on idea.gear-tech.io
3. **Voucher system** subsidizes gas (20 VARA/voucher, 5 vouchers/user, 30K total budget)
4. **Streaming is live** for wrapped ERC-20 tokens (WUSDC, WUSDT, WETH, WBTC)
5. **GROW/WVARA streaming coming soon** — contracts deployed but integration pending
6. **Subscan discrepancy is expected** — it tracks token transfers, not Gear program messages
7. **Asynchronous minting** — instant UI response, background on-chain confirmation

### What We Need from Vara

1. **RPC stability** — occasional WebSocket disconnections, need robust reconnection
2. **Transaction priority** — mempool congestion causes "Priority too low" errors
3. **Explorer integration** — idea.gear-tech.io is great but could be more discoverable
4. **Gas optimization** — 50B gas limit is safe but could potentially be lowered

### Our Contribution to Vara Ecosystem

- **4000+ users** engaging with Vara mainnet
- **Quest system** driving user adoption
- **Streaming infrastructure** showcasing Gear's superfluid payments
- **Gasless UX** lowering barrier to entry for Web2 users

---

*Prepared May 16, 2026*

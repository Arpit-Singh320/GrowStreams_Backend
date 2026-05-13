# GrowStreams — Vara Mainnet Migration: Implementation Plan

> **Goal**: Move the entire GrowStreams platform from Vara Testnet → Vara Mainnet.
> **Relayer wallet**: Already funded with 1500+ VARA on mainnet.
> **Voucher system**: Already implemented (500 VARA budget for gasless stream creation).

---

## Current State Assessment

| Component | Status | Network |
|-----------|--------|---------|
| 8 Sails contracts | Deployed | **Testnet** (`wss://testnet.vara.network`) |
| Quest Seeds contract | Deployed + working | **Testnet** |
| Backend API (Railway) | Running | Connects to **testnet** |
| Frontend (Vercel) | Running | Connects to **testnet** via wallet |
| Voucher service | Code ready | Not yet active (needs mainnet program IDs) |
| Vara.eth (EVM) | Hoodi testnet | Not yet relevant for mainnet |
| Database | Active | Preserves user data (hybrid migration) |

---

## Phase 1: Build All Contract WASMs

Only `quest_seeds.opt.wasm` exists. Need to build the other 7 contracts.

```bash
cd contracts
# Requires: rustup target add wasm32-unknown-unknown
# Requires: cargo install --git https://github.com/aspect-build/sails sails-cli (or use gear toolchain)
cargo build --release --target wasm32-unknown-unknown
```

**Contracts to build**:
1. `stream-core`
2. `token-vault`
3. `splits-router`
4. `permission-manager`
5. `bounty-adapter` (in `adapters/bounty-adapter`)
6. `identity-registry`
7. `grow-token`
8. `quest-seeds` (already built ✅)

After build, optimize with `wasm-opt`:
```bash
wasm-opt -O3 -o contracts/target/wasm32-unknown-unknown/release/<name>.opt.wasm \
             contracts/target/wasm32-unknown-unknown/release/<name>.wasm
```

---

## Phase 2: Deploy All Contracts to Vara Mainnet

Use the existing deploy script (`scripts/deploy-js/deploy.mjs`) but point it to mainnet.

### Steps:
1. Set `VARA_NODE=wss://rpc.vara.network` in `.env`
2. Ensure `VARA_SEED` mnemonic resolves to the funded mainnet wallet (1500+ VARA)
3. Deploy each contract one by one (use separate deploy scripts or modify `deploy.mjs`)

### Deploy order (dependency-aware):
| # | Contract | Constructor | Dependencies |
|---|----------|-------------|--------------|
| 1 | `permission-manager` | `New()` | None |
| 2 | `identity-registry` | `New()` | None |
| 3 | `grow-token` | `New(name, symbol, decimals, admin)` | None |
| 4 | `quest-seeds` | `New("Seeds", "SEEDS", 0, admin)` | None |
| 5 | `token-vault` | `New(admin)` | None |
| 6 | `stream-core` | `New(token_vault_id, permission_manager_id)` | #1, #5 |
| 7 | `splits-router` | `New(stream_core_id)` | #6 |
| 8 | `bounty-adapter` | `New(stream_core_id)` | #6 |

### Output:
- New `deploy-state.json` with mainnet program IDs
- All IDs go into Railway env vars

---

## Phase 3: Backend Configuration (Railway Env Vars)

Update Railway environment variables:

```env
# Network switch
VARA_NODE=wss://rpc.vara.network

# Relayer (same seed phrase — wallet already funded on mainnet)
VARA_SEED=<same 12-word mnemonic>

# New mainnet program IDs (from Phase 2 deploy output)
STREAM_CORE_ID=0x<new_mainnet_id>
TOKEN_VAULT_ID=0x<new_mainnet_id>
SPLITS_ROUTER_ID=0x<new_mainnet_id>
PERMISSION_MANAGER_ID=0x<new_mainnet_id>
BOUNTY_ADAPTER_ID=0x<new_mainnet_id>
IDENTITY_REGISTRY_ID=0x<new_mainnet_id>
GROW_TOKEN_ID=0x<new_mainnet_id>
QUEST_SEEDS_ID=0x<new_mainnet_id>

# Voucher config (already set, uses 500 VARA per voucher max)
VOUCHER_AMOUNT=500000000000000  # 500 VARA (12 decimals)
VOUCHER_DURATION_BLOCKS=14400   # ~12 hours
MAX_VOUCHERS_PER_USER=3
```

---

## Phase 4: Code Changes (Remove Hardcoded Testnet Defaults)

### Files to modify:

| # | File | Change |
|---|------|--------|
| 1 | `api/src/sails-client.mjs:110` | Default `'wss://testnet.vara.network'` → `'wss://rpc.vara.network'` |
| 2 | `api/src/services/bridge-service.mjs:14` | `gateway` → read from env or `'wss://rpc.vara.network'` |
| 3 | `api/src/services/bridge-service.mjs:15` | `explorer` → `'https://vara.subscan.io'` |
| 4 | `api/src/services/bridge-service.mjs:16-17` | `chainId/chainName` → `'vara-mainnet'` / `'Vara Network'` |
| 5 | `api/src/routes/test-mint.mjs:43` | Remove hardcoded testnet IDEA link |
| 6 | `api/src/config/tokens.mjs` | Replace testnet VFT ActorIds with mainnet addresses (see Phase 5) |
| 7 | `frontend/contexts/VaraContext.tsx:11` | Default → `'wss://rpc.vara.network'` |
| 8 | `frontend/contexts/EvmWalletContext.tsx:15-21` | Keep as-is for now (Vara.eth not on mainnet yet) |
| 9 | `scripts/deploy-js/deploy.mjs:13` | Default → `'wss://rpc.vara.network'` |
| 10 | `scripts/deploy-js/deploy-quest-seeds.mjs:13` | Default → `'wss://rpc.vara.network'` |

### Vercel env vars:

```env
NEXT_PUBLIC_VARA_NODE_ADDRESS=wss://rpc.vara.network
```

---

## Phase 5: Token Address Migration

Current token addresses in `api/src/config/tokens.mjs` are **testnet VFT program IDs**.

On mainnet, we need to either:
- **Option A**: Deploy our own VFT wrappers for USDC, USDT, WETH, WBTC on mainnet
- **Option B**: Use Vara's official bridged token addresses from https://wiki.vara.network/docs/tokens/

For GROW and VARA:
- `GROW` → use the newly deployed `grow-token` program ID from Phase 2
- `VARA` → native, no change needed
- `WTVARA` → may need Vara's official wrapped VARA on mainnet

**Action**: After deployment, update `tokens.mjs` with the correct mainnet ActorIds.

---

## Phase 6: Database Migration (Hybrid Approach)

**Keep**:
- `quest_registrations` (all user accounts)
- `quest_completions` (preserve completion history, but null out `tx_hash`)
- `seeds_ledger` (preserve XP totals, null out `tx_hash`)
- `vouchers` table (fresh — no testnet vouchers to keep)

**Clean**:
- `UPDATE quest_completions SET tx_hash = NULL;`
- `UPDATE seeds_ledger SET tx_hash = NULL;`
- `DELETE FROM bridge_transactions;` (testnet bridge txns are meaningless)

**Rationale**: Users keep their XP and quest progress. Testnet tx hashes are invalid on mainnet — clearing them allows the `syncOnchainMints` cron to re-mint them on mainnet.

---

## Phase 7: Re-mint On-Chain XP on Mainnet

After deploying `quest-seeds` on mainnet:
1. The `syncOnchainMints` cron job picks up all `quest_completions WHERE tx_hash IS NULL`
2. It re-mints Seeds to each wallet on the mainnet contract
3. Users' on-chain XP is restored

This is **automatic** — no manual intervention needed after deployment.

---

## Phase 8: Frontend Deployment

1. Set Vercel env: `NEXT_PUBLIC_VARA_NODE_ADDRESS=wss://rpc.vara.network`
2. Run `vercel --prod`
3. Users' wallets will now connect to Vara mainnet
4. The Polkadot.js extension will prompt users to switch to mainnet

---

## Phase 9: Verification Checklist

- [ ] Backend logs: `[sails] Connected to wss://rpc.vara.network`
- [ ] Backend logs: `[sails] Loaded questSeeds: 0x<mainnet_id>`
- [ ] Leaderboard API returns correct data
- [ ] Quest claim → on-chain XP mint succeeds (check Subscan)
- [ ] Voucher issue works → user can create stream gaslessly
- [ ] Frontend wallet connects to Vara mainnet (not testnet)
- [ ] Token balances load correctly
- [ ] `syncOnchainMints` cron re-mints testnet-era completions

---

## Execution Order (Step-by-Step)

```
1. Build all 8 contract WASMs (local machine or CI)
2. Deploy all contracts to mainnet (scripts/deploy-js)
3. Record new program IDs in deploy-state.json
4. Update Railway env vars with mainnet IDs + node URL
5. Apply code changes (remove hardcoded testnet defaults)
6. Run DB migration queries (null tx_hash, delete bridge_transactions)
7. Push code to git → Railway auto-deploys backend
8. Set Vercel env + deploy frontend
9. Verify end-to-end (checklist above)
10. Monitor syncOnchainMints cron for re-minting
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Wallet balance drained by vouchers | Cap at 500 VARA/voucher, 3 max per user, rate limit |
| Contracts fail to deploy | Test with small gas first, verify balance covers all 8 deploys |
| Users lose wallet connection | Frontend clearly shows "Vara Mainnet" — users may need to manually switch in extension |
| Bridge service broken | Vara.eth not on mainnet yet — disable bridge UI or show "Coming soon" |
| Token addresses wrong | Verify each against Vara wiki before going live |

---

## Estimated Time

| Phase | Duration |
|-------|----------|
| Phase 1: Build WASMs | 10-15 min (if Rust toolchain ready) |
| Phase 2: Deploy contracts | 15-20 min (8 contracts × ~2 min each) |
| Phase 3-4: Env + code changes | 15 min |
| Phase 5: Token addresses | 10 min (research + update) |
| Phase 6: DB migration | 5 min |
| Phase 7: Re-mint (automatic) | Runs in background |
| Phase 8-9: Frontend + verify | 10 min |
| **Total** | **~1-1.5 hours** |

---

## Prerequisites Before Starting

- [ ] Confirm the `VARA_SEED` mnemonic resolves to the 1500+ VARA mainnet wallet
- [ ] Rust toolchain installed with `wasm32-unknown-unknown` target
- [ ] `wasm-opt` installed (from `binaryen` package)
- [ ] Railway CLI access for env var updates
- [ ] Vercel CLI access for frontend deploy

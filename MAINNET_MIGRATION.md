# GrowStreams — Vara Mainnet Migration Plan

> Migrate the entire platform from Vara Testnet / Hoodi to Vara Mainnet with gasless user experience.

---

## Gasless Architecture (Current State)

| Layer | Who pays gas? | Mechanism |
|-------|--------------|-----------|
| Quest XP minting (Vara native) | Backend relayer (`VARA_SEED`) | `sailsCommand('questSeeds', 'Mint', ...)` |
| Quest XP minting (Vara.eth) | Backend relayer (`ETH_PRIVATE_KEY`) | `mintSeedsEvm(...)` via Mirror contract |
| Admin approvals / awards | Backend relayer | Same as above |
| User stream creation | **User pays** | Signed in frontend via `@gear-js/react-hooks` |
| Bridge interactions | **User pays** | Not yet implemented (info-only) |

**Result**: Quests are already gasless. Stream creation and other user-initiated on-chain actions are NOT gasless yet.

### Making streams gasless (optional — Phase 2)

Use Gear's **Voucher system** (`GearVoucher`):
1. Backend creates a gas voucher for the user's address
2. Frontend attaches voucher ID when sending the message
3. Gas is deducted from the voucher (funded by the project wallet), not the user

---

## Phase 1: Code Preparation (env-driven config)

Make all network references configurable so mainnet switch = env var change only.

### Files to Update

| # | File | Line(s) | What to change |
|---|------|---------|----------------|
| 1 | `api/src/sails-client.mjs` | 110 | Default `wss://testnet.vara.network` → read from `VARA_NODE` env |
| 2 | `api/src/vara-eth-client.mjs` | 22-35 | Default RPC, chain ID, chain name, explorer — all from env |
| 3 | `api/src/config/tokens.mjs` | 1-82 | Move contract addresses to env or a mainnet config block |
| 4 | `api/src/services/bridge-service.mjs` | 10-39 | Update bridge contracts, chain names, explorers from env |
| 5 | `frontend/contexts/VaraContext.tsx` | 11 | Default `wss://testnet.vara.network` → from `NEXT_PUBLIC_VARA_NODE_ADDRESS` |
| 6 | `frontend/contexts/EvmWalletContext.tsx` | 15-20 | Chain ID, name, RPC, explorer from env vars |

---

## Phase 2: Contract Deployment (Mainnet)

All 8 Sails programs must be re-deployed on `wss://rpc.vara.network`:

| Contract | Purpose | Deploy script |
|----------|---------|---------------|
| `streamCore` | Money streaming engine | `scripts/deploy-js/deploy.mjs` |
| `tokenVault` | Token custody for streams | same |
| `splitsRouter` | Payment splitting | same |
| `permissionManager` | Role-based access | same |
| `bountyAdapter` | Bounty payouts | same |
| `identityRegistry` | GitHub/social identity binding | same |
| `growToken` | GROW utility token | `scripts/deploy-js/deploy-grow.mjs` |
| `questSeeds` | XP/Seeds minting | `scripts/deploy-js/deploy-quest-seeds.mjs` |

### Vara.eth Mainnet (if available)
- `stream-core-eth` WASM → deploy via `ethexe` CLI
- `StreamEscrow.sol` → deploy via `scripts/deploy-js/deploy-eth.mjs`

### Requirements
- Funded relayer wallet on Vara mainnet (VARA for gas)
- Funded ETH wallet on Vara.eth mainnet (ETH for gas)
- `VARA_SEED` mnemonic/suri with mainnet balance

---

## Phase 3: Environment Variables

### Railway (Backend API)

```env
# --- Network ---
VARA_NODE=wss://rpc.vara.network
VARA_ETH_RPC=<vara.eth mainnet RPC>
VARA_ETH_CHAIN_ID=<vara.eth mainnet chain ID>

# --- Relayer keys (same keys, fund on mainnet) ---
VARA_SEED=<12-word mnemonic or //Dev suri>
ETH_PRIVATE_KEY=<0x...>

# --- Deployed contract IDs (from Phase 2 output) ---
STREAM_CORE_ID=0x...
TOKEN_VAULT_ID=0x...
SPLITS_ROUTER_ID=0x...
PERMISSION_MANAGER_ID=0x...
BOUNTY_ADAPTER_ID=0x...
IDENTITY_REGISTRY_ID=0x...
GROW_TOKEN_ID=0x...
QUEST_SEEDS_ID=0x...

# --- Vara.eth mirrors (from Phase 2) ---
STREAM_CORE_ETH_MIRROR=0x...
STREAM_ESCROW_ADDRESS=0x...
VARA_ETH_QUEST_SEEDS_MIRROR=0x...
```

### Vercel (Frontend)

```env
NEXT_PUBLIC_VARA_NODE_ADDRESS=wss://rpc.vara.network
NEXT_PUBLIC_VARA_ETH_CHAIN_ID=<mainnet chain ID>
NEXT_PUBLIC_VARA_ETH_RPC=<mainnet RPC>
```

---

## Phase 4: Token Address Migration

Current `api/src/config/tokens.mjs` has testnet ActorIds. On mainnet:

- USDC, USDT, WETH, WBTC → need mainnet VFT program IDs (from Vara's official bridge)
- GROW → newly deployed `growToken` program ID
- WTVARA → native, no change needed

Source of truth for mainnet token addresses: https://wiki.vara.network/docs/tokens/

---

## Phase 5: Database Decision

| Option | Pros | Cons |
|--------|------|------|
| **Fresh DB** | Clean slate, no testnet junk | Users lose XP history |
| **Migrate DB** | Preserves user progress | testnet tx_hashes invalid on mainnet |
| **Hybrid** | Keep registrations + XP totals, null out tx_hashes | Best of both |

**Recommended**: Hybrid — keep `quest_registrations`, `quest_completions` (zero out `tx_hash`), `seeds_ledger`. Drop `bridge_transactions` (testnet-only).

---

## Phase 6: Deployment & Verification

1. Deploy all contracts to mainnet
2. Update env vars in Railway + Vercel
3. Push code changes (Phase 1 hardcoded defaults)
4. Redeploy backend (Railway auto-deploys from git)
5. Redeploy frontend (`vercel --prod`)
6. Verify:
   - [ ] Backend connects to `wss://rpc.vara.network` (check logs)
   - [ ] Quest XP minting works (claim a test quest)
   - [ ] Leaderboard shows correct XP
   - [ ] Frontend wallet connects to Vara mainnet
   - [ ] Stream creation works (if applicable)
   - [ ] Token balances read correctly
   - [ ] Bridge info shows mainnet data

---

## Phase 7: Gear Voucher (Gasless Streams) — Optional

If user-initiated stream creation should be gasless:

```
1. Backend exposes: POST /api/voucher/issue { wallet, programId }
2. Backend calls gearApi.voucher.issue(wallet, programId, gasAmount)
3. Frontend reads voucher from API before sending stream creation msg
4. Frontend attaches voucherId to the extrinsic
5. Gas is covered by project wallet
```

This requires:
- Backend has sufficient VARA balance for voucher funding
- Rate limiting to prevent abuse
- Voucher expiry management

---

## Execution Checklist

- [ ] Phase 1: Make code env-driven (remove hardcoded testnet defaults)
- [ ] Phase 2: Deploy contracts to Vara mainnet
- [ ] Phase 3: Set all env vars in Railway + Vercel
- [ ] Phase 4: Get mainnet token addresses
- [ ] Phase 5: Migrate/reset database
- [ ] Phase 6: Deploy & verify end-to-end
- [x] Phase 7: Gasless vouchers implemented (backend service + API + frontend auto-attach)

---

## Key Contacts / Resources

- Vara mainnet RPC: `wss://rpc.vara.network`
- Vara mainnet explorer: https://vara.subscan.io/
- Gear Idea (deploy UI): https://idea.gear-tech.io/programs?node=wss%3A%2F%2Frpc.vara.network
- Vara.eth mainnet info: TBD (check with Gear team)
- Bridge docs: https://wiki.vara.network/docs/bridge/
- Token list: https://wiki.vara.network/docs/tokens/

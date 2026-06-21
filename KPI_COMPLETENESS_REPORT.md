# GrowStreams — KPI & Platform Completeness Report

_Generated: 2026-06-21 · Branch: M1-beta · Network: Vara mainnet_

> Local-only report. Not committed to git.

---

## 1. What shipped this cycle

The Phase-2 grant KPIs were **unclaimable** because the native Vara contracts had two on-chain gaps: (a) they declared events in their IDLs but never emitted them, and (b) there was no protocol fee anywhere on-chain. Both are now closed.

| Change | Status |
|---|---|
| `stream-core` emits all IDL events (`StreamCreated`, `Withdrawn`, `Deposited`, `StreamStopped`, …) | ✅ Done |
| `token-vault` emits all IDL events (`TokensDeposited`, `TokensWithdrawn`, `FeeCollected`, …) | ✅ Done |
| 2.5% entry fee (`fee_bps=250`) on `create_stream` + `deposit` → treasury | ✅ Done |
| Admin setters `SetFeeBps`, `SetTreasury` (treasury defaults to admin) | ✅ Done |
| Redeploy both contracts to Vara **mainnet** + wire cross-refs | ✅ Done |
| `/api/analytics/fees` endpoint + service (`getProtocolFees`) | ✅ Done |
| `/api/analytics/retention` endpoint + service (`getRetentionCohorts`, 30-day cohorts) | ✅ Done |
| Dashboard: Protocol Fees cards + Retention cohort table | ✅ Done |
| Frontend proxies, API client methods, fallback program IDs refreshed | ✅ Done |

**New mainnet program IDs**
- stream-core: `0xba0901f3ef665e956d8ab721686d97d2e5473092df34baf229e87ac826eadc4a`
- token-vault: `0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9`

---

## 2. KPI readiness

Each grant KPI, the mechanism that now produces it, and whether it is **live** (code complete + data flowing) vs **pending real activity** (code complete, needs on-chain usage to populate).

| KPI | Mechanism | Code | Data status |
|---|---|---|---|
| **Streaming volume** | Reconstructed from `StreamCreated`/`Withdrawn` events → `stream_events` table | ✅ | Pending new streams on new contracts |
| **MAU / DAU** | Distinct active wallets from `stream_events` + `vault_events` | ✅ | Pending new activity |
| **Protocol-fee revenue** | `FeeCollected` events → `vault_events(type='fee')` → priced in USD | ✅ | Pending first funded stream |
| **Retention (30-day cohort)** | First-seen per wallet → weekly cohorts → % active again 24h–30d later | ✅ | Pending ≥30d of activity to complete a cohort window |
| **TVL** | Live vault balance reads (already worked pre-change) | ✅ | Live |
| **Transactions** | Per-event rows in `stream_events`/`vault_events` | ✅ | Pending new activity |

**Why "pending" is expected, not a gap:** fresh-start redeploy means the new contracts start at zero. Old streams remain on the old contracts as legacy. Every new stream created on the new IDs lights up volume, MAU/DAU, fees, and transactions automatically via the already-running event indexer (`startEventIndexer()` at boot). Retention needs the 30-day window to elapse before the first cohort closes.

---

## 3. Architecture completeness

- **Event pipeline:** consumer side (`event-indexer.mjs`) was already built and subscribed to the exact IDL event names; emitting from Rust activated the whole chain with no new indexer or schema work. State-poller remains as a fallback.
- **Fee routing:** entry-side skim, internal vault move (tokens already custodied) → treasury withdraws later via normal `withdraw_tokens`. No new token transfers, minimal attack surface.
- **Pricing:** fees and TVL priced via existing `getBatchPricesDetailed`.
- **Frontend:** runtime-hydrated program IDs (`GET /api/config/program-ids`), so the frontend service needs **no** env change on redeploy.

---

## 4. Known limitations (honest scope)

1. **gVARA / super-token streams are NOT fee-bearing.** Fee-ing them requires a super-token redeploy that wipes balances — deliberately excluded. Fees apply to vault/VFT + native VARA paths only.
2. **"Acquire users" is growth, not code.** The engineering levers (real events, fee revenue, working retention/analytics) are in place; driving actual TVL/wallets to KPI thresholds is marketing/community work, not a code deliverable.
3. **vara-eth `checkStreamExists` ABI bug** is a separate EVM-side issue, unrelated to this native event/fee work.
4. **Retention cohorts** only report windows that have fully elapsed; expect empty cohort tables until ~30 days of activity exist.

---

## 5. Action items for you (operational)

| # | Action | Owner |
|---|---|---|
| 1 | Set Railway backend env: `STREAM_CORE_ID`, `TOKEN_VAULT_ID` (new IDs above), confirm `VARA_NODE=wss://rpc.vara.network` | You |
| 2 | Let backend redeploy → indexer subscribes to new contracts | Auto |
| 3 | Smoke test: create one stream → confirm a `StreamCreated` row + a `fee` row appear within seconds | You / me |
| 4 | **Rotate exposed secrets** (VARA_SEED, ETH_PRIVATE_KEY, GITHUB_TOKEN, RESEND_API_KEY, DB creds, ADMIN_TOKEN) — were pasted in plaintext | You |
| 5 | Optional: decide whether to purge `GINIE-Invite-codes.txt` from git history (tracked since earlier commits) | You |

---

## 6. Bottom line

All engineering for the KPI claim is **complete and on mainnet**. The dashboard, endpoints, events, and fee mechanism are wired end-to-end. Remaining work is operational (Railway env + secret rotation) and organic (new on-chain activity to populate the now-live metrics). No code blockers remain.

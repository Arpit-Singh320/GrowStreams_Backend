# GrowStreams Analytics & DeFiLlama Integration

Comprehensive reference for the `/analytics` system: data sources, endpoints, the
on-chain reconstruction approach, the DeFiLlama adapters, persistence, and the
frontend dashboard. Network: **Vara mainnet** (genesis `0xfe1b4c55…c53763`).

---

## 1. Overview

GrowStreams analytics report two clearly-separated domains:

- **On-chain (DeFi)** — TVL, streaming volume, streams, on-chain wallets/DAU/MAU.
  Source of truth = Vara chain, read via the Sails/Gear stack.
- **Platform (off-chain)** — users (two registration systems), quests, campaigns,
  engagement (invites/referrals/vouchers), seasons. Source = PostgreSQL.

Everything is exposed under `GET /api/analytics/*` and rendered on the
`/analytics` frontend dashboard. A live, generated reference of every endpoint's
real response lives in [`analytics-endpoint-audit.md`](../analytics-endpoint-audit.md)
(regenerate with `node api/audit-analytics-endpoints.mjs`).

---

## 2. Key architectural decisions

### 2.1 TVL = live on-chain BalanceOf
TVL is the live VFT `BalanceOf(vault)` per token, plus the vault's real native
VARA balance (`system.account.free` — NOT `total_tokens_held`, which is an
all-token accounting counter and was previously mislabeled). gVARA + wVARA +
native VARA are all economically VARA and priced as `vara-network`.

### 2.2 Activity = state polling, not events
**StreamCore declares events in its IDL but never emits them on-chain** (verified
live — see [`BLOCKER-onchain-events-and-fees.md`](./BLOCKER-onchain-events-and-fees.md)).
So event-subscription indexing captures nothing. Instead we **poll contract
state**: `TotalStreams()` + `GetStream(id)` give streams, volume, wallets, and —
via the on-chain `start_time`/`last_update` timestamps — DAU/MAU.

Volume uses the **live** streamed value (`streamed + flow_rate × elapsed`, capped
at `deposited`), matching the contract's own formula, because the stored
`streamed` field is stale between mutating calls.

### 2.3 XP/seeds activity is on-chain too
XP minting goes through the quest-seeds contract (`SeedsService.Mint`). Every mint
is recorded in `seeds_ledger` **with its on-chain `tx_hash`** (8,000+ verifiable
mints). This is the dominant real on-chain activity and feeds combined DAU/MAU and
the transactions feed (with explorer links).

### 2.4 Two user systems (do not conflate)
- `users` — Campaign system (GitHub/X handles).
- `quest_registrations` — Quest system (invite + email OTP).
They do not sync; the same wallet can exist in both. `platform.users.
totalDistinctWallets` dedupes across both + `participants`.

---

## 3. Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /summary?days=30` | Master payload: `onchain{}`, `platform{}`, `kpis{}`, `freshness{}`, `coverage{}` (+ flat aliases) |
| `GET /tvl` | Live TVL: totals + per-token rows (balance, price, pricingSource, deployed) |
| `GET /defillama-tvl` | DeFiLlama-shaped TVL: balances keyed `coingecko:id`, `timetravel:false` |
| `GET /onchain-streams` | Stream activity (state-polled): volume, wallets, DAU/MAU, XP-seeds, combined union |
| `GET /defillama-volume` | DeFiLlama-shaped cumulative streaming volume keyed `coingecko:id` |
| `GET /activity?days=30` | Backend-logged + state-derived activity window |
| `GET /tvl-history?days=30` | Daily TVL series (for charts) |
| `GET /activity-history?days=30` | Daily on-chain volume/wallets/DAU/MAU/streams series (for charts) |
| `GET /volume-history?days=30` | Daily volume series |
| `GET /history?hours=168` | Hourly protocol snapshots |
| `GET /contracts` · `/explorer-links` | Program IDs + explorer URLs |
| `GET /transactions?limit=&offset=` | Tx feed (stream/vault/bridge/XP-mint) with explorer links, server-paginated |
| `GET /wallets?limit=&offset=` | Active wallets, server-paginated, test accounts excluded |

---

## 4. Persistence & history

The hourly cron (`runAnalyticsSnapshot`) writes to `analytics_protocol_snapshots`
and `analytics_tvl_snapshots`, capturing TVL + the on-chain metrics
(`onchain_volume_usd`, `onchain_unique_wallets`, `onchain_dau`, `onchain_mau`,
`seeds_active_wallets`, `stream_wallets`, `total_streams`). `/activity-history`
and `/tvl-history` read these back as daily series for the dashboard charts.

The **state-indexer** (`api/src/services/state-indexer.mjs`) runs every 5 min,
persisting per-stream state to `stream_state` (incremental: new + active streams)
so `/onchain-streams` aggregates from the DB instead of enumerating every stream
over RPC. Falls back to live RPC enumeration when the table is empty.

> History accumulates **forward from now** — on-chain history can't be backfilled
> because the contracts emit no events.

---

## 5. DeFiLlama adapters (`defillama-adapter/`)

| Adapter | Approach | Why |
|---------|----------|-----|
| **TVL** (`growstreams/`) | Direct chain read (axios + raw `gear_calculateReplyForHandle`) | `BalanceOf -> u128` is a trivial trailing decode — reliable to hand-roll |
| **Volume** (`growstreams-volume/`) | Thin wrapper over backend `/defillama-volume` | `GetStream -> Option<Stream>` is a nested struct; hand-rolled SCALE proved fragile, so the backend decodes it with the trusted Sails stack |

Both return token amounts keyed by `coingecko:vara-network` (NOT pre-converted
USD — DeFiLlama prices them), `timetravel:false`. See
[`defillama-adapter/README.md`](../defillama-adapter/README.md) for submission steps.

> **Submission gating:** TVL won't list until real deposits exceed DeFiLlama's
> display threshold; the volume adapter needs `/defillama-volume` deployed to prod.

---

## 6. Frontend (`/analytics`)

Tabbed dashboard (`frontend/app/analytics/page.tsx`):
- **Overview** — headline KPIs + 4 Recharts charts (TVL, Volume, Wallets, MAU).
- **On-chain** — TVL by token, stream KPIs, contracts with explorer links.
- **Platform** — users (both systems), quests, campaigns, engagement.
- **Transactions** — paginated feed; every row links to the Vara explorer (proof).
- **Wallets** — paginated active wallets.

Components in `frontend/components/analytics/`. Data flows through Next proxy
routes (`frontend/app/api/analytics/*`) → backend. Charts use Recharts.

---

## 7. Known limitations / blockers

- **Protocol fee KPI ($250+)**: no fee logic exists in the contracts — cannot be
  measured without a contract change + redeploy.
- **On-chain event emission**: deferred; state polling is the interim
  (and currently the only) reliable path. See `BLOCKER-onchain-events-and-fees.md`.
- **Historical depth**: series start from when snapshots began; no backfill.

---

## 8. Operations

- Regenerate the endpoint audit: `node api/audit-analytics-endpoints.mjs`
- Purge test/mock data: `api/purge-test-analytics-data.mjs`, `api/purge-stale-tvl-snapshots.mjs`
- Run a manual state poll: import `pollStreamState` from `state-indexer.mjs`
- Unit tests: `cd api && npm test` (covers analytics + indexer pure logic)

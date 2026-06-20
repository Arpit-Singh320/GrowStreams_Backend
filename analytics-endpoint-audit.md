# Analytics Endpoint Audit

- Generated: **2026-06-20T14:26:51.241Z**
- Base URL: `http://127.0.0.1:1337/api/analytics`
- Endpoint count: **14**

This file captures raw backend `/api/analytics` responses for quality analysis
and frontend integration. Each section documents what the endpoint provides.

## `/summary?days=30`

> Master dashboard payload. Sections: onchain{} (TVL, streams, volume, combined DAU/MAU/wallets), platform{} (users across both registration systems, quests, campaigns, engagement, seasons, evmStreams), kpis{} (flat headline numbers), freshness{}, coverage{}. Flat fields (tvl/activity/users/quests/...) are kept as backward-compatible aliases.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/summary?days=30'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/summary?days=30'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/tvl`

> Live on-chain TVL. totals.estimatedUsd + per-token rows (balanceDisplay, price, pricingSource, deployed, source). meta.tokensNotDeployedOnChain lists undeployed tokens. wVARA+gVARA+native VARA priced as vara-network.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/tvl'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/tvl'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/defillama-tvl`

> DeFiLlama-shaped TVL: balances keyed coingecko:id (raw, decimal-adjusted), excluded[] / unpriced[] arrays, timetravel:false, methodology. Consumed by the DeFiLlama TVL adapter.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/defillama-tvl'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/defillama-tvl'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/onchain-streams`

> On-chain stream activity reconstructed from StreamCore state polling (contract emits no events). Streaming-specific (totalStreams, streamWallets, streamDau/Mau, totalVolumeUsd, byToken[]) PLUS on-chain XP/seeds activity (seedsActiveWalletsAllTime, seedsDau/Mau) PLUS combined exact-union (uniqueWallets, dau, mau). streamDataSource = stream_state_db | live_rpc_enumeration.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/onchain-streams'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/onchain-streams'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/defillama-volume`

> DeFiLlama-shaped streaming volume: cumulative volume keyed coingecko:id (raw token units), totalVolumeUsd, timetravel:false, methodology. Consumed by the DeFiLlama volume (dimension) adapter.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/defillama-volume'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/defillama-volume'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/activity?days=30`

> Backend-logged + state-derived activity window. transactionCount, uniqueWallets (window), activeWalletsAllTime, registeredUsers, dau, volumeUsd{last24h/7d/30d}. Source label indicates on_chain vs backend fallback.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/activity?days=30'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/activity?days=30'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/history?hours=168`

> Hourly protocol snapshots time-series (TVL, streams, observed activity) from analytics_protocol_snapshots.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/history?hours=168'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/history?hours=168'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/tvl-history?days=30`

> Daily TVL series for the dashboard chart (tvl_usd, stablecoin_tvl_usd, snapped_at).

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/tvl-history?days=30'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/tvl-history?days=30'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/activity-history?days=30`

> Daily on-chain activity series for dashboard graphs: onchain_volume_usd, onchain_unique_wallets, onchain_dau, onchain_mau, seeds_active_wallets, stream_wallets, total_streams. From analytics_protocol_snapshots.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/activity-history?days=30'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/activity-history?days=30'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/volume-history?days=30`

> Daily volume series (points[] of date + volumeUsd) with source/coverage labels.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/volume-history?days=30'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/volume-history?days=30'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/contracts`

> Resolved program IDs for the core contracts (streamCore, tokenVault, growToken, ...).

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/contracts'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/contracts'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/explorer-links`

> Explorer URLs per contract (idea.gear-tech.io) for the dashboard contract links section.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/explorer-links'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/explorer-links'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/transactions?limit=10&offset=0`

> Recent transactions feed across stream/vault/bridge/XP-mint sources, each with on-chain explorerUrl (idea.gear-tech.io). On-chain XP mints (seeds_ledger, source:xp_mint) are included with verifiable tx hashes. Server-side pagination: limit + offset + total + hasMore.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/transactions?limit=10&offset=0'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/transactions?limit=10&offset=0'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```

## `/wallets?limit=10&offset=0`

> Active wallets list (wallet, handles, stream/vault/bridge counts, lastActivity), test/QA accounts excluded. Server-side pagination: limit + offset + total + hasMore.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/wallets?limit=10&offset=0'
```

- Status: **`ERROR`**

```
Command failed: curl -sS -w '\n%{http_code}' 'http://127.0.0.1:1337/api/analytics/wallets?limit=10&offset=0'
curl: (7) Failed to connect to 127.0.0.1 port 1337 after 0 ms: Couldn't connect to server

```


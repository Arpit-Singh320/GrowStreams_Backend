# Analytics Endpoint Audit

- Generated: **2026-06-18T18:10:02.948Z**
- Base URL: `http://127.0.0.1:1337/api/analytics`
- Endpoint count: **10**

This file captures raw backend `/api/analytics` responses for quality analysis.

## `/summary?days=30`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/summary?days=30'
```

- Status: **`200`**

```json
{
  "generatedAt": "2026-06-18T18:09:59.492Z",
  "contracts": {
    "streamCore": "0xfbd656f8082749bc4d8949718d539b5affd76f3004857f889d73fba61013cfe4",
    "tokenVault": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
    "growToken": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
    "splitsRouter": "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45",
    "distributionPool": "0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70",
    "liquidationManager": "0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3"
  },
  "explorerLinks": [
    {
      "key": "streamCore",
      "name": "StreamCore",
      "address": "0xfbd656f8082749bc4d8949718d539b5affd76f3004857f889d73fba61013cfe4",
      "explorerUrl": "https://idea.gear-tech.io/programs/0xfbd656f8082749bc4d8949718d539b5affd76f3004857f889d73fba61013cfe4?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "tokenVault",
      "name": "TokenVault",
      "address": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "growToken",
      "name": "Grow Token",
      "address": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "splitsRouter",
      "name": "SplitsRouter",
      "address": "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "distributionPool",
      "name": "DistributionPool",
      "address": "0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "liquidationManager",
      "name": "LiquidationManager",
      "address": "0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    }
  ],
  "protocol": {
    "totalStreams": 2,
    "activeStreams": 2
  },
  "tvl": {
    "vaultAddress": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
    "pricing": {
      "source": "stablecoins_marked_at_$1_only",
      "coverage": "stablecoins_only"
    },
    "totals": {
      "estimatedUsd": 0,
      "estimatedStablecoinUsd": 0
    },
    "tokens": [
      {
        "key": "WUSDC",
        "symbol": "USDC",
        "name": "USD Coin",
        "address": "0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48",
        "category": "stablecoin",
        "isStablecoin": true,
        "decimals": 6,
        "balanceRaw": "0",
        "balanceDisplay": "0",
        "estimatedUsd": null,
        "pricingSource": null,
        "error": "8000: Runtime error: \"Internal error: entered unreachable code 'Failed to get last message from the queue'\""
      },
      {
        "key": "WUSDT",
        "symbol": "USDT",
        "name": "Tether USD",
        "address": "0x464511231a1afe9108a689ed3dbbb047ca308d6f5dfb86453e4df5612a2d668a",
        "category": "stablecoin",
        "isStablecoin": true,
        "decimals": 6,
        "balanceRaw": "0",
        "balanceDisplay": "0",
        "estimatedUsd": null,
        "pricingSource": null,
        "error": "8000: Runtime error: \"Internal error: entered unreachable code 'Failed to get last message from the queue'\""
      },
      {
        "key": "WETH",
        "symbol": "WETH",
        "name": "Wrapped Ether",
        "address": "0xba764e2836b28806be10fe6f674d89d1e0c86898d25728f776588f03bddc6f58",
        "category": "volatile",
        "isStablecoin": false,
        "decimals": 18,
        "balanceRaw": "0",
        "balanceDisplay": "0",
        "estimatedUsd": null,
        "pricingSource": null,
        "error": "8000: Runtime error: \"Internal error: entered unreachable code 'Failed to get last message from the queue'\""
      },
      {
        "key": "WBTC",
        "symbol": "WBTC",
        "name": "Wrapped Bitcoin",
        "address": "0xc1ec06d99efcffd863f9c2ad2bc76f656aff861acf06f438046c64e5b41e3fd9",
        "category": "volatile",
        "isStablecoin": false,
        "decimals": 8,
        "balanceRaw": "0",
        "balanceDisplay": "0",
        "estimatedUsd": null,
        "pricingSource": null,
        "error": "8000: Runtime error: \"Internal error: entered unreachable code 'Failed to get last message from the queue'\""
      },
      {
        "key": "GROW",
        "symbol": "GROW",
        "name": "GrowStreams Token",
        "address": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
        "category": "utility",
        "isStablecoin": false,
        "decimals": 12,
        "balanceRaw": "0",
        "balanceDisplay": "0",
        "estimatedUsd": null,
        "pricingSource": null
      },
      {
        "key": "WTVARA",
        "symbol": "wVARA",
        "name": "Wrapped VARA",
        "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
        "category": "native",
        "isStablecoin": false,
        "decimals": 12,
        "balanceRaw": "189801937500022",
        "balanceDisplay": "189.801937500022",
        "estimatedUsd": null,
        "pricingSource": null
      },
      {
        "key": "VARA",
        "symbol": "VARA",
        "name": "Vara",
        "address": "native",
        "category": "native",
        "isStablecoin": false,
        "decimals": 12,
        "balanceRaw": "155000000000000",
        "balanceDisplay": "155",
        "estimatedUsd": null,
        "pricingSource": null
      }
    ]
  },
  "activity": {
    "available": true,
    "windowDays": 30,
    "source": "backend_command_logs_fallback",
    "capturesPayloadSignedTransactions": false,
    "transactionCount": 29,
    "streamEventCount": 20,
    "vaultEventCount": 9,
    "bridgeTransactionCount": 0,
    "uniqueWallets": 68,
    "observedWithdrawVolumeUsd": 100,
    "volumeUsd": {
      "last24h": 100,
      "last7d": 100,
      "last30d": 100
    },
    "dau": 0,
    "totalTransactions": 29,
    "uniqueWalletsAllTime": 68,
    "lastObservedActivityAt": "2026-06-18T16:48:24.236Z",
    "lastUpdatedAt": "2026-06-18T16:48:24.236Z"
  },
  "users": {
    "totalRegistered": 68,
    "available": true
  },
  "quests": {
    "registrations": 1791,
    "completions": 8082,
    "seedsDistributed": 8026,
    "available": true
  },
  "contributors": {
    "participants": 27,
    "contributions": 46,
    "xpEvents": 84,
    "available": true
  },
  "campaigns": {
    "participants": 27,
    "payouts": 25,
    "available": true
  },
  "kpis": {
    "tvlUsd": 0,
    "volumeUsd": {
      "last24h": 100,
      "last7d": 100,
      "last30d": 100
    },
    "dau": 0,
    "totalTransactions": 29,
    "uniqueWalletsAllTime": 68,
    "totalRegisteredUsers": 68,
    "questRegistrations": 1791,
    "questCompletions": 8082,
    "contributorCount": 27
  },
  "freshness": {
    "lastUpdatedAt": "2026-06-18T18:00:01.427Z",
    "lastSnapshotAt": "2026-06-18T18:00:01.427Z",
    "lastEventAt": "2026-06-18T16:48:24.236Z",
    "snapshotAgeSeconds": 597,
    "isStale": false,
    "indexerRunning": false
  },
  "coverage": {
    "tvlSource": "onchain_token_vault_balances",
    "streamCountsSource": "onchain_stream_core_queries",
    "activitySource": "backend_command_logs_fallback",
    "usersSource": "users_table",
    "notes": [
      "TVL is authoritative for token-vault holdings on-chain.",
      "USD estimates currently cover stablecoins only.",
      "Volume includes all token types from stream withdrawals, vault deposits/withdrawals, and completed bridge transfers.",
      "Activity metrics are temporarily using backend-command log fallback until the on-chain event indexer has authoritative rows.",
      "User metrics reflect total registered users from the users table.",
      "Quest metrics include registrations, completions, and seeds distributed.",
      "Contributor metrics include participants, contributions, and XP events.",
      "Campaign metrics include participants and payouts."
    ]
  }
}
```

## `/tvl`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/tvl'
```

- Status: **`200`**

```json
{
  "vaultAddress": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
  "pricing": {
    "source": "stablecoins_marked_at_$1_only",
    "coverage": "stablecoins_only"
  },
  "totals": {
    "estimatedUsd": 0,
    "estimatedStablecoinUsd": 0
  },
  "tokens": [
    {
      "key": "WUSDC",
      "symbol": "USDC",
      "name": "USD Coin",
      "address": "0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48",
      "category": "stablecoin",
      "isStablecoin": true,
      "decimals": 6,
      "balanceRaw": "0",
      "balanceDisplay": "0",
      "estimatedUsd": null,
      "pricingSource": null,
      "error": "8000: Runtime error: \"Internal error: entered unreachable code 'Failed to get last message from the queue'\""
    },
    {
      "key": "WUSDT",
      "symbol": "USDT",
      "name": "Tether USD",
      "address": "0x464511231a1afe9108a689ed3dbbb047ca308d6f5dfb86453e4df5612a2d668a",
      "category": "stablecoin",
      "isStablecoin": true,
      "decimals": 6,
      "balanceRaw": "0",
      "balanceDisplay": "0",
      "estimatedUsd": null,
      "pricingSource": null,
      "error": "8000: Runtime error: \"Internal error: entered unreachable code 'Failed to get last message from the queue'\""
    },
    {
      "key": "WETH",
      "symbol": "WETH",
      "name": "Wrapped Ether",
      "address": "0xba764e2836b28806be10fe6f674d89d1e0c86898d25728f776588f03bddc6f58",
      "category": "volatile",
      "isStablecoin": false,
      "decimals": 18,
      "balanceRaw": "0",
      "balanceDisplay": "0",
      "estimatedUsd": null,
      "pricingSource": null,
      "error": "8000: Runtime error: \"Internal error: entered unreachable code 'Failed to get last message from the queue'\""
    },
    {
      "key": "WBTC",
      "symbol": "WBTC",
      "name": "Wrapped Bitcoin",
      "address": "0xc1ec06d99efcffd863f9c2ad2bc76f656aff861acf06f438046c64e5b41e3fd9",
      "category": "volatile",
      "isStablecoin": false,
      "decimals": 8,
      "balanceRaw": "0",
      "balanceDisplay": "0",
      "estimatedUsd": null,
      "pricingSource": null,
      "error": "8000: Runtime error: \"Internal error: entered unreachable code 'Failed to get last message from the queue'\""
    },
    {
      "key": "GROW",
      "symbol": "GROW",
      "name": "GrowStreams Token",
      "address": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
      "category": "utility",
      "isStablecoin": false,
      "decimals": 12,
      "balanceRaw": "0",
      "balanceDisplay": "0",
      "estimatedUsd": null,
      "pricingSource": null
    },
    {
      "key": "WTVARA",
      "symbol": "wVARA",
      "name": "Wrapped VARA",
      "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
      "category": "native",
      "isStablecoin": false,
      "decimals": 12,
      "balanceRaw": "189801937500022",
      "balanceDisplay": "189.801937500022",
      "estimatedUsd": null,
      "pricingSource": null
    },
    {
      "key": "VARA",
      "symbol": "VARA",
      "name": "Vara",
      "address": "native",
      "category": "native",
      "isStablecoin": false,
      "decimals": 12,
      "balanceRaw": "155000000000000",
      "balanceDisplay": "155",
      "estimatedUsd": null,
      "pricingSource": null
    }
  ]
}
```

## `/activity?days=30`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/activity?days=30'
```

- Status: **`200`**

```json
{
  "available": true,
  "windowDays": 30,
  "source": "backend_command_logs_fallback",
  "capturesPayloadSignedTransactions": false,
  "transactionCount": 29,
  "streamEventCount": 20,
  "vaultEventCount": 9,
  "bridgeTransactionCount": 0,
  "uniqueWallets": 68,
  "observedWithdrawVolumeUsd": 100,
  "volumeUsd": {
    "last24h": 100,
    "last7d": 100,
    "last30d": 100
  },
  "dau": 0,
  "totalTransactions": 29,
  "uniqueWalletsAllTime": 68,
  "lastObservedActivityAt": "2026-06-18T16:48:24.236Z",
  "lastUpdatedAt": "2026-06-18T16:48:24.236Z"
}
```

## `/history?hours=168`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/history?hours=168'
```

- Status: **`200`**

```json
{
  "available": true,
  "lookbackHours": 168,
  "snapshots": [
    {
      "snapped_at": "2026-06-18T08:38:13.032Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 2,
      "active_streams": 2,
      "observed_stream_event_count": 20,
      "observed_vault_event_count": 8,
      "observed_unique_wallets": 2,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "api_event_logs_only",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": null
    },
    {
      "snapped_at": "2026-06-18T10:00:03.140Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 2,
      "active_streams": 2,
      "observed_stream_event_count": 20,
      "observed_vault_event_count": 8,
      "observed_unique_wallets": 2,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "on_chain_event_indexer",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": null
    },
    {
      "snapped_at": "2026-06-18T11:00:03.111Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 2,
      "active_streams": 2,
      "observed_stream_event_count": 20,
      "observed_vault_event_count": 8,
      "observed_unique_wallets": 2,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 28,
      "unique_wallets_all_time": 2,
      "last_activity_at": "2026-06-13T10:09:19.726Z",
      "last_updated_at": "2026-06-18T10:00:03.140Z"
    },
    {
      "snapped_at": "2026-06-18T12:00:02.783Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 2,
      "active_streams": 2,
      "observed_stream_event_count": 20,
      "observed_vault_event_count": 8,
      "observed_unique_wallets": 2,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 28,
      "unique_wallets_all_time": 2,
      "last_activity_at": "2026-06-13T10:09:19.726Z",
      "last_updated_at": "2026-06-18T11:00:03.111Z"
    },
    {
      "snapped_at": "2026-06-18T13:00:03.550Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 2,
      "active_streams": 2,
      "observed_stream_event_count": 20,
      "observed_vault_event_count": 8,
      "observed_unique_wallets": 2,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 28,
      "unique_wallets_all_time": 2,
      "last_activity_at": "2026-06-13T10:09:19.726Z",
      "last_updated_at": "2026-06-18T12:00:02.783Z"
    },
    {
      "snapped_at": "2026-06-18T17:00:02.904Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 2,
      "active_streams": 2,
      "observed_stream_event_count": 20,
      "observed_vault_event_count": 9,
      "observed_unique_wallets": 3,
      "observed_withdraw_volume_usd": "100.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "100.000000",
      "volume_7d_usd": "100.000000",
      "volume_30d_usd": "100.000000",
      "dau": 1,
      "total_transactions": 29,
      "unique_wallets_all_time": 3,
      "last_activity_at": "2026-06-18T16:48:24.236Z",
      "last_updated_at": "2026-06-18T16:48:24.236Z"
    },
    {
      "snapped_at": "2026-06-18T18:00:01.427Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 2,
      "active_streams": 2,
      "observed_stream_event_count": 20,
      "observed_vault_event_count": 9,
      "observed_unique_wallets": 68,
      "observed_withdraw_volume_usd": "100.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "100.000000",
      "volume_7d_usd": "100.000000",
      "volume_30d_usd": "100.000000",
      "dau": 0,
      "total_transactions": 29,
      "unique_wallets_all_time": 68,
      "last_activity_at": "2026-06-18T16:48:24.236Z",
      "last_updated_at": "2026-06-18T17:00:02.904Z"
    }
  ]
}
```

## `/tvl-history?days=30`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/tvl-history?days=30'
```

- Status: **`200`**

```json
{
  "available": true,
  "lookbackDays": 30,
  "points": [
    {
      "date": "2026-06-17T18:30:00.000Z",
      "tvl_usd": "0.000000",
      "stablecoin_tvl_usd": "0.000000",
      "snapped_at": "2026-06-18T18:00:01.427Z"
    }
  ]
}
```

## `/volume-history?days=30`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/volume-history?days=30'
```

- Status: **`200`**

```json
{
  "available": true,
  "lookbackDays": 30,
  "source": "backend_command_logs_fallback_plus_completed_bridge_transactions",
  "coverage": "stablecoin_stream_withdrawals_and_completed_bridge_transfers_only",
  "points": [
    {
      "date": "2026-06-18",
      "volumeUsd": 100
    }
  ]
}
```

## `/contracts`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/contracts'
```

- Status: **`200`**

```json
{
  "streamCore": "0xfbd656f8082749bc4d8949718d539b5affd76f3004857f889d73fba61013cfe4",
  "tokenVault": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
  "growToken": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
  "splitsRouter": "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45",
  "distributionPool": "0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70",
  "liquidationManager": "0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3"
}
```

## `/explorer-links`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/explorer-links'
```

- Status: **`200`**

```json
{
  "links": [
    {
      "key": "streamCore",
      "name": "StreamCore",
      "address": "0xfbd656f8082749bc4d8949718d539b5affd76f3004857f889d73fba61013cfe4",
      "explorerUrl": "https://idea.gear-tech.io/programs/0xfbd656f8082749bc4d8949718d539b5affd76f3004857f889d73fba61013cfe4?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "tokenVault",
      "name": "TokenVault",
      "address": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "growToken",
      "name": "Grow Token",
      "address": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "splitsRouter",
      "name": "SplitsRouter",
      "address": "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "distributionPool",
      "name": "DistributionPool",
      "address": "0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "liquidationManager",
      "name": "LiquidationManager",
      "address": "0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3?node=wss%3A%2F%2Frpc.vara.network",
      "network": "vara-mainnet"
    }
  ],
  "count": 6
}
```

## `/transactions?limit=10`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/transactions?limit=10'
```

- Status: **`200`**

```json
{
  "available": true,
  "transactions": [
    {
      "id": 9,
      "timestamp": "2026-06-18T16:48:24.236Z",
      "event_type": "deposit",
      "wallet": "0xUSER_ALPHA",
      "amount": "100000000000000",
      "token_symbol": "wVARA",
      "metadata": null,
      "block_hash": "0xc59a19eee2991e6683867d911a0567a92cb205dca5c2cd0c67afc23d097a46e7",
      "source": "vault",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0xc59a19eee2991e6683867d911a0567a92cb205dca5c2cd0c67afc23d097a46e7?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 20,
      "timestamp": "2026-06-13T10:08:19.949Z",
      "event_type": "created",
      "sender": null,
      "receiver": "0x0000000000000000000000000000000000000000000000000000000000000001",
      "amount": "3600000",
      "token_symbol": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "metadata": {
        "flowRateInterval": "second"
      },
      "block_hash": "0x9c8ea990d60d91fe976fa9ffb9b2f77bb08ffb3c05b7df55c98e3d47b011bde7",
      "source": "stream",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0x9c8ea990d60d91fe976fa9ffb9b2f77bb08ffb3c05b7df55c98e3d47b011bde7?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 19,
      "timestamp": "2026-06-13T10:01:43.513Z",
      "event_type": "created",
      "sender": null,
      "receiver": "0x0000000000000000000000000000000000000000000000000000000000000001",
      "amount": "3600000",
      "token_symbol": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "metadata": {
        "flowRateInterval": "second"
      },
      "block_hash": "0xd38ed81ee05dfca197a6cc06f00d3a5393855453d289c12ef820b8e34f2ea87f",
      "source": "stream",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0xd38ed81ee05dfca197a6cc06f00d3a5393855453d289c12ef820b8e34f2ea87f?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 13,
      "timestamp": "2026-06-13T08:47:52.448Z",
      "event_type": "created",
      "sender": null,
      "receiver": "0x0000000000000000000000000000000000000000000000000000000000000001",
      "amount": "3600000",
      "token_symbol": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "metadata": {
        "flowRateInterval": "second"
      },
      "block_hash": "0x3db6bcd0dc125a51a849c8045cb142bf6a861d3d555842d2991fc99b68e31d1e",
      "source": "stream",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0x3db6bcd0dc125a51a849c8045cb142bf6a861d3d555842d2991fc99b68e31d1e?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 7,
      "timestamp": "2026-06-13T08:45:19.426Z",
      "event_type": "created",
      "sender": null,
      "receiver": "0x0000000000000000000000000000000000000000000000000000000000000001",
      "amount": "3600000",
      "token_symbol": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "metadata": {
        "flowRateInterval": "second"
      },
      "block_hash": "0x4f13766604b993ad353799749cadcf9769d197baad9202fef506f194508479f2",
      "source": "stream",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0x4f13766604b993ad353799749cadcf9769d197baad9202fef506f194508479f2?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 1,
      "timestamp": "2026-06-13T08:43:01.516Z",
      "event_type": "created",
      "sender": null,
      "receiver": "0x0000000000000000000000000000000000000000000000000000000000000001",
      "amount": "3600000",
      "token_symbol": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "metadata": {
        "flowRateInterval": "second"
      },
      "block_hash": "0xe09e1fe476b720589aeac569b84df1562cb20445acd09d99039c34d0e7497347",
      "source": "stream",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0xe09e1fe476b720589aeac569b84df1562cb20445acd09d99039c34d0e7497347?node=wss%3A%2F%2Frpc.vara.network"
    }
  ],
  "count": 6,
  "note": "Transaction hashes not currently available in database schema"
}
```

## `/wallets?limit=10`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/wallets?limit=10'
```

- Status: **`200`**

```json
{
  "available": true,
  "wallets": [
    {
      "wallet": "0x064c4fb187267f2a3d47070351da5382610c6725803961d471bc16183677c56c",
      "githubHandle": null,
      "xHandle": "goldifiweb3",
      "displayName": "goldifiweb3",
      "registeredAt": "2026-04-09T17:33:12.381Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-09T17:33:12.381Z"
    },
    {
      "wallet": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "githubHandle": "gh-user",
      "xHandle": null,
      "displayName": "gh-user",
      "registeredAt": "2026-04-08T23:06:45.722Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-08T23:06:45.722Z"
    },
    {
      "wallet": "0x22b1e62d12f48e506ac0d81d9c9100c0310456e555f95144bea8850a001ff84a",
      "githubHandle": "zeel991",
      "xHandle": null,
      "displayName": "zeel991",
      "registeredAt": "2026-04-07T06:58:59.997Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-07T06:58:59.997Z"
    },
    {
      "wallet": "0xe8492c70af5aec707076d1c4d0f02cded226adf7b4fab995fbc5b4105d2e4901",
      "githubHandle": null,
      "xHandle": "prathmeshweb3",
      "displayName": "prathmeshweb3",
      "registeredAt": "2026-04-06T06:22:49.337Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-06T06:22:49.337Z"
    },
    {
      "wallet": "0xa6d5aa3dcf1d7f12a9fbb641ae8e603b3a92b0f8e9fd17b3894850ebcf710e33",
      "githubHandle": "rohan911438",
      "xHandle": null,
      "displayName": "rohan911438",
      "registeredAt": "2026-04-05T13:20:03.724Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-05T13:20:03.724Z"
    },
    {
      "wallet": "0x4eaa74b8716fffeecf7cfb08b03a9599ad2816d120781ced0adee14fc55cf949",
      "githubHandle": null,
      "xHandle": "SabenSoul",
      "displayName": "SabenSoul",
      "registeredAt": "2026-04-05T12:07:17.050Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-05T12:07:17.050Z"
    },
    {
      "wallet": "0x64b7b601fdcd1b5d7643faa6d4f0f1f1ce672356057038af8397dda5dd96962b",
      "githubHandle": "Anmol-345",
      "xHandle": null,
      "displayName": "Anmol-345",
      "registeredAt": "2026-04-05T11:13:39.937Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-05T11:13:39.937Z"
    },
    {
      "wallet": "0xb8ece92a20f1d9cd5be8a8278851114f619d5543b542d72830a5a2156e9ba151",
      "githubHandle": "Oltking",
      "xHandle": "ddevoure_",
      "displayName": "Oltking",
      "registeredAt": "2026-04-03T08:37:04.944Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-03T08:37:04.944Z"
    },
    {
      "wallet": "0x1afb3b7f0ab889b44db7ad37d0653cb36528d19262e8f8c9966dc5c7bcb00c1e",
      "githubHandle": null,
      "xHandle": "Shashwat_web3",
      "displayName": "Shashwat_web3",
      "registeredAt": "2026-04-02T08:47:55.740Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-02T08:47:55.740Z"
    },
    {
      "wallet": "0x868111d85b4c429dbf5f2d54111c580cd9bc12a53ac377760d89bfe2813e7410",
      "githubHandle": null,
      "xHandle": "Sar1hakkk",
      "displayName": "Sar1hakkk",
      "registeredAt": "2026-04-01T12:06:16.814Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-01T12:06:16.814Z"
    }
  ],
  "count": 10
}
```


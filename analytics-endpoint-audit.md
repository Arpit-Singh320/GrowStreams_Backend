# Analytics Endpoint Audit

- Generated: **2026-06-20T07:04:52.085Z**
- Base URL: `http://127.0.0.1:1337/api/analytics`
- Endpoint count: **11**

This file captures raw backend `/api/analytics` responses for quality analysis.

## `/summary?days=30`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/summary?days=30'
```

- Status: **`200`**

```json
{
  "generatedAt": "2026-06-20T07:04:49.761Z",
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
  "onchain": {
    "tvl": {
      "vaultAddress": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
      "pricing": {
        "source": "coingecko_realtime_pricing",
        "coverage": "live_onchain_balanceof_all_deployed_tokens_plus_native_vara",
        "liveMarketPriced": [
          "USDC",
          "USDT",
          "WETH",
          "WBTC",
          "wVARA",
          "gVARA",
          "VARA"
        ],
        "placeholderPriced": []
      },
      "totals": {
        "estimatedUsd": 0.099189,
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
          "estimatedUsd": 0,
          "pricingSource": "coingecko",
          "price": 0.99981,
          "deployed": false,
          "source": "contract_not_deployed"
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
          "estimatedUsd": 0,
          "pricingSource": "coingecko",
          "price": 0.998996,
          "deployed": false,
          "source": "contract_not_deployed"
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
          "estimatedUsd": 0,
          "pricingSource": "coingecko",
          "price": 1724.61,
          "deployed": false,
          "source": "contract_not_deployed"
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
          "estimatedUsd": 0,
          "pricingSource": "coingecko",
          "price": 63604,
          "deployed": false,
          "source": "contract_not_deployed"
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
          "estimatedUsd": 0,
          "pricingSource": "fallback_constant",
          "price": 0.01,
          "deployed": true,
          "source": "onchain_balanceof"
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
          "estimatedUsd": 0.098669,
          "pricingSource": "coingecko",
          "price": 0.00051985,
          "deployed": true,
          "source": "onchain_balanceof"
        },
        {
          "key": "gVARA",
          "symbol": "gVARA",
          "name": "Grow VARA (Native Super Token)",
          "address": "0x71de1ef1f4dec1a4fe862aa6c92747c8499bbf1af128625749027392709f4a72",
          "category": "native",
          "isStablecoin": false,
          "decimals": 12,
          "balanceRaw": "0",
          "balanceDisplay": "0",
          "estimatedUsd": 0,
          "pricingSource": "coingecko",
          "price": 0.00051985,
          "deployed": true,
          "source": "onchain_balanceof"
        },
        {
          "key": "VARA",
          "symbol": "VARA",
          "name": "Vara",
          "address": "native",
          "category": "native",
          "isStablecoin": false,
          "decimals": 12,
          "balanceRaw": "1000000000000",
          "balanceDisplay": "1",
          "estimatedUsd": 0.00052,
          "pricingSource": "coingecko",
          "price": 0.00051985,
          "deployed": true,
          "source": "onchain_native_balance"
        }
      ],
      "meta": {
        "tvlSource": "onchain_balanceof",
        "trackedTokenCount": 7,
        "deployedTokenCount": 3,
        "tokensNotDeployedOnChain": [
          "USDC",
          "USDT",
          "WETH",
          "WBTC"
        ],
        "reconciliation": {
          "source": "indexed_vault_events",
          "note": "Backend-logged deposits minus withdrawals. Non-authoritative; for drift detection only.",
          "estimatedUsd": 0.00052
        },
        "asOf": "2026-06-20T07:04:49.761Z"
      }
    },
    "streams": {
      "totalStreams": 3,
      "activeStreams": 3
    },
    "activity": {
      "source": "backend_command_logs_fallback",
      "capturesPayloadSignedTransactions": false,
      "transactionCount": 0,
      "uniqueWallets": 0,
      "dau": 0,
      "volumeUsd": {
        "last24h": 0,
        "last7d": 0,
        "last30d": 0
      },
      "note": "On-chain volume / DAU / unique-wallet counts await the chain event indexer (Task C); currently reflect backend-logged transactions only."
    }
  },
  "platform": {
    "users": {
      "totalDistinctWallets": 1818,
      "bySystem": {
        "campaignUsers": 31,
        "questParticipants": 1791,
        "contributors": 27
      },
      "note": "Campaign and Quest are separate registration systems; the same wallet may appear in both. totalDistinctWallets dedupes by wallet across all systems.",
      "available": true
    },
    "quests": {
      "registrations": 1791,
      "completions": 8064,
      "seedsDistributed": 1381350,
      "activeQuests": 10,
      "totalQuests": 41,
      "available": true
    },
    "campaigns": {
      "participants": 27,
      "payouts": 25,
      "activeCampaigns": 2,
      "totalCampaigns": 10,
      "likes": 658,
      "available": true
    },
    "engagement": {
      "invitesCreated": 6213,
      "invitesUsed": 1758,
      "referrals": 2,
      "vouchersIssued": 80,
      "campaignLikes": 658,
      "available": true
    },
    "contributors": {
      "participants": 27,
      "contributions": 46,
      "xpEvents": 84,
      "available": true
    },
    "seasons": {
      "active": 1,
      "total": 2,
      "available": true
    },
    "evmStreams": {
      "count": 1,
      "available": true
    },
    "dau": 2
  },
  "protocol": {
    "totalStreams": 3,
    "activeStreams": 3
  },
  "tvl": {
    "vaultAddress": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
    "pricing": {
      "source": "coingecko_realtime_pricing",
      "coverage": "live_onchain_balanceof_all_deployed_tokens_plus_native_vara",
      "liveMarketPriced": [
        "USDC",
        "USDT",
        "WETH",
        "WBTC",
        "wVARA",
        "gVARA",
        "VARA"
      ],
      "placeholderPriced": []
    },
    "totals": {
      "estimatedUsd": 0.099189,
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
        "estimatedUsd": 0,
        "pricingSource": "coingecko",
        "price": 0.99981,
        "deployed": false,
        "source": "contract_not_deployed"
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
        "estimatedUsd": 0,
        "pricingSource": "coingecko",
        "price": 0.998996,
        "deployed": false,
        "source": "contract_not_deployed"
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
        "estimatedUsd": 0,
        "pricingSource": "coingecko",
        "price": 1724.61,
        "deployed": false,
        "source": "contract_not_deployed"
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
        "estimatedUsd": 0,
        "pricingSource": "coingecko",
        "price": 63604,
        "deployed": false,
        "source": "contract_not_deployed"
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
        "estimatedUsd": 0,
        "pricingSource": "fallback_constant",
        "price": 0.01,
        "deployed": true,
        "source": "onchain_balanceof"
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
        "estimatedUsd": 0.098669,
        "pricingSource": "coingecko",
        "price": 0.00051985,
        "deployed": true,
        "source": "onchain_balanceof"
      },
      {
        "key": "gVARA",
        "symbol": "gVARA",
        "name": "Grow VARA (Native Super Token)",
        "address": "0x71de1ef1f4dec1a4fe862aa6c92747c8499bbf1af128625749027392709f4a72",
        "category": "native",
        "isStablecoin": false,
        "decimals": 12,
        "balanceRaw": "0",
        "balanceDisplay": "0",
        "estimatedUsd": 0,
        "pricingSource": "coingecko",
        "price": 0.00051985,
        "deployed": true,
        "source": "onchain_balanceof"
      },
      {
        "key": "VARA",
        "symbol": "VARA",
        "name": "Vara",
        "address": "native",
        "category": "native",
        "isStablecoin": false,
        "decimals": 12,
        "balanceRaw": "1000000000000",
        "balanceDisplay": "1",
        "estimatedUsd": 0.00052,
        "pricingSource": "coingecko",
        "price": 0.00051985,
        "deployed": true,
        "source": "onchain_native_balance"
      }
    ],
    "meta": {
      "tvlSource": "onchain_balanceof",
      "trackedTokenCount": 7,
      "deployedTokenCount": 3,
      "tokensNotDeployedOnChain": [
        "USDC",
        "USDT",
        "WETH",
        "WBTC"
      ],
      "reconciliation": {
        "source": "indexed_vault_events",
        "note": "Backend-logged deposits minus withdrawals. Non-authoritative; for drift detection only.",
        "estimatedUsd": 0.00052
      },
      "asOf": "2026-06-20T07:04:49.761Z"
    }
  },
  "activity": {
    "available": true,
    "windowDays": 30,
    "source": "backend_command_logs_fallback",
    "capturesPayloadSignedTransactions": false,
    "transactionCount": 0,
    "streamEventCount": 0,
    "vaultEventCount": 0,
    "bridgeTransactionCount": 0,
    "uniqueWallets": 0,
    "activeWalletsAllTime": 0,
    "registeredUsers": 31,
    "observedWithdrawVolumeUsd": 0,
    "volumeUsd": {
      "last24h": 0,
      "last7d": 0,
      "last30d": 0
    },
    "dau": 0,
    "totalTransactions": 0,
    "uniqueWalletsAllTime": 0,
    "lastObservedActivityAt": null,
    "lastUpdatedAt": null
  },
  "users": {
    "totalRegistered": 31,
    "totalDistinctWallets": 1818,
    "available": true
  },
  "quests": {
    "registrations": 1791,
    "completions": 8064,
    "seedsDistributed": 1381350,
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
    "tvlUsd": 0.099189,
    "volumeUsd": {
      "last24h": 0,
      "last7d": 0,
      "last30d": 0
    },
    "dau": 0,
    "platformDau": 2,
    "totalTransactions": 0,
    "uniqueWalletsAllTime": 0,
    "totalRegisteredUsers": 31,
    "totalDistinctWallets": 1818,
    "questParticipants": 1791,
    "questRegistrations": 1791,
    "questCompletions": 8064,
    "contributorCount": 27
  },
  "freshness": {
    "lastUpdatedAt": "2026-06-20T07:00:01.442Z",
    "lastSnapshotAt": "2026-06-20T07:00:01.442Z",
    "lastEventAt": null,
    "snapshotAgeSeconds": 287,
    "isStale": false,
    "indexerRunning": false
  },
  "coverage": {
    "tvlSource": "onchain_balanceof_live",
    "streamCountsSource": "onchain_stream_core_queries",
    "onchainActivitySource": "backend_command_logs_fallback",
    "platformUsersSource": "users + quest_registrations + participants (deduped by wallet, test-excluded)",
    "notes": [
      "Two domains are reported separately: onchain (DeFi / Vara chain) and platform (off-chain GrowStreams app).",
      "TVL is read live from on-chain VFT BalanceOf of the vault per deployed token, plus native VARA held by the vault.",
      "Tokens not yet deployed on Vara mainnet (reported as 0): USDC, USDT, WETH, WBTC.",
      "USD estimates use CoinGecko real-time pricing for all tokens with balances.",
      "On-chain volume / DAU / unique-wallet counts await the chain event indexer (Task C); they currently reflect backend-logged transactions only.",
      "GrowStreams has TWO independent registration systems that do not sync: Campaign (users table) and Quest (quest_registrations). The same wallet may exist in both. platform.users.totalDistinctWallets dedupes across both plus the contributor track.",
      "platform.dau counts distinct wallets with any off-chain action today (quest completions, seeds/XP); onchain.activity.dau counts on-chain transactions only.",
      "Quest metrics: registrations, verified completions, XP/seeds distributed, active quests. Engagement: invites, referrals, vouchers, campaign likes. Plus seasons and Vara.eth (EVM) streams."
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
    "source": "coingecko_realtime_pricing",
    "coverage": "live_onchain_balanceof_all_deployed_tokens_plus_native_vara",
    "liveMarketPriced": [
      "USDC",
      "USDT",
      "WETH",
      "WBTC",
      "wVARA",
      "gVARA",
      "VARA"
    ],
    "placeholderPriced": []
  },
  "totals": {
    "estimatedUsd": 0.099189,
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
      "estimatedUsd": 0,
      "pricingSource": "coingecko",
      "price": 0.99981,
      "deployed": false,
      "source": "contract_not_deployed"
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
      "estimatedUsd": 0,
      "pricingSource": "coingecko",
      "price": 0.998996,
      "deployed": false,
      "source": "contract_not_deployed"
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
      "estimatedUsd": 0,
      "pricingSource": "coingecko",
      "price": 1724.61,
      "deployed": false,
      "source": "contract_not_deployed"
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
      "estimatedUsd": 0,
      "pricingSource": "coingecko",
      "price": 63604,
      "deployed": false,
      "source": "contract_not_deployed"
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
      "estimatedUsd": 0,
      "pricingSource": "fallback_constant",
      "price": 0.01,
      "deployed": true,
      "source": "onchain_balanceof"
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
      "estimatedUsd": 0.098669,
      "pricingSource": "coingecko",
      "price": 0.00051985,
      "deployed": true,
      "source": "onchain_balanceof"
    },
    {
      "key": "gVARA",
      "symbol": "gVARA",
      "name": "Grow VARA (Native Super Token)",
      "address": "0x71de1ef1f4dec1a4fe862aa6c92747c8499bbf1af128625749027392709f4a72",
      "category": "native",
      "isStablecoin": false,
      "decimals": 12,
      "balanceRaw": "0",
      "balanceDisplay": "0",
      "estimatedUsd": 0,
      "pricingSource": "coingecko",
      "price": 0.00051985,
      "deployed": true,
      "source": "onchain_balanceof"
    },
    {
      "key": "VARA",
      "symbol": "VARA",
      "name": "Vara",
      "address": "native",
      "category": "native",
      "isStablecoin": false,
      "decimals": 12,
      "balanceRaw": "1000000000000",
      "balanceDisplay": "1",
      "estimatedUsd": 0.00052,
      "pricingSource": "coingecko",
      "price": 0.00051985,
      "deployed": true,
      "source": "onchain_native_balance"
    }
  ],
  "meta": {
    "tvlSource": "onchain_balanceof",
    "trackedTokenCount": 7,
    "deployedTokenCount": 3,
    "tokensNotDeployedOnChain": [
      "USDC",
      "USDT",
      "WETH",
      "WBTC"
    ],
    "reconciliation": {
      "source": "indexed_vault_events",
      "note": "Backend-logged deposits minus withdrawals. Non-authoritative; for drift detection only.",
      "estimatedUsd": 0.00052
    },
    "asOf": "2026-06-20T07:04:49.761Z"
  }
}
```

## `/defillama-tvl`

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/defillama-tvl'
```

- Status: **`200`**

```json
{
  "vaultAddress": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
  "chain": "vara",
  "balances": {
    "coingecko:vara-network": "190.801937500022"
  },
  "excluded": [
    {
      "symbol": "USDC",
      "address": "0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48",
      "reason": "contract_not_deployed"
    },
    {
      "symbol": "USDT",
      "address": "0x464511231a1afe9108a689ed3dbbb047ca308d6f5dfb86453e4df5612a2d668a",
      "reason": "contract_not_deployed"
    },
    {
      "symbol": "WETH",
      "address": "0xba764e2836b28806be10fe6f674d89d1e0c86898d25728f776588f03bddc6f58",
      "reason": "contract_not_deployed"
    },
    {
      "symbol": "WBTC",
      "address": "0xc1ec06d99efcffd863f9c2ad2bc76f656aff861acf06f438046c64e5b41e3fd9",
      "reason": "contract_not_deployed"
    },
    {
      "symbol": "GROW",
      "address": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
      "reason": "platform_token_excluded"
    }
  ],
  "methodology": "TVL is the live on-chain token balance held by the GrowStreams TokenVault on Vara Network (VFT BalanceOf of the vault per token) plus native VARA held by the vault. GROW token is excluded as it is a platform/utility token with no public market. TVL reflects only VARA, wVARA, and gVARA (the actual streaming value). Balances are read from current chain state and keyed by CoinGecko asset id for DeFiLlama pricing.",
  "timetravel": false,
  "asOf": "2026-06-20T07:04:49.761Z"
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
  "transactionCount": 0,
  "streamEventCount": 0,
  "vaultEventCount": 0,
  "bridgeTransactionCount": 0,
  "uniqueWallets": 0,
  "activeWalletsAllTime": 0,
  "registeredUsers": 31,
  "observedWithdrawVolumeUsd": 0,
  "volumeUsd": {
    "last24h": 0,
    "last7d": 0,
    "last30d": 0
  },
  "dau": 0,
  "totalTransactions": 0,
  "uniqueWalletsAllTime": 0,
  "lastObservedActivityAt": null,
  "lastUpdatedAt": null
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
      "snapped_at": "2026-06-19T21:00:03.023Z",
      "estimated_tvl_usd": "0.179070",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-19T21:00:01.345Z"
    },
    {
      "snapped_at": "2026-06-19T22:00:01.155Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-19T21:00:03.023Z"
    },
    {
      "snapped_at": "2026-06-19T22:00:02.882Z",
      "estimated_tvl_usd": "0.179204",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-19T22:00:01.155Z"
    },
    {
      "snapped_at": "2026-06-19T23:00:01.493Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-19T22:00:02.882Z"
    },
    {
      "snapped_at": "2026-06-19T23:00:02.927Z",
      "estimated_tvl_usd": "0.175929",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-19T22:00:02.882Z"
    },
    {
      "snapped_at": "2026-06-20T00:00:00.950Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-19T23:00:02.927Z"
    },
    {
      "snapped_at": "2026-06-20T00:00:02.639Z",
      "estimated_tvl_usd": "0.179221",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-19T23:00:02.927Z"
    },
    {
      "snapped_at": "2026-06-20T01:00:01.392Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T00:00:02.639Z"
    },
    {
      "snapped_at": "2026-06-20T01:00:02.869Z",
      "estimated_tvl_usd": "0.175963",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T01:00:01.392Z"
    },
    {
      "snapped_at": "2026-06-20T02:00:00.837Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T01:00:02.869Z"
    },
    {
      "snapped_at": "2026-06-20T02:00:03.142Z",
      "estimated_tvl_usd": "0.179248",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T02:00:00.837Z"
    },
    {
      "snapped_at": "2026-06-20T03:00:01.473Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T02:00:03.142Z"
    },
    {
      "snapped_at": "2026-06-20T03:00:02.936Z",
      "estimated_tvl_usd": "0.176014",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T02:00:03.142Z"
    },
    {
      "snapped_at": "2026-06-20T04:00:00.811Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T03:00:02.936Z"
    },
    {
      "snapped_at": "2026-06-20T05:00:01.240Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T04:00:00.811Z"
    },
    {
      "snapped_at": "2026-06-20T06:00:00.645Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T05:00:01.240Z"
    },
    {
      "snapped_at": "2026-06-20T07:00:01.211Z",
      "estimated_tvl_usd": "0.000000",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T06:00:00.645Z"
    },
    {
      "snapped_at": "2026-06-20T07:00:01.442Z",
      "estimated_tvl_usd": "0.099189",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 3,
      "active_streams": 3,
      "observed_stream_event_count": 0,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 0,
      "observed_withdraw_volume_usd": "0.000000",
      "observed_window_days": 30,
      "observed_volume_source": "backend_command_logs_fallback",
      "volume_24h_usd": "0.000000",
      "volume_7d_usd": "0.000000",
      "volume_30d_usd": "0.000000",
      "dau": 0,
      "total_transactions": 0,
      "unique_wallets_all_time": 0,
      "last_activity_at": null,
      "last_updated_at": "2026-06-20T06:00:00.645Z"
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
      "date": "2026-06-18T18:30:00.000Z",
      "tvl_usd": "0.175929",
      "stablecoin_tvl_usd": "0.000000",
      "snapped_at": "2026-06-19T23:00:02.927Z"
    },
    {
      "date": "2026-06-19T18:30:00.000Z",
      "tvl_usd": "0.099189",
      "stablecoin_tvl_usd": "0.000000",
      "snapped_at": "2026-06-20T07:00:01.442Z"
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
  "points": []
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
  "transactions": [],
  "count": 0,
  "note": "Explorer links use extrinsic_hash (transaction hash). Existing transactions may not have extrinsic_hash populated - new transactions will have working explorer links."
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
      "wallet": "0x0000000000000000000000000000000000000000000000000000000000000001",
      "githubHandle": "test",
      "xHandle": null,
      "displayName": "test",
      "registeredAt": "2026-04-08T23:06:38.772Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-04-08T23:06:38.772Z"
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
    }
  ],
  "count": 10
}
```


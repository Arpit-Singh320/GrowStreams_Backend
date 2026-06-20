# Analytics Endpoint Audit

- Generated: **2026-06-20T14:51:18.624Z**
- Base URL: `http://127.0.0.1:1337/api/analytics`
- Endpoint count: **14**

This file captures raw backend `/api/analytics` responses for quality analysis
and frontend integration. Each section documents what the endpoint provides.

## `/summary?days=30`

> Master dashboard payload. Sections: onchain{} (TVL, streams, volume, combined DAU/MAU/wallets), platform{} (users across both registration systems, quests, campaigns, engagement, seasons, evmStreams), kpis{} (flat headline numbers), freshness{}, coverage{}. Flat fields (tvl/activity/users/quests/...) are kept as backward-compatible aliases.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/summary?days=30'
```

- Status: **`200`**

```json
{
  "generatedAt": "2026-06-20T14:51:16.519Z",
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
        "estimatedUsd": 0.099791,
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
          "price": 0.999841,
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
          "price": 0.998955,
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
          "price": 1734.01,
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
          "price": 63849,
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
          "estimatedUsd": 0.098699,
          "pricingSource": "coingecko",
          "price": 0.00052001,
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
          "price": 0.00052001,
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
          "balanceRaw": "2100000000000",
          "balanceDisplay": "2.1",
          "estimatedUsd": 0.001092,
          "pricingSource": "coingecko",
          "price": 0.00052001,
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
          "estimatedUsd": 0.001092
        },
        "asOf": "2026-06-20T14:51:16.518Z"
      }
    },
    "streams": {
      "totalStreams": 3,
      "activeStreams": 3
    },
    "activity": {
      "source": "onchain_state_polling",
      "uniqueWallets": 1180,
      "dau": 9,
      "mau": 362,
      "totalStreams": 3,
      "activeStreams": 3,
      "volumeUsd": 0.031201,
      "byToken": [
        {
          "symbol": "wVARA",
          "streamedRaw": "60000000000000",
          "streamedDisplay": "60",
          "price": 0.00052001,
          "pricingSource": "coingecko",
          "volumeUsd": 0.031201
        }
      ],
      "streaming": {
        "wallets": 2,
        "dau": 0,
        "mau": 2
      },
      "xpSeeds": {
        "activeWalletsAllTime": 1180,
        "dau": 9,
        "mau": 362
      },
      "note": "On-chain activity from two verifiable sources: StreamCore state (streams/volume; contract emits no events so polled) and quest-seeds Mint txs (XP, recorded in seeds_ledger with on-chain tx_hash). Volume = sum of live per-stream `streamed`.",
      "backendLogged": {
        "transactionCount": 0,
        "source": "backend_command_logs_fallback"
      }
    }
  },
  "platform": {
    "users": {
      "totalDistinctWallets": 1818,
      "bySystem": {
        "campaignUsers": 34,
        "questParticipants": 1791,
        "contributors": 27
      },
      "note": "Campaign and Quest are separate registration systems; the same wallet may appear in both. totalDistinctWallets dedupes by wallet across all systems.",
      "available": true
    },
    "quests": {
      "registrations": 1791,
      "completions": 8071,
      "seedsDistributed": 1382750,
      "activeQuests": 10,
      "totalQuests": 41,
      "available": true
    },
    "campaigns": {
      "participants": 27,
      "payouts": 25,
      "activeCampaigns": 2,
      "totalCampaigns": 10,
      "likes": 660,
      "available": true
    },
    "engagement": {
      "invitesCreated": 6213,
      "invitesUsed": 1758,
      "referrals": 2,
      "vouchersIssued": 81,
      "campaignLikes": 660,
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
    "dau": 9
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
      "estimatedUsd": 0.099791,
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
        "price": 0.999841,
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
        "price": 0.998955,
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
        "price": 1734.01,
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
        "price": 63849,
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
        "estimatedUsd": 0.098699,
        "pricingSource": "coingecko",
        "price": 0.00052001,
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
        "price": 0.00052001,
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
        "balanceRaw": "2100000000000",
        "balanceDisplay": "2.1",
        "estimatedUsd": 0.001092,
        "pricingSource": "coingecko",
        "price": 0.00052001,
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
        "estimatedUsd": 0.001092
      },
      "asOf": "2026-06-20T14:51:16.518Z"
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
    "registeredUsers": 34,
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
    "totalRegistered": 34,
    "totalDistinctWallets": 1818,
    "available": true
  },
  "quests": {
    "registrations": 1791,
    "completions": 8071,
    "seedsDistributed": 1382750,
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
    "tvlUsd": 0.099791,
    "onchainVolumeUsd": 0.031201,
    "totalStreams": 3,
    "activeStreams": 3,
    "uniqueStreamWallets": 2,
    "onchainActiveWallets": 1180,
    "onchainDau": 9,
    "onchainMau": 362,
    "platformDau": 9,
    "totalRegisteredUsers": 34,
    "totalDistinctWallets": 1818,
    "questParticipants": 1791,
    "questRegistrations": 1791,
    "questCompletions": 8071,
    "contributorCount": 27,
    "backendLoggedVolumeUsd": {
      "last24h": 0,
      "last7d": 0,
      "last30d": 0
    }
  },
  "freshness": {
    "lastUpdatedAt": "2026-06-20T14:25:07.145Z",
    "lastSnapshotAt": "2026-06-20T14:25:07.145Z",
    "lastEventAt": null,
    "snapshotAgeSeconds": 1567,
    "isStale": false,
    "indexerRunning": true
  },
  "coverage": {
    "tvlSource": "onchain_balanceof_live",
    "streamCountsSource": "onchain_stream_core_queries",
    "onchainActivitySource": "onchain_state_polling",
    "onchainActivityNote": "Streams/volume/wallets/DAU/MAU reconstructed by polling StreamCore state; the contract emits no events (see docs/BLOCKER-onchain-events-and-fees.md). Protocol-fee KPI still blocked (no fee logic on-chain).",
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

> Live on-chain TVL. totals.estimatedUsd + per-token rows (balanceDisplay, price, pricingSource, deployed, source). meta.tokensNotDeployedOnChain lists undeployed tokens. wVARA+gVARA+native VARA priced as vara-network.

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
    "estimatedUsd": 0.099791,
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
      "price": 0.999841,
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
      "price": 0.998955,
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
      "price": 1734.01,
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
      "price": 63849,
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
      "estimatedUsd": 0.098699,
      "pricingSource": "coingecko",
      "price": 0.00052001,
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
      "price": 0.00052001,
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
      "balanceRaw": "2100000000000",
      "balanceDisplay": "2.1",
      "estimatedUsd": 0.001092,
      "pricingSource": "coingecko",
      "price": 0.00052001,
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
      "estimatedUsd": 0.001092
    },
    "asOf": "2026-06-20T14:51:16.518Z"
  }
}
```

## `/defillama-tvl`

> DeFiLlama-shaped TVL: balances keyed coingecko:id (raw, decimal-adjusted), excluded[] / unpriced[] arrays, timetravel:false, methodology. Consumed by the DeFiLlama TVL adapter.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/defillama-tvl'
```

- Status: **`200`**

```json
{
  "vaultAddress": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
  "chain": "vara",
  "balances": {
    "coingecko:vara-network": "191.901937500022"
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
  "asOf": "2026-06-20T14:51:16.518Z"
}
```

## `/onchain-streams`

> On-chain stream activity reconstructed from StreamCore state polling (contract emits no events). Streaming-specific (totalStreams, streamWallets, streamDau/Mau, totalVolumeUsd, byToken[]) PLUS on-chain XP/seeds activity (seedsActiveWalletsAllTime, seedsDau/Mau) PLUS combined exact-union (uniqueWallets, dau, mau). streamDataSource = stream_state_db | live_rpc_enumeration.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/onchain-streams'
```

- Status: **`200`**

```json
{
  "available": true,
  "source": "onchain_state_polling",
  "note": "On-chain activity from two verifiable sources: StreamCore state (streams/volume; contract emits no events so polled) and quest-seeds Mint txs (XP, recorded in seeds_ledger with on-chain tx_hash). Volume = sum of live per-stream `streamed`.",
  "streamDataSource": "stream_state_db",
  "totalStreams": 3,
  "activeStreams": 3,
  "scannedStreams": 3,
  "scanErrors": 0,
  "streamWallets": 2,
  "streamDau": 0,
  "streamMau": 2,
  "totalVolumeUsd": 0.031201,
  "byToken": [
    {
      "symbol": "wVARA",
      "streamedRaw": "60000000000000",
      "streamedDisplay": "60",
      "price": 0.00052001,
      "pricingSource": "coingecko",
      "volumeUsd": 0.031201
    }
  ],
  "seedsActiveWalletsAllTime": 1180,
  "seedsDau": 9,
  "seedsMau": 362,
  "dau": 9,
  "mau": 362,
  "uniqueWallets": 1180,
  "asOf": "2026-06-20T14:51:16.272Z"
}
```

## `/defillama-volume`

> DeFiLlama-shaped streaming volume: cumulative volume keyed coingecko:id (raw token units), totalVolumeUsd, timetravel:false, methodology. Consumed by the DeFiLlama volume (dimension) adapter.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/defillama-volume'
```

- Status: **`200`**

```json
{
  "chain": "vara",
  "totalVolume": {
    "coingecko:vara-network": "60"
  },
  "totalVolumeUsd": 0.031201,
  "unpriced": [],
  "streamCount": 3,
  "methodology": "Streaming volume is the cumulative value streamed through the GrowStreams protocol on Vara, computed as the sum of each stream's live `streamed` amount (settled + accrued) read from StreamCore state, keyed by CoinGecko asset id (gVARA/wVARA priced as VARA). The contract emits no events, so values are reconstructed from on-chain contract state.",
  "timetravel": false,
  "asOf": "2026-06-20T14:51:16.272Z"
}
```

## `/activity?days=30`

> Backend-logged + state-derived activity window. transactionCount, uniqueWallets (window), activeWalletsAllTime, registeredUsers, dau, volumeUsd{last24h/7d/30d}. Source label indicates on_chain vs backend fallback.

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
  "registeredUsers": 34,
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

> Hourly protocol snapshots time-series (TVL, streams, observed activity) from analytics_protocol_snapshots.

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
    },
    {
      "snapped_at": "2026-06-20T08:00:00.627Z",
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
      "last_updated_at": "2026-06-20T07:00:01.442Z"
    },
    {
      "snapped_at": "2026-06-20T08:00:03.494Z",
      "estimated_tvl_usd": "0.097355",
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
      "last_updated_at": "2026-06-20T08:00:00.627Z"
    },
    {
      "snapped_at": "2026-06-20T09:00:01.811Z",
      "estimated_tvl_usd": "0.099741",
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
      "last_updated_at": "2026-06-20T08:00:03.494Z"
    },
    {
      "snapped_at": "2026-06-20T09:00:03.400Z",
      "estimated_tvl_usd": "0.099741",
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
      "last_updated_at": "2026-06-20T08:00:03.494Z"
    },
    {
      "snapped_at": "2026-06-20T10:00:01.419Z",
      "estimated_tvl_usd": "0.097902",
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
      "last_updated_at": "2026-06-20T09:00:03.400Z"
    },
    {
      "snapped_at": "2026-06-20T10:00:04.704Z",
      "estimated_tvl_usd": "0.097902",
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
      "last_updated_at": "2026-06-20T10:00:01.419Z"
    },
    {
      "snapped_at": "2026-06-20T11:00:01.529Z",
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
      "last_updated_at": "2026-06-20T10:00:04.704Z"
    },
    {
      "snapped_at": "2026-06-20T11:00:03.295Z",
      "estimated_tvl_usd": "0.097902",
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
      "last_updated_at": "2026-06-20T10:00:04.704Z"
    },
    {
      "snapped_at": "2026-06-20T12:00:01.533Z",
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
      "last_updated_at": "2026-06-20T11:00:03.295Z"
    },
    {
      "snapped_at": "2026-06-20T13:00:02.047Z",
      "estimated_tvl_usd": "0.099741",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 0,
      "active_streams": 0,
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
      "last_updated_at": "2026-06-20T12:00:01.533Z"
    },
    {
      "snapped_at": "2026-06-20T13:00:03.125Z",
      "estimated_tvl_usd": "0.099741",
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
      "last_updated_at": "2026-06-20T12:00:01.533Z"
    },
    {
      "snapped_at": "2026-06-20T14:00:01.778Z",
      "estimated_tvl_usd": "0.101658",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 0,
      "active_streams": 0,
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
      "last_updated_at": "2026-06-20T13:00:03.125Z"
    },
    {
      "snapped_at": "2026-06-20T14:25:07.145Z",
      "estimated_tvl_usd": "0.099791",
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
      "last_updated_at": "2026-06-20T14:00:01.778Z"
    }
  ]
}
```

## `/tvl-history?days=30`

> Daily TVL series for the dashboard chart (tvl_usd, stablecoin_tvl_usd, snapped_at).

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
      "tvl_usd": "0.099791",
      "stablecoin_tvl_usd": "0.000000",
      "snapped_at": "2026-06-20T14:25:07.145Z"
    }
  ]
}
```

## `/activity-history?days=30`

> Daily on-chain activity series for dashboard graphs: onchain_volume_usd, onchain_unique_wallets, onchain_dau, onchain_mau, seeds_active_wallets, stream_wallets, total_streams. From analytics_protocol_snapshots.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/activity-history?days=30'
```

- Status: **`200`**

```json
{
  "available": true,
  "lookbackDays": 30,
  "points": [
    {
      "date": "2026-06-18T18:30:00.000Z",
      "snapped_at": "2026-06-19T23:00:02.927Z",
      "tvl_usd": "0.175929",
      "onchain_volume_usd": "0.000000",
      "onchain_unique_wallets": 0,
      "onchain_dau": 0,
      "onchain_mau": 0,
      "seeds_active_wallets": 0,
      "stream_wallets": 0,
      "total_streams": 3,
      "active_streams": 3
    },
    {
      "date": "2026-06-19T18:30:00.000Z",
      "snapped_at": "2026-06-20T14:25:07.145Z",
      "tvl_usd": "0.099791",
      "onchain_volume_usd": "0.031201",
      "onchain_unique_wallets": 1180,
      "onchain_dau": 9,
      "onchain_mau": 362,
      "seeds_active_wallets": 1180,
      "stream_wallets": 2,
      "total_streams": 3,
      "active_streams": 3
    }
  ]
}
```

## `/volume-history?days=30`

> Daily volume series (points[] of date + volumeUsd) with source/coverage labels.

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

> Resolved program IDs for the core contracts (streamCore, tokenVault, growToken, ...).

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

> Explorer URLs per contract (idea.gear-tech.io) for the dashboard contract links section.

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

## `/transactions?limit=10&offset=0`

> Recent transactions feed across stream/vault/bridge/XP-mint sources, each with on-chain explorerUrl (idea.gear-tech.io). On-chain XP mints (seeds_ledger, source:xp_mint) are included with verifiable tx hashes. Server-side pagination: limit + offset + total + hasMore.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/transactions?limit=10&offset=0'
```

- Status: **`200`**

```json
{
  "available": true,
  "transactions": [
    {
      "id": 11418,
      "timestamp": "2026-06-20T14:17:02.544Z",
      "event_type": "mint",
      "wallet": "0x1640228651c2e9950a02666b5c6713dffa8fbd1097837ff576189e86d929fb2a",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0xc11dbd51c6da96d2c0fc8c83fe6c56b46a326ba272793c9c89a8b466c8dbc7c5",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0xc11dbd51c6da96d2c0fc8c83fe6c56b46a326ba272793c9c89a8b466c8dbc7c5?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11417,
      "timestamp": "2026-06-20T14:00:06.050Z",
      "event_type": "mint",
      "wallet": "0x7c83c8173e4c3f0b98c207d05c208f47e192e61c79c5766c29cf4062f6134c53",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0x5dd058d0b5d968c0415d080e34c12d0f199ae4f09ceccb99a632ff0f73de8236",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0x5dd058d0b5d968c0415d080e34c12d0f199ae4f09ceccb99a632ff0f73de8236?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11416,
      "timestamp": "2026-06-20T13:57:35.361Z",
      "event_type": "mint",
      "wallet": "0x484e71041453f1224e50cae044b61ff5b2ebc228c1199aa76dd97b2e02784837",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0x50d79aefef24e71ba6f74d3e766317d96882b9f98064f738bfd7dd9685e45be0",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0x50d79aefef24e71ba6f74d3e766317d96882b9f98064f738bfd7dd9685e45be0?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11415,
      "timestamp": "2026-06-20T13:53:19.512Z",
      "event_type": "mint",
      "wallet": "0x4cdab021438b549133a8a78126cc6d2edde2d620af83e4457fb0f8c790a8471e",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0xada7ecd386a8fc3dc30fd2cbc7015a0facc77161dfbfcb55ef1d9df91c3a7e6b",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0xada7ecd386a8fc3dc30fd2cbc7015a0facc77161dfbfcb55ef1d9df91c3a7e6b?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11414,
      "timestamp": "2026-06-20T13:40:19.248Z",
      "event_type": "mint",
      "wallet": "0xac95b08d7f152358bf66c2f076b391c0ea42af4aa9c198ef7a38531906752e2d",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0xf0a8a5544436cb886bec678a9de1ad61151af53fbc356c4c7755c56fff0ad814",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0xf0a8a5544436cb886bec678a9de1ad61151af53fbc356c4c7755c56fff0ad814?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11413,
      "timestamp": "2026-06-20T13:09:28.118Z",
      "event_type": "mint",
      "wallet": "0x2a5808c88efb0790943900ac4e403d2111a9beed4f1ce77381c0381d3737df75",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0x21559bd38bfe5f6815cc9f1b100c64ae18df1cb232e340bd450a3054ad6b078d",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0x21559bd38bfe5f6815cc9f1b100c64ae18df1cb232e340bd450a3054ad6b078d?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11412,
      "timestamp": "2026-06-20T11:09:39.244Z",
      "event_type": "mint",
      "wallet": "0xa000d5c3483dbbaed4f95d1696a12195f9dab0171a8c94a270eb237ee17f725b",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0x0f704321159bdd8c771026511f8cbe98d0e9b74a89aae3b113c67aabc675bc45",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0x0f704321159bdd8c771026511f8cbe98d0e9b74a89aae3b113c67aabc675bc45?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11411,
      "timestamp": "2026-06-20T04:20:06.767Z",
      "event_type": "mint",
      "wallet": "0x6c30ad3928db91a66f11fe640716e55ab067403b90678ff8a00b241827251e7b",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0x0ecb563863ba3243087236668cd074f2756ad9a2ec3d1c12ee1d23930f5d8339",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0x0ecb563863ba3243087236668cd074f2756ad9a2ec3d1c12ee1d23930f5d8339?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11410,
      "timestamp": "2026-06-20T03:19:32.375Z",
      "event_type": "mint",
      "wallet": "0xf85abf3f1fd440c25cedcc5f3aab35fff9d047b6d19598b86c952bc3074aaf68",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0xcbf44ab0be1f1707342234e76073cc6bb0eabe1570cb1e5b0699820631ff73bf",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0xcbf44ab0be1f1707342234e76073cc6bb0eabe1570cb1e5b0699820631ff73bf?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11409,
      "timestamp": "2026-06-19T23:14:14.931Z",
      "event_type": "mint",
      "wallet": "0xd4a5fb8326bb9d4dd6fa34e60fc5c2f18e8b677b39908e78907df89b0948bd67",
      "amount": 200,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0x9675dc24917c22982d410437e3448da7b82255cd54fbd49f4b3b7db41277bebb",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/extrinsics/0x9675dc24917c22982d410437e3448da7b82255cd54fbd49f4b3b7db41277bebb?node=wss%3A%2F%2Frpc.vara.network"
    }
  ],
  "count": 10,
  "total": 8071,
  "limit": 10,
  "offset": 0,
  "hasMore": true,
  "note": "Includes on-chain XP mints (seeds_ledger) with verifiable explorer links. explorerUrl points to idea.gear-tech.io for any row with a transaction hash."
}
```

## `/wallets?limit=10&offset=0`

> Active wallets list (wallet, handles, stream/vault/bridge counts, lastActivity), test/QA accounts excluded. Server-side pagination: limit + offset + total + hasMore.

```bash
curl -sS 'http://127.0.0.1:1337/api/analytics/wallets?limit=10&offset=0'
```

- Status: **`200`**

```json
{
  "available": true,
  "wallets": [
    {
      "wallet": "0xda988c70253663bc24bf42543aa6404089842f17d6c2f13c137789af3a76ff7d",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0xda988c7025",
      "registeredAt": "2026-06-20T14:37:37.146Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-20T14:37:37.146Z"
    },
    {
      "wallet": "0xbe8c4bd1fb489c0a3813b8b873eba93cb2cf936d39ef1651c37526652603bb2a",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0xbe8c4bd1fb",
      "registeredAt": "2026-06-20T14:22:21.987Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-20T14:22:21.987Z"
    },
    {
      "wallet": "0x1640228651c2e9950a02666b5c6713dffa8fbd1097837ff576189e86d929fb2a",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0x1640228651",
      "registeredAt": "2026-06-20T14:16:39.541Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-20T14:16:39.541Z"
    },
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
    }
  ],
  "count": 10,
  "total": 34,
  "limit": 10,
  "offset": 0,
  "hasMore": true
}
```


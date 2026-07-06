# Analytics Endpoint Audit

- Generated: **2026-06-23T00:13:56.290Z**
- Base URL: `https://www.growstreams.xyz/api/analytics`
- Endpoint count: **14**

This file captures raw backend `/api/analytics` responses for quality analysis
and frontend integration. Each section documents what the endpoint provides.

## `/summary?days=30`

> Master dashboard payload. Sections: onchain{} (TVL, streams, volume, combined DAU/MAU/wallets), platform{} (users across both registration systems, quests, campaigns, engagement, seasons, evmStreams), kpis{} (flat headline numbers), freshness{}, coverage{}. Flat fields (tvl/activity/users/quests/...) are kept as backward-compatible aliases.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/summary?days=30'
```

- Status: **`200`**

```json
{
  "generatedAt": "2026-06-23T00:13:40.856Z",
  "contracts": {
    "streamCore": "0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659",
    "tokenVault": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
    "liveStreamCoreVault": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
    "tokenVaultConfiguredStreamCore": "0xba0901f3ef665e956d8ab721686d97d2e5473092df34baf229e87ac826eadc4a",
    "growToken": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
    "gvaraToken": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
    "wvaraToken": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
    "questSeeds": "0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d",
    "splitsRouter": "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45",
    "distributionPool": "0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70",
    "liquidationManager": "0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3",
    "contractWiring": {
      "streamCoreUsesConfiguredVault": false,
      "tokenVaultUsesConfiguredStreamCore": false
    }
  },
  "explorerLinks": [
    {
      "key": "streamCore",
      "name": "StreamCore",
      "address": "0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "tokenVault",
      "name": "TokenVault",
      "address": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "growToken",
      "name": "Grow Token",
      "address": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "gvaraToken",
      "name": "gVARA",
      "address": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "wvaraToken",
      "name": "wVARA",
      "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
      "explorerUrl": "https://idea.gear-tech.io/programs/0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "questSeeds",
      "name": "Quest Seeds",
      "address": "0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d",
      "explorerUrl": "https://idea.gear-tech.io/programs/0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "splitsRouter",
      "name": "SplitsRouter",
      "address": "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "distributionPool",
      "name": "DistributionPool",
      "address": "0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "liquidationManager",
      "name": "LiquidationManager",
      "address": "0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    }
  ],
  "onchain": {
    "tvl": {
      "vaultAddress": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
      "pricing": {
        "source": "coingecko_realtime_pricing",
        "coverage": "wrapper_total_supply_plus_native_vara",
        "varaPriceUsd": 0.00053853,
        "varaPriceSource": "coingecko",
        "liveMarketPriced": [
          "wVARA",
          "gVARA",
          "VARA"
        ],
        "placeholderPriced": []
      },
      "totals": {
        "estimatedUsd": 6.275032,
        "estimatedStablecoinUsd": 0
      },
      "tokens": [
        {
          "key": "WTVARA",
          "symbol": "wVARA",
          "name": "Wrapped VARA",
          "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
          "category": "native",
          "isStablecoin": false,
          "decimals": 12,
          "balanceRaw": "10460000000000000",
          "balanceDisplay": "10460",
          "estimatedUsd": 5.633024,
          "pricingSource": "coingecko",
          "price": 0.00053853,
          "deployed": true,
          "source": "onchain_total_supply"
        },
        {
          "key": "gVARA",
          "symbol": "gVARA",
          "name": "Grow VARA (Native Super Token)",
          "address": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
          "category": "native",
          "isStablecoin": false,
          "decimals": 12,
          "balanceRaw": "1191150000000000",
          "balanceDisplay": "1191.15",
          "estimatedUsd": 0.64147,
          "pricingSource": "coingecko",
          "price": 0.00053853,
          "deployed": true,
          "source": "onchain_total_supply"
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
          "estimatedUsd": 0.000539,
          "pricingSource": "coingecko",
          "price": 0.00053853,
          "deployed": true,
          "source": "onchain_native_balance"
        }
      ],
      "meta": {
        "tvlSource": "wrapper_total_supply_plus_native_vara",
        "vaultAddressSource": "resolved_program_ids",
        "configuredVaultAddress": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
        "liveStreamCoreVaultAddress": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
        "trackedTokenCount": 3,
        "deployedTokenCount": 3,
        "tokensNotDeployedOnChain": [],
        "varaFamilyComponents": [
          {
            "symbol": "wVARA",
            "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
            "balanceRaw": "10460000000000000",
            "balanceDisplay": "10460",
            "varaPriceUsd": 0.00053853,
            "estimatedUsd": 5.633024,
            "source": "onchain_total_supply"
          },
          {
            "symbol": "gVARA",
            "address": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
            "balanceRaw": "1191150000000000",
            "balanceDisplay": "1191.15",
            "varaPriceUsd": 0.00053853,
            "estimatedUsd": 0.64147,
            "source": "onchain_total_supply"
          },
          {
            "symbol": "VARA",
            "address": "native",
            "balanceRaw": "1000000000000",
            "balanceDisplay": "1",
            "varaPriceUsd": 0.00053853,
            "estimatedUsd": 0.000539,
            "source": "onchain_native_balance"
          }
        ],
        "aggregateVaraEquivalentRaw": "11652150000000000",
        "aggregateVaraEquivalentDisplay": "11652.15",
        "reconciliation": {
          "source": "indexed_vault_events",
          "note": "Backend-logged deposits minus withdrawals. Non-authoritative; for drift detection only.",
          "estimatedUsd": 0.000539
        },
        "asOf": "2026-06-23T00:13:40.638Z"
      }
    },
    "streams": {
      "totalStreams": 55,
      "activeStreams": 53
    },
    "activity": {
      "source": "onchain_state_polling",
      "uniqueWallets": 1201,
      "dau": 0,
      "mau": 361,
      "totalStreams": 55,
      "activeStreams": 53,
      "volumeUsd": 0.118498,
      "byToken": [
        {
          "symbol": "wVARA",
          "streamedRaw": "220040653102092",
          "streamedDisplay": "220.040653102092",
          "price": 0.00053853,
          "pricingSource": "coingecko",
          "volumeUsd": 0.118498
        }
      ],
      "streaming": {
        "wallets": 47,
        "dau": 0,
        "mau": 47
      },
      "xpSeeds": {
        "activeWalletsAllTime": 1186,
        "dau": 0,
        "mau": 346
      },
      "note": "On-chain activity from two verifiable sources: StreamCore state (streams/volume; contract emits no events so polled) and quest-seeds Mint txs (XP, recorded in seeds_ledger with on-chain tx_hash). Volume = sum of live per-stream `streamed`.",
      "backendLogged": {
        "transactionCount": 83,
        "source": "on_chain_event_indexer"
      }
    },
    "fees": {
      "available": true,
      "windowDays": 30,
      "source": "explorer_api_fee_events",
      "feeBps": 250,
      "feePercent": 2.5,
      "totalEvents": 57,
      "last24hEvents": 45,
      "last7dEvents": 57,
      "last30dEvents": 57,
      "totalFeesUsd": 0.005414,
      "last24hUsd": 0.005065,
      "last7dUsd": 0.005414,
      "last30dUsd": 0.005414,
      "byToken": [
        {
          "symbol": "gVARA",
          "amountRaw": "10053525000000",
          "amountDisplay": "10.053525",
          "price": 0.00053853,
          "feesUsd": 0.005414
        }
      ],
      "note": "Protocol fee (2.5%) collected on stream create/deposit across all paths — vault/VFT, native VARA, and gVARA super-token streams. Sourced from on-chain FeeCollected events or explorer fallback when index data is absent."
    },
    "retention": {
      "available": true,
      "windowDays": 30,
      "source": "on_chain_event_indexer",
      "retentionRate": 0,
      "cohortWallets": 0,
      "retainedWallets": 0,
      "cohorts": [],
      "note": "A wallet is retained if it transacts again 24h–30d after first on-chain activity. Only cohorts with a complete 30-day window are counted."
    }
  },
  "platform": {
    "users": {
      "totalDistinctWallets": 1825,
      "bySystem": {
        "campaignUsers": 128,
        "questParticipants": 1792,
        "contributors": 27
      },
      "note": "Campaign and Quest are separate registration systems; the same wallet may appear in both. totalDistinctWallets dedupes by wallet across all systems.",
      "available": true
    },
    "quests": {
      "registrations": 1792,
      "completions": 8157,
      "seedsDistributed": 1395000,
      "activeQuests": 10,
      "totalQuests": 41,
      "available": true
    },
    "campaigns": {
      "participants": 27,
      "payouts": 25,
      "activeCampaigns": 2,
      "totalCampaigns": 10,
      "likes": 670,
      "available": true
    },
    "engagement": {
      "invitesCreated": 8213,
      "invitesUsed": 1759,
      "referrals": 2,
      "vouchersIssued": 114,
      "campaignLikes": 670,
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
    "dau": 0
  },
  "protocol": {
    "totalStreams": 55,
    "activeStreams": 53
  },
  "tvl": {
    "vaultAddress": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
    "pricing": {
      "source": "coingecko_realtime_pricing",
      "coverage": "wrapper_total_supply_plus_native_vara",
      "varaPriceUsd": 0.00053853,
      "varaPriceSource": "coingecko",
      "liveMarketPriced": [
        "wVARA",
        "gVARA",
        "VARA"
      ],
      "placeholderPriced": []
    },
    "totals": {
      "estimatedUsd": 6.275032,
      "estimatedStablecoinUsd": 0
    },
    "tokens": [
      {
        "key": "WTVARA",
        "symbol": "wVARA",
        "name": "Wrapped VARA",
        "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
        "category": "native",
        "isStablecoin": false,
        "decimals": 12,
        "balanceRaw": "10460000000000000",
        "balanceDisplay": "10460",
        "estimatedUsd": 5.633024,
        "pricingSource": "coingecko",
        "price": 0.00053853,
        "deployed": true,
        "source": "onchain_total_supply"
      },
      {
        "key": "gVARA",
        "symbol": "gVARA",
        "name": "Grow VARA (Native Super Token)",
        "address": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
        "category": "native",
        "isStablecoin": false,
        "decimals": 12,
        "balanceRaw": "1191150000000000",
        "balanceDisplay": "1191.15",
        "estimatedUsd": 0.64147,
        "pricingSource": "coingecko",
        "price": 0.00053853,
        "deployed": true,
        "source": "onchain_total_supply"
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
        "estimatedUsd": 0.000539,
        "pricingSource": "coingecko",
        "price": 0.00053853,
        "deployed": true,
        "source": "onchain_native_balance"
      }
    ],
    "meta": {
      "tvlSource": "wrapper_total_supply_plus_native_vara",
      "vaultAddressSource": "resolved_program_ids",
      "configuredVaultAddress": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
      "liveStreamCoreVaultAddress": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
      "trackedTokenCount": 3,
      "deployedTokenCount": 3,
      "tokensNotDeployedOnChain": [],
      "varaFamilyComponents": [
        {
          "symbol": "wVARA",
          "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
          "balanceRaw": "10460000000000000",
          "balanceDisplay": "10460",
          "varaPriceUsd": 0.00053853,
          "estimatedUsd": 5.633024,
          "source": "onchain_total_supply"
        },
        {
          "symbol": "gVARA",
          "address": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
          "balanceRaw": "1191150000000000",
          "balanceDisplay": "1191.15",
          "varaPriceUsd": 0.00053853,
          "estimatedUsd": 0.64147,
          "source": "onchain_total_supply"
        },
        {
          "symbol": "VARA",
          "address": "native",
          "balanceRaw": "1000000000000",
          "balanceDisplay": "1",
          "varaPriceUsd": 0.00053853,
          "estimatedUsd": 0.000539,
          "source": "onchain_native_balance"
        }
      ],
      "aggregateVaraEquivalentRaw": "11652150000000000",
      "aggregateVaraEquivalentDisplay": "11652.15",
      "reconciliation": {
        "source": "indexed_vault_events",
        "note": "Backend-logged deposits minus withdrawals. Non-authoritative; for drift detection only.",
        "estimatedUsd": 0.000539
      },
      "asOf": "2026-06-23T00:13:40.638Z"
    }
  },
  "activity": {
    "available": true,
    "windowDays": 30,
    "source": "on_chain_event_indexer",
    "capturesPayloadSignedTransactions": true,
    "transactionCount": 83,
    "streamEventCount": 83,
    "vaultEventCount": 0,
    "bridgeTransactionCount": 0,
    "uniqueWallets": 47,
    "activeWalletsAllTime": 47,
    "registeredUsers": 128,
    "observedWithdrawVolumeUsd": 0.003439,
    "volumeUsd": {
      "last24h": 0.002625,
      "last7d": 0.003439,
      "last30d": 0.003439
    },
    "dau": 0,
    "totalTransactions": 83,
    "uniqueWalletsAllTime": 47,
    "lastObservedActivityAt": "2026-06-22T22:11:45.774Z",
    "lastUpdatedAt": "2026-06-22T22:11:45.774Z",
    "note": "Observed activity windows come from indexed/backend-logged transaction tables. This endpoint reflects windowed event activity, while /summary on-chain volume comes from live StreamCore state polling plus on-chain quest-seeds mint activity."
  },
  "users": {
    "totalRegistered": 1823,
    "totalDistinctWallets": 1825,
    "available": true,
    "note": "totalRegistered counts wallets registered in the users + quest_registrations systems. totalDistinctWallets is broader and dedupes across users, quest_registrations, and contributor participants."
  },
  "quests": {
    "registrations": 1792,
    "completions": 8157,
    "seedsDistributed": 1395000,
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
    "tvlUsd": 6.275032,
    "protocolFeesUsd": 0.005414,
    "protocolFees24hUsd": 0.005065,
    "protocolFees30dUsd": 0.005414,
    "retentionRate": 0,
    "onchainVolumeUsd": 0.118498,
    "totalStreams": 55,
    "activeStreams": 53,
    "uniqueStreamWallets": 47,
    "onchainActiveWallets": 1201,
    "onchainDau": 0,
    "onchainMau": 361,
    "platformDau": 0,
    "totalRegisteredUsers": 1823,
    "totalDistinctWallets": 1825,
    "questParticipants": 1792,
    "questRegistrations": 1792,
    "questCompletions": 8157,
    "contributorCount": 27,
    "backendLoggedVolumeUsd": {
      "last24h": 0.002625,
      "last7d": 0.003439,
      "last30d": 0.003439
    }
  },
  "freshness": {
    "lastUpdatedAt": "2026-06-23T00:00:03.132Z",
    "lastSnapshotAt": "2026-06-23T00:00:03.132Z",
    "lastEventAt": "2026-06-22T22:11:45.774Z",
    "snapshotAgeSeconds": 816,
    "isStale": false,
    "indexerRunning": true
  },
  "coverage": {
    "tvlSource": "wrapper_total_supply_plus_native_vara",
    "streamCountsSource": "onchain_stream_core_queries",
    "onchainActivitySource": "onchain_state_polling",
    "onchainActivityNote": "Streams/volume/wallets/DAU/MAU are reconstructed from live StreamCore state polling plus on-chain quest-seeds mint activity from seeds_ledger. Protocol fees are sourced from FeeCollected events via the indexer or explorer fallback.",
    "platformUsersSource": "users + quest_registrations + participants (deduped by wallet, test-excluded)",
    "notes": [
      "Two domains are reported separately: onchain (DeFi / Vara chain) and platform (off-chain GrowStreams app).",
      "TVL is read live from wrapper contract total supply for wVARA and gVARA, plus native VARA held by the configured TokenVault account.",
      "Contract wiring mismatch detected: configured TokenVault (0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9) differs from StreamCore-linked vault (0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef).",
      "All tracked token contracts are deployed on-chain.",
      "USD estimates use CoinGecko real-time pricing for all tokens with balances.",
      "On-chain activity includes payload-signed transactions captured via the chain event indexer.",
      "Windowed /activity volume is derived from indexed/backend-logged events. /summary.onchain.activity.volumeUsd is the live cumulative streamed value from StreamCore state and will not match /activity windows exactly.",
      "XP mint explorer links point to the quest-seeds program messages page: https://idea.gear-tech.io/programs/0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d?node=wss://rpc.vara.network.",
      "Protocol fee KPI is active and currently sourced from explorer_api_fee_events.",
      "Historical snapshot endpoints return persisted rows as recorded at snapshot time; older points are not backfilled after contract migrations or methodology changes.",
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
curl -sS 'https://www.growstreams.xyz/api/analytics/tvl'
```

- Status: **`200`**

```json
{
  "vaultAddress": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
  "pricing": {
    "source": "coingecko_realtime_pricing",
    "coverage": "wrapper_total_supply_plus_native_vara",
    "varaPriceUsd": 0.00053853,
    "varaPriceSource": "coingecko",
    "liveMarketPriced": [
      "wVARA",
      "gVARA",
      "VARA"
    ],
    "placeholderPriced": []
  },
  "totals": {
    "estimatedUsd": 6.275032,
    "estimatedStablecoinUsd": 0
  },
  "tokens": [
    {
      "key": "WTVARA",
      "symbol": "wVARA",
      "name": "Wrapped VARA",
      "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
      "category": "native",
      "isStablecoin": false,
      "decimals": 12,
      "balanceRaw": "10460000000000000",
      "balanceDisplay": "10460",
      "estimatedUsd": 5.633024,
      "pricingSource": "coingecko",
      "price": 0.00053853,
      "deployed": true,
      "source": "onchain_total_supply"
    },
    {
      "key": "gVARA",
      "symbol": "gVARA",
      "name": "Grow VARA (Native Super Token)",
      "address": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
      "category": "native",
      "isStablecoin": false,
      "decimals": 12,
      "balanceRaw": "1191150000000000",
      "balanceDisplay": "1191.15",
      "estimatedUsd": 0.64147,
      "pricingSource": "coingecko",
      "price": 0.00053853,
      "deployed": true,
      "source": "onchain_total_supply"
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
      "estimatedUsd": 0.000539,
      "pricingSource": "coingecko",
      "price": 0.00053853,
      "deployed": true,
      "source": "onchain_native_balance"
    }
  ],
  "meta": {
    "tvlSource": "wrapper_total_supply_plus_native_vara",
    "vaultAddressSource": "resolved_program_ids",
    "configuredVaultAddress": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
    "liveStreamCoreVaultAddress": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
    "trackedTokenCount": 3,
    "deployedTokenCount": 3,
    "tokensNotDeployedOnChain": [],
    "varaFamilyComponents": [
      {
        "symbol": "wVARA",
        "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
        "balanceRaw": "10460000000000000",
        "balanceDisplay": "10460",
        "varaPriceUsd": 0.00053853,
        "estimatedUsd": 5.633024,
        "source": "onchain_total_supply"
      },
      {
        "symbol": "gVARA",
        "address": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
        "balanceRaw": "1191150000000000",
        "balanceDisplay": "1191.15",
        "varaPriceUsd": 0.00053853,
        "estimatedUsd": 0.64147,
        "source": "onchain_total_supply"
      },
      {
        "symbol": "VARA",
        "address": "native",
        "balanceRaw": "1000000000000",
        "balanceDisplay": "1",
        "varaPriceUsd": 0.00053853,
        "estimatedUsd": 0.000539,
        "source": "onchain_native_balance"
      }
    ],
    "aggregateVaraEquivalentRaw": "11652150000000000",
    "aggregateVaraEquivalentDisplay": "11652.15",
    "reconciliation": {
      "source": "indexed_vault_events",
      "note": "Backend-logged deposits minus withdrawals. Non-authoritative; for drift detection only.",
      "estimatedUsd": 0.000539
    },
    "asOf": "2026-06-23T00:13:40.638Z"
  }
}
```

## `/defillama-tvl`

> DeFiLlama-shaped TVL: balances keyed coingecko:id (raw, decimal-adjusted), excluded[] / unpriced[] arrays, timetravel:false, methodology. Consumed by the DeFiLlama TVL adapter.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/defillama-tvl'
```

- Status: **`200`**

```json
{
  "vaultAddress": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
  "chain": "vara",
  "balances": {
    "coingecko:vara-network": "11652.15"
  },
  "components": [
    {
      "symbol": "wVARA",
      "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
      "balanceRaw": "10460000000000000",
      "balanceDisplay": "10460",
      "varaPriceUsd": 0.00053853,
      "estimatedUsd": 5.633024,
      "source": "onchain_total_supply"
    },
    {
      "symbol": "gVARA",
      "address": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
      "balanceRaw": "1191150000000000",
      "balanceDisplay": "1191.15",
      "varaPriceUsd": 0.00053853,
      "estimatedUsd": 0.64147,
      "source": "onchain_total_supply"
    },
    {
      "symbol": "VARA",
      "address": "native",
      "balanceRaw": "1000000000000",
      "balanceDisplay": "1",
      "varaPriceUsd": 0.00053853,
      "estimatedUsd": 0.000539,
      "source": "onchain_native_balance"
    }
  ],
  "varaPriceUsd": 0.00053853,
  "excluded": [],
  "methodology": "TVL is the live on-chain total supply of the VARA wrapper contracts (gVARA and wVARA) plus native VARA held by the configured TokenVault account. GROW token is excluded as it is a platform/utility token with no public market. TVL reflects only VARA, wVARA, and gVARA (the actual streaming value). Balances are read from current chain state and keyed by CoinGecko asset id for DeFiLlama pricing.",
  "timetravel": false,
  "asOf": "2026-06-23T00:13:40.638Z"
}
```

## `/onchain-streams`

> On-chain stream activity reconstructed from StreamCore state polling (contract emits no events). Streaming-specific (totalStreams, streamWallets, streamDau/Mau, totalVolumeUsd, byToken[]) PLUS on-chain XP/seeds activity (seedsActiveWalletsAllTime, seedsDau/Mau) PLUS combined exact-union (uniqueWallets, dau, mau). streamDataSource = stream_state_db | live_rpc_enumeration.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/onchain-streams'
```

- Status: **`200`**

```json
{
  "available": true,
  "source": "onchain_state_polling",
  "note": "On-chain activity from two verifiable sources: StreamCore state (streams/volume; contract emits no events so polled) and quest-seeds Mint txs (XP, recorded in seeds_ledger with on-chain tx_hash). Volume = sum of live per-stream `streamed`.",
  "streamDataSource": "stream_state_db",
  "totalStreams": 55,
  "activeStreams": 53,
  "scannedStreams": 55,
  "scanErrors": 0,
  "streamWallets": 47,
  "streamDau": 0,
  "streamMau": 47,
  "totalVolumeUsd": 0.118547,
  "byToken": [
    {
      "symbol": "wVARA",
      "streamedRaw": "220130138288736",
      "streamedDisplay": "220.130138288736",
      "price": 0.00053853,
      "pricingSource": "coingecko",
      "volumeUsd": 0.118547
    }
  ],
  "seedsActiveWalletsAllTime": 1186,
  "seedsDau": 0,
  "seedsMau": 346,
  "dau": 0,
  "mau": 361,
  "uniqueWallets": 1201,
  "asOf": "2026-06-23T00:13:44.581Z"
}
```

## `/defillama-volume`

> DeFiLlama-shaped streaming volume: cumulative volume keyed coingecko:id (raw token units), totalVolumeUsd, timetravel:false, methodology. Consumed by the DeFiLlama volume (dimension) adapter.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/defillama-volume'
```

- Status: **`200`**

```json
{
  "chain": "vara",
  "totalVolume": {
    "coingecko:vara-network": "220.130138288736"
  },
  "totalVolumeUsd": 0.118547,
  "unpriced": [],
  "streamCount": 55,
  "methodology": "Streaming volume is the cumulative value streamed through the GrowStreams protocol on Vara, computed as the sum of each stream's live `streamed` amount (settled + accrued) read from StreamCore state, keyed by CoinGecko asset id (gVARA/wVARA priced as VARA). The contract emits no events, so values are reconstructed from on-chain contract state.",
  "timetravel": false,
  "asOf": "2026-06-23T00:13:44.581Z"
}
```

## `/activity?days=30`

> Backend-logged + state-derived activity window. transactionCount, uniqueWallets (window), activeWalletsAllTime, registeredUsers, dau, volumeUsd{last24h/7d/30d}. Source label indicates on_chain vs backend fallback.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/activity?days=30'
```

- Status: **`200`**

```json
{
  "available": true,
  "windowDays": 30,
  "source": "on_chain_event_indexer",
  "capturesPayloadSignedTransactions": true,
  "transactionCount": 83,
  "streamEventCount": 83,
  "vaultEventCount": 0,
  "bridgeTransactionCount": 0,
  "uniqueWallets": 47,
  "activeWalletsAllTime": 47,
  "registeredUsers": 128,
  "observedWithdrawVolumeUsd": 0.003439,
  "volumeUsd": {
    "last24h": 0.002625,
    "last7d": 0.003439,
    "last30d": 0.003439
  },
  "dau": 0,
  "totalTransactions": 83,
  "uniqueWalletsAllTime": 47,
  "lastObservedActivityAt": "2026-06-22T22:11:45.774Z",
  "lastUpdatedAt": "2026-06-22T22:11:45.774Z",
  "note": "Observed activity windows come from indexed/backend-logged transaction tables. This endpoint reflects windowed event activity, while /summary on-chain volume comes from live StreamCore state polling plus on-chain quest-seeds mint activity."
}
```

## `/history?hours=168`

> Hourly protocol snapshots time-series (TVL, streams, observed activity) from analytics_protocol_snapshots.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/history?hours=168'
```

- Status: **`200`**

```json
{
  "available": true,
  "lookbackHours": 168,
  "source": "analytics_protocol_snapshots",
  "snapshotVersion": "2026-06-wrapper-supply-current-contracts-v1",
  "note": "Only snapshots matching the current methodology and current contract set are returned. Older persisted rows remain stored but are excluded until they are backfilled or replaced.",
  "snapshots": [
    {
      "snapped_at": "2026-06-23T00:00:03.132Z",
      "estimated_tvl_usd": "5.937120",
      "estimated_stablecoin_tvl_usd": "0.000000",
      "total_streams": 55,
      "active_streams": 53,
      "observed_stream_event_count": 83,
      "observed_vault_event_count": 0,
      "observed_unique_wallets": 47,
      "observed_withdraw_volume_usd": "0.003254",
      "observed_window_days": 30,
      "observed_volume_source": "on_chain_event_indexer",
      "volume_24h_usd": "0.002484",
      "volume_7d_usd": "0.003254",
      "volume_30d_usd": "0.003254",
      "dau": 0,
      "total_transactions": 83,
      "unique_wallets_all_time": 47,
      "last_activity_at": "2026-06-22T22:11:45.774Z",
      "last_updated_at": "2026-06-22T23:00:01.751Z"
    }
  ]
}
```

## `/tvl-history?days=30`

> Daily TVL series for the dashboard chart (tvl_usd, stablecoin_tvl_usd, snapped_at).

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/tvl-history?days=30'
```

- Status: **`200`**

```json
{
  "available": true,
  "lookbackDays": 30,
  "source": "analytics_protocol_snapshots",
  "snapshotVersion": "2026-06-wrapper-supply-current-contracts-v1",
  "methodology": "Only snapshots matching the current live TVL methodology are returned. Current live TVL methodology is wrapper total supply (wVARA + gVARA) plus native VARA in the configured TokenVault account.",
  "points": [
    {
      "date": "2026-06-23T00:00:00.000Z",
      "tvl_usd": "5.937120",
      "stablecoin_tvl_usd": "0.000000",
      "snapped_at": "2026-06-23T00:00:03.132Z"
    }
  ]
}
```

## `/activity-history?days=30`

> Daily on-chain activity series for dashboard graphs: onchain_volume_usd, onchain_unique_wallets, onchain_dau, onchain_mau, seeds_active_wallets, stream_wallets, total_streams. From analytics_protocol_snapshots.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/activity-history?days=30'
```

- Status: **`200`**

```json
{
  "available": true,
  "lookbackDays": 30,
  "source": "analytics_protocol_snapshots",
  "snapshotVersion": "2026-06-wrapper-supply-current-contracts-v1",
  "note": "Daily points are taken from persisted hourly snapshots, but only rows matching the current on-chain activity methodology and current contract set are returned.",
  "points": [
    {
      "date": "2026-06-23T00:00:00.000Z",
      "snapped_at": "2026-06-23T00:00:03.132Z",
      "tvl_usd": "5.937120",
      "onchain_volume_usd": "0.110916",
      "onchain_unique_wallets": 1201,
      "onchain_dau": 0,
      "onchain_mau": 361,
      "seeds_active_wallets": 1186,
      "stream_wallets": 47,
      "total_streams": 55,
      "active_streams": 53
    }
  ]
}
```

## `/volume-history?days=30`

> Daily volume series (points[] of date + volumeUsd) with source/coverage labels.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/volume-history?days=30'
```

- Status: **`200`**

```json
{
  "available": true,
  "lookbackDays": 30,
  "source": "on_chain_event_indexer_plus_completed_bridge_transactions",
  "coverage": "stablecoin_stream_withdrawals_and_completed_bridge_transfers_only",
  "points": [
    {
      "date": "2026-06-21",
      "volumeUsd": 0.075563
    },
    {
      "date": "2026-06-22",
      "volumeUsd": 0.24375
    }
  ]
}
```

## `/contracts`

> Resolved program IDs for the core contracts (streamCore, tokenVault, growToken, ...).

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/contracts'
```

- Status: **`200`**

```json
{
  "streamCore": "0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659",
  "tokenVault": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
  "liveStreamCoreVault": "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef",
  "tokenVaultConfiguredStreamCore": "0xba0901f3ef665e956d8ab721686d97d2e5473092df34baf229e87ac826eadc4a",
  "growToken": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
  "gvaraToken": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
  "wvaraToken": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
  "questSeeds": "0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d",
  "splitsRouter": "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45",
  "distributionPool": "0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70",
  "liquidationManager": "0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3",
  "contractWiring": {
    "streamCoreUsesConfiguredVault": false,
    "tokenVaultUsesConfiguredStreamCore": false
  }
}
```

## `/explorer-links`

> Explorer URLs per contract (idea.gear-tech.io) for the dashboard contract links section.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/explorer-links'
```

- Status: **`200`**

```json
{
  "links": [
    {
      "key": "streamCore",
      "name": "StreamCore",
      "address": "0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "tokenVault",
      "name": "TokenVault",
      "address": "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "growToken",
      "name": "Grow Token",
      "address": "0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "gvaraToken",
      "name": "gVARA",
      "address": "0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "wvaraToken",
      "name": "wVARA",
      "address": "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d",
      "explorerUrl": "https://idea.gear-tech.io/programs/0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "questSeeds",
      "name": "Quest Seeds",
      "address": "0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d",
      "explorerUrl": "https://idea.gear-tech.io/programs/0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "splitsRouter",
      "name": "SplitsRouter",
      "address": "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "distributionPool",
      "name": "DistributionPool",
      "address": "0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x7aaa5fa39237ad7f63a78d5acd8a0ff080bd034b8e78de5d4756d6fe4fb25b70?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    },
    {
      "key": "liquidationManager",
      "name": "LiquidationManager",
      "address": "0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3",
      "explorerUrl": "https://idea.gear-tech.io/programs/0x411c62d126b3131ace5e94b618b8cbbdbffb5b9cfdd656f2f6da0786f60cb2c3?node=wss://rpc.vara.network",
      "network": "vara-mainnet"
    }
  ],
  "count": 9
}
```

## `/transactions?limit=10&offset=0`

> Recent transactions feed across stream/vault/bridge/XP-mint sources, each with on-chain explorerUrl (idea.gear-tech.io). On-chain XP mints (seeds_ledger, source:xp_mint) are included with verifiable tx hashes. Server-side pagination: limit + offset + total + hasMore.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/transactions?limit=10&offset=0'
```

- Status: **`200`**

```json
{
  "available": true,
  "transactions": [
    {
      "id": 11504,
      "timestamp": "2026-06-22T21:20:24.095Z",
      "event_type": "mint",
      "wallet": "0x10dbc78c15be6e26adc6689442de1efed4eb026e6bfcc38a1f750c10eb6e2743",
      "amount": 100,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0xdfb037f6bfc5958811537fb5ef26331d6565b4e66be0076e52575c0ab053e5a4",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/programs/0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d?node=wss://rpc.vara.network",
      "transactionExplorerUrl": "https://idea.gear-tech.io/extrinsics/0xdfb037f6bfc5958811537fb5ef26331d6565b4e66be0076e52575c0ab053e5a4?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 101,
      "timestamp": "2026-06-22T21:14:51.209Z",
      "event_type": "created",
      "sender": "0x10dbc78c15be6e26adc6689442de1efed4eb026e6bfcc38a1f750c10eb6e2743",
      "receiver": "0xec4d17f83dec0b6eec2c81b843040c4c96f514c9b1b4f4f861faed208fa7c15c",
      "amount": "29250000000000",
      "token_symbol": "wVARA",
      "metadata": {
        "source": "on_chain_event",
        "startTime": "1782162891"
      },
      "block_hash": null,
      "extrinsic_hash": null,
      "source": "stream",
      "explorerUrl": null
    },
    {
      "id": 11503,
      "timestamp": "2026-06-22T20:30:20.707Z",
      "event_type": "mint",
      "wallet": "0x4e095fb699aaf6572c4bf9c41731284f4d9ded38480ed76accf5f3d5fa008f2c",
      "amount": 100,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0x669af69382242f982839f07db6a688832454b2b344934279e55009a8768c1155",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/programs/0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d?node=wss://rpc.vara.network",
      "transactionExplorerUrl": "https://idea.gear-tech.io/extrinsics/0x669af69382242f982839f07db6a688832454b2b344934279e55009a8768c1155?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 11502,
      "timestamp": "2026-06-22T20:30:01.578Z",
      "event_type": "mint",
      "wallet": "0xd4a5fb8326bb9d4dd6fa34e60fc5c2f18e8b677b39908e78907df89b0948bd67",
      "amount": 100,
      "token_symbol": "SEEDS",
      "reason": "QUEST_COMPLETE",
      "extrinsic_hash": "0x4017827d611553f0c131e39adb2528d227b6e37192763d7f50dc0c6cf85dde98",
      "source": "xp_mint",
      "explorerUrl": "https://idea.gear-tech.io/programs/0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d?node=wss://rpc.vara.network",
      "transactionExplorerUrl": "https://idea.gear-tech.io/extrinsics/0x4017827d611553f0c131e39adb2528d227b6e37192763d7f50dc0c6cf85dde98?node=wss%3A%2F%2Frpc.vara.network"
    },
    {
      "id": 100,
      "timestamp": "2026-06-22T20:26:57.968Z",
      "event_type": "created",
      "sender": "0xd4a5fb8326bb9d4dd6fa34e60fc5c2f18e8b677b39908e78907df89b0948bd67",
      "receiver": "0x868111d85b4c429dbf5f2d54111c580cd9bc12a53ac377760d89bfe2813e7410",
      "amount": "4875000000000",
      "token_symbol": "wVARA",
      "metadata": {
        "source": "on_chain_event",
        "startTime": "1782160017"
      },
      "block_hash": null,
      "extrinsic_hash": null,
      "source": "stream",
      "explorerUrl": null
    },
    {
      "id": 99,
      "timestamp": "2026-06-22T20:26:57.235Z",
      "event_type": "created",
      "sender": "0xd4a5fb8326bb9d4dd6fa34e60fc5c2f18e8b677b39908e78907df89b0948bd67",
      "receiver": "0x868111d85b4c429dbf5f2d54111c580cd9bc12a53ac377760d89bfe2813e7410",
      "amount": "4875000000000",
      "token_symbol": "wVARA",
      "metadata": {
        "source": "on_chain_event",
        "startTime": "1782160017"
      },
      "block_hash": null,
      "extrinsic_hash": null,
      "source": "stream",
      "explorerUrl": null
    },
    {
      "id": 98,
      "timestamp": "2026-06-22T20:25:03.355Z",
      "event_type": "created",
      "sender": "0x4e095fb699aaf6572c4bf9c41731284f4d9ded38480ed76accf5f3d5fa008f2c",
      "receiver": "0xd426774c1f956f2ea2133c447a442ea29caf08d04570a77c9d5c6045fea2c616",
      "amount": "137475000000",
      "token_symbol": "wVARA",
      "metadata": {
        "source": "on_chain_event",
        "startTime": "1782159903"
      },
      "block_hash": null,
      "extrinsic_hash": null,
      "source": "stream",
      "explorerUrl": null
    },
    {
      "id": 97,
      "timestamp": "2026-06-22T20:25:03.247Z",
      "event_type": "created",
      "sender": "0x4e095fb699aaf6572c4bf9c41731284f4d9ded38480ed76accf5f3d5fa008f2c",
      "receiver": "0xd426774c1f956f2ea2133c447a442ea29caf08d04570a77c9d5c6045fea2c616",
      "amount": "137475000000",
      "token_symbol": "wVARA",
      "metadata": {
        "source": "on_chain_event",
        "startTime": "1782159903"
      },
      "block_hash": null,
      "extrinsic_hash": null,
      "source": "stream",
      "explorerUrl": null
    },
    {
      "id": 96,
      "timestamp": "2026-06-22T20:22:30.769Z",
      "event_type": "created",
      "sender": "0x4e095fb699aaf6572c4bf9c41731284f4d9ded38480ed76accf5f3d5fa008f2c",
      "receiver": "0xbe2dd7f2095afa8fe3ec8b20822a5539dc64625f1541eaf9699a32b5b267b536",
      "amount": "497250000000",
      "token_symbol": "wVARA",
      "metadata": {
        "source": "on_chain_event",
        "startTime": "1782159750"
      },
      "block_hash": null,
      "extrinsic_hash": null,
      "source": "stream",
      "explorerUrl": null
    },
    {
      "id": 95,
      "timestamp": "2026-06-22T20:22:30.208Z",
      "event_type": "created",
      "sender": "0x4e095fb699aaf6572c4bf9c41731284f4d9ded38480ed76accf5f3d5fa008f2c",
      "receiver": "0xbe2dd7f2095afa8fe3ec8b20822a5539dc64625f1541eaf9699a32b5b267b536",
      "amount": "497250000000",
      "token_symbol": "wVARA",
      "metadata": {
        "source": "on_chain_event",
        "startTime": "1782159750"
      },
      "block_hash": null,
      "extrinsic_hash": null,
      "source": "stream",
      "explorerUrl": null
    }
  ],
  "count": 10,
  "total": 8237,
  "limit": 10,
  "offset": 0,
  "hasMore": true,
  "note": "Includes on-chain XP mints (seeds_ledger). For xp_mint rows, explorerUrl points to the quest-seeds program messages page and transactionExplorerUrl points to the specific extrinsic when a tx hash is present."
}
```

## `/wallets?limit=10&offset=0`

> Active wallets list (wallet, handles, stream/vault/bridge counts, lastActivity), test/QA accounts excluded. Server-side pagination: limit + offset + total + hasMore.

```bash
curl -sS 'https://www.growstreams.xyz/api/analytics/wallets?limit=10&offset=0'
```

- Status: **`200`**

```json
{
  "available": true,
  "wallets": [
    {
      "wallet": "0xd4a5fb8326bb9d4dd6fa34e60fc5c2f18e8b677b39908e78907df89b0948bd67",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0xd4a5fb8326",
      "registeredAt": "2026-06-22T12:06:57.826Z",
      "streamCount": 2,
      "totalStreamed": 9750000000000,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T20:26:57.968Z"
    },
    {
      "wallet": "0x4e095fb699aaf6572c4bf9c41731284f4d9ded38480ed76accf5f3d5fa008f2c",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0x4e095fb699",
      "registeredAt": "2026-06-22T20:17:17.594Z",
      "streamCount": 8,
      "totalStreamed": 50214450000000,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T20:25:03.355Z"
    },
    {
      "wallet": "0x3012e0bb29eafc0cba3868999ea0a0c6aa9721b72dd281a1f5704f704b059259",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0x3012e0bb29",
      "registeredAt": "2026-06-22T20:13:56.205Z",
      "streamCount": 2,
      "totalStreamed": 72150000000000,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T20:15:06.382Z"
    },
    {
      "wallet": "0xb604281ec8ff994a9c0f4de39369bd7f4664d64b098c953b393a49e70241f54f",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0xb604281ec8",
      "registeredAt": "2026-06-22T20:05:29.276Z",
      "streamCount": 16,
      "totalStreamed": 70492500000000,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T20:13:33.327Z"
    },
    {
      "wallet": "0x18e84647568a282059d4304f2629f7fe88aed705f0492efdf2be0cbc57244e12",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0x18e8464756",
      "registeredAt": "2026-06-22T20:00:54.200Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T20:00:54.200Z"
    },
    {
      "wallet": "0xc68bc765fa3a150e19aa450a35c3c258bee76d26e20f67183685494c9cd4c46d",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0xc68bc765fa",
      "registeredAt": "2026-06-22T16:11:39.464Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T16:11:39.464Z"
    },
    {
      "wallet": "0x0a95e95c8d87af7c6c367c935dcd2db523c9c6dce2805493b231b0292dfed604",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0x0a95e95c8d",
      "registeredAt": "2026-06-22T13:14:12.648Z",
      "streamCount": 2,
      "totalStreamed": 1950000000000,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T14:22:00.116Z"
    },
    {
      "wallet": "0xe81fa5efb227f214cd23006ec280d0e511cd3adb95ee074e44ff3c631576935f",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0xe81fa5efb2",
      "registeredAt": "2026-06-22T13:49:42.477Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T13:49:42.477Z"
    },
    {
      "wallet": "0xf81dbdb584b054201dbe7e65539eae7a335036da0c14101a04ea523f34b1cf5c",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0xf81dbdb584",
      "registeredAt": "2026-06-22T12:50:20.773Z",
      "streamCount": 0,
      "totalStreamed": 0,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T12:50:20.773Z"
    },
    {
      "wallet": "0x7cc218c8733a0370827d76af276a7b194c47f9c3351019de29efd96576b5722f",
      "githubHandle": null,
      "xHandle": null,
      "displayName": "0x7cc218c873",
      "registeredAt": "2026-06-22T11:58:52.496Z",
      "streamCount": 1,
      "totalStreamed": 11700000000000,
      "vaultCount": 0,
      "totalDeposited": 0,
      "bridgeCount": 0,
      "totalBridged": 0,
      "lastActivity": "2026-06-22T12:01:15.524Z"
    }
  ],
  "count": 10,
  "total": 128,
  "limit": 10,
  "offset": 0,
  "hasMore": true
}
```


# GrowStreams Architecture Overview

## System Overview

GrowStreams is a multi-campaign incentive protocol built on Vara Network. It combines stablecoin streaming, AI-scored contributions, and campaign-based USDC payouts. The stack is a **Node.js API** + **Next.js frontend** backed by **PostgreSQL**.

---

## High-Level Flow

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────┐
│  Frontend    │────▶│  Express API      │────▶│  PostgreSQL  │
│  (Next.js)   │◀────│  (Node.js ESM)    │◀────│              │
└──────────────┘     └───────┬───────────┘     └──────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────────┐
        │ GitHub   │  │ X/Twitter│  │ Cron Jobs    │
        │ Agent    │  │ Agent    │  │ (node-cron)  │
        └──────────┘  └──────────┘  └──────────────┘
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────────┐
        │ OpenAI   │  │ Twitter  │  │ Campaign     │
        │ LLM      │  │ API v2   │  │ Lifecycle    │
        └──────────┘  └──────────┘  └──────────────┘
```

---

## Backend (`api/`)

### Entry Point
- **`api/src/index.mjs`** — Express app setup, middleware (helmet, CORS, morgan), route mounting, DB migration, cron init, X stream start.

### Database (`api/src/services/db.mjs`)
- PostgreSQL via `pg` pool
- `migrate()` runs on startup — creates/alters all tables idempotently
- **Core tables:** participants, contributions, xp_events, daily_snapshots, users, referrals
- **V3 tables:** stream_events, vault_events, bridge_transactions
- **Campaign tables:** campaigns, campaign_participants, campaign_payouts
- **Key columns added:** `contributions.campaign_id`, `contributions.campaign_count`, `xp_events.campaign_id`

### Services

| Service | File | Purpose |
|---------|------|---------|
| XP Service | `xp-service.mjs` | Award XP, referral bonuses, leaderboard, payout calculations. `awardXP()` accepts optional `campaignId` — when present, also calls `awardCampaignXP()` |
| Campaign Service | `campaign-service.mjs` | Campaign CRUD, enrollment, campaign XP, matching logic (`matchCampaignsForPR`, `matchCampaignsForTweet`), payout execution |
| GitHub Agent | `github-agent.mjs` | PR webhook handler: fetch diff → LLM score → award XP → campaign matching → post comment |
| X Agent | `x-agent.mjs` | Tweet processing: content scoring → award XP → campaign matching → re-evaluation (6h/24h) |
| LLM Scorer | `llm-scorer.mjs` | OpenAI GPT-4o-mini for PR and content scoring (0-100) |
| Bridge Service | `bridge-service.mjs` | Cross-chain bridge tx tracking (ETH ↔ Vara) |
| User Service | `user-service.mjs` | User registration, profiles, referrals |

### Routes

| Route | File | Endpoints |
|-------|------|-----------|
| `/api/campaigns` | `routes/campaigns.mjs` | List, create, fund, enroll, leaderboard, payout preview, execute |
| `/api/campaign` | `routes/campaign.mjs` | Legacy single-campaign: register, config, participant stats |
| `/api/leaderboard` | `routes/leaderboard.mjs` | Global leaderboard, stats |
| `/api/users` | `routes/users.mjs` | Registration, profile, referrals, user campaigns |
| `/api/streams` | `routes/streams.mjs` | Stream CRUD, history, stats |
| `/api/vault` | `routes/vault.mjs` | Vault deposit/withdraw, balances |
| `/api/bridge` | `routes/bridge.mjs` | Bridge info, routes, initiate, track |
| `/api/tokens` | `routes/tokens.mjs` | Token registry, balances, conversions |
| `/api/webhooks` | `routes/webhooks.mjs` | GitHub webhook receiver |

### Cron Jobs (`api/src/cron/`)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `daily-xp.mjs` | `0 0 * * *` (midnight UTC) | Daily XP accumulation for active OSS contributions. Campaign-aware: skips ENDED/CLOSED campaigns, passes `campaignId` to `awardXP()` for ACTIVE campaigns |
| `leaderboard-snapshot.mjs` | `5 0 * * *` | Snapshot ranks for 24h change tracking |
| `x-reevaluate.mjs` | `0 */6 * * *` | Re-evaluate tweet engagement, award viral/reshare/engagement bonuses |
| `campaign-lifecycle.mjs` | `*/15 * * * *` | Auto-start FUNDED→ACTIVE campaigns, auto-end ACTIVE→ENDED campaigns, trigger payout calculation |

---

## Campaign System

### Lifecycle States
```
DRAFT → FUNDED → ACTIVE → ENDED → SETTLING → CLOSED
```

- **DRAFT:** Created but not funded
- **FUNDED:** Pool deposited, waiting for start_date
- **ACTIVE:** Accepting contributions, awarding campaign XP (auto-started by cron)
- **ENDED:** end_date passed, contributions closed (auto-ended by cron)
- **SETTLING:** Payout rows being calculated
- **CLOSED:** Payouts finalized

### Campaign Matching

**For PRs (GitHub Agent):**
1. PR is scored by LLM
2. `matchCampaignsForPR(repoUrl)` checks all ACTIVE campaigns whose `github_repo_url` matches
3. For each match: verify enrollment → check contribution limit → award campaign XP
4. First matching campaign ID is set on the contribution record

**For Tweets (X Agent):**
1. Tweet is scored by LLM
2. Extract `#hashtags` and `@mentions` from tweet text
3. `matchCampaignsForTweet(hashtags, mentions)` checks ACTIVE campaigns with matching required_hashtags/mentions
4. Same enrollment + limit checks, then campaign XP awarded
5. Warning logged when tweet matches multiple campaigns

### Payout Calculation
```
participant_usdc = (participant_campaign_xp / total_campaign_xp) * pool_amount
```
- Calculation-only in V1 (no on-chain transfers)
- Before payout, all active contributions for the campaign are closed
- Minimum payout threshold applied; below-minimum entries marked `BELOW_MINIMUM`

---

## Frontend (`frontend/`)

### Stack
- Next.js 15 (App Router), React 19, TypeScript
- TailwindCSS with custom `provn-*` theme
- Lucide React icons, Sonner toasts
- `@gear-js/react-hooks` + `@gear-js/wallet-connect` for Vara wallet

### Key Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/app` | Dashboard | Overview page |
| `/app/campaign` | CampaignPage | Multi-campaign list, enrollment, inline leaderboards |
| `/app/leaderboard` | LeaderboardPage | Global XP leaderboard with pagination, search, track filters |
| `/app/streams` | StreamDashboard | Multi-token streaming management |
| `/app/vault` | VaultDashboard | Multi-token vault deposit/withdraw |
| `/app/bridge` | BridgeTokens | Cross-chain bridge UI |
| `/app/grow` | GROW Token | Token faucet and management |

### API Client (`frontend/lib/growstreams-api.ts`)
- Typed `api` object with namespaces: `tokens`, `streams`, `vault`, `bridge`, `campaigns`, `campaign` (legacy), `identity`, `bounty`, `splits`, `permissions`, `growToken`
- All methods return typed Promises
- `api.campaigns.*` — multi-campaign endpoints (list, active, get, create, fund, enroll, leaderboard, participants, payoutPreview, userCampaigns)

---

## Environment Variables

### Required (API)
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_SECRET` | Admin auth for sensitive endpoints |
| `OPENAI_API_KEY` | LLM scoring |
| `GITHUB_TOKEN` or `GITHUB_APP_PRIVATE_KEY` | GitHub API access |
| `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` | Target repo for PR monitoring |
| `X_BEARER_TOKEN` | Twitter API read access |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` | Twitter write access |

### Optional (API)
| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3001 | API port |
| `CAMPAIGN_POOL_USDC` | 500 | Legacy global pool |
| `SCORE_THRESHOLD` | 70 | Min score for XP |
| `MERGE_BONUS_XP` | 500 | XP for merged PRs |
| `LLM_MODEL` | gpt-4o-mini | OpenAI model |

### Frontend
| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_GROWSTREAMS_API` | `https://growstreams-core-production.up.railway.app` | API base URL |

---

## Running Locally

```bash
# Backend
cd api
npm install
npm run dev          # Starts on port 3001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # Starts on port 3000
```

Set `NEXT_PUBLIC_GROWSTREAMS_API=http://localhost:3001` in `frontend/.env.local` to connect to local backend.

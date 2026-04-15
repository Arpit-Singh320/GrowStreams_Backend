# GrowStreams Features

## 💰 Multi-Token Streaming
- Stream 5 tokens: WUSDC, WUSDT, WETH, WBTC, VARA
- Configurable flow rates (per second/minute/hour/day/week/month)
- Real-time balance tracking with 1-second precision
- Pause/resume/stop streams
- Auto-liquidation on insufficient buffer

## 🏦 Token Vault
- Multi-token deposit/withdraw (VFT + native VARA)
- VFT approval workflow
- Balance tracking: deposited, allocated, available
- Stream allocation management
- Async VFT transfer validation

## 🌉 Cross-Chain Bridge
- ETH ↔ Vara bridging for WUSDC, WUSDT, WETH, WBTC
- Fee estimation (0.10%)
- Transaction tracking with 5-step progress
- Bridge history and stats
- Testnet faucet integration

## 🎯 Campaign System
- XP-based rewards
- GitHub integration for contributions
- Leaderboard with rankings
- USDC prize pool distribution
- Activity tracking (PRs, videos, engagement)

## 🏆 Leaderboard
- Real-time XP rankings
- Winner podium display
- Search and filtering
- Campaign stats (participants, total XP, pool size)
- Historical data

## 💎 GROW Token
- Native governance token (12 decimals)
- Mint/transfer/approve operations
- Vault integration
- VFT standard compatible

## 🔀 Payment Splits
- Create split groups with weighted recipients
- Distribute tokens to multiple addresses
- Percentage-based allocation
- Support for all streamable tokens

## 🎁 Bounty System
- Create bounties with token rewards
- Max flow rate and min score requirements
- Claim and complete workflow
- Budget tracking

## 🔐 Permission System
- Granular access control
- Grant/revoke permissions by scope
- Role-based authorization
- Admin management

## 👤 Identity Registry
- GitHub username binding
- On-chain identity verification
- Developer score tracking
- Proof-based authentication

## 📊 Analytics & History
- Stream event logging (created, paused, stopped, etc.)
- Vault event tracking (deposits, withdrawals, allocations)
- Per-token statistics
- Transaction history with pagination

## 🔧 Technical Stack
- **Contracts**: Rust + sails-rs on Vara Network
- **Backend**: Node.js + Express + PostgreSQL
- **Frontend**: Next.js 15 + React + TailwindCSS
- **Wallet**: Polkadot.js + SubWallet integration
- **Deployment**: Vercel (frontend) + VPS (backend)

## 🌐 Deployed Contracts (Vara Testnet)
- Stream Core: `0x4b41...2dba`
- Token Vault: `0x9795...166f`
- GROW Token: `0x8c3c...85bf`
- Splits Router: `0x8f9f...4395`
- Permission Manager: `0x467b...4a0f`
- Bounty Adapter: `0xc34b...eb32`
- Identity Registry: `0xd07d...eff7`

## 🧪 Testing
- 230+ unit & integration tests
- Decimal conversion testing (6/8/12/18 decimals)
- Bridge service validation
- API endpoint coverage
- Frontend token utilities

## 🚀 Live URLs
- **Production**: https://www.growstreams.xyz
- **API**: Backend on VPS
- **Contracts**: Vara Testnet
- **Explorer**: https://idea.gear-tech.io

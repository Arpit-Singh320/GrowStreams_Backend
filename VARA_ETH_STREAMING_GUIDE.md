# Vara.eth Streaming Guide

## Overview

Vara.eth enables **EVM-native token streaming** on Ethereum Mainnet using the Vara.eth runtime. Unlike traditional Vara streams (which use Vara mainnet), Vara.eth streams use **Ethereum wallets** (MetaMask) and **ERC-20 tokens** (wVARA).

---

## Stream Types on Vara.eth

### 1. **wVARA Streams** (Currently Supported)

**Token**: wVARA (Wrapped VARA on Ethereum)  
**Contract**: `0xB67010F2246814e5c39593ac23A925D9e9d7E5aD`  
**Decimals**: 12  
**Use Case**: Streaming VARA value on Ethereum mainnet

#### How it Works:
1. **Sender** deposits wVARA into StreamEscrow contract
2. **StreamEscrow** calls stream-core-eth Mirror program
3. **Mirror** executes Vara.eth WASM logic
4. **Receiver** can withdraw streamed wVARA at any time

#### Example:
```
Sender: 0x679E88bC9518b70619F69ef630f7734C126c4913
Receiver: 0xABC...123
Flow Rate: 1 wVARA/month
Deposit: 10 wVARA
Duration: 10 months
```

---

### 2. **Future Token Support** (Coming Soon)

The Vara.eth architecture supports **any ERC-20 token** on Ethereum mainnet. Future tokens that can be added:

| Token | Symbol | Use Case |
|-------|--------|----------|
| **USDC** | USDC | Stablecoin streaming for salaries, subscriptions |
| **USDT** | USDT | Stablecoin alternative |
| **WETH** | WETH | ETH streaming |
| **DAI** | DAI | Decentralized stablecoin |
| **Custom ERC-20** | Any | Project-specific tokens |

To add a new token:
1. Update `VARA_ETH_TOKEN` in `.env`
2. Redeploy StreamEscrow with new token address
3. Frontend automatically detects the token

---

## Stream Parameters

### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| **Receiver Address** | EVM address (0x...) | `0x679E88bC9518b70619F69ef630f7734C126c4913` |
| **Flow Rate** | Amount per time interval | `1` wVARA |
| **Interval** | Time unit | `month` (second, minute, hour, day, month) |
| **Deposit** | Initial deposit amount | `10` wVARA |

### Calculated Values

- **Flow Rate per Second**: `flowRate / interval` (e.g., 1/month = 0.0000003858 wVARA/sec)
- **Minimum Deposit**: `flowRate * minBuffer` (1 hour buffer = 3600 seconds)
- **Stream Duration**: `deposit / flowRatePerSecond` (in seconds)

---

## Stream Lifecycle

### 1. **Creation** (PENDING)
- Sender approves wVARA to StreamEscrow
- Sender calls `StreamEscrow.deposit(receiver, flowRate, amount)`
- StreamEscrow sends message to stream-core-eth Mirror
- Status: **PENDING** (waiting for Vara.eth runtime confirmation)

### 2. **Activation** (ACTIVE)
- Vara.eth runtime processes the message (1-2 min)
- stream-core-eth creates stream on-chain
- StreamEscrow receives callback with `streamId`
- Status: **ACTIVE** (streaming begins)

### 3. **Management**
- **Add Deposit**: Top up existing stream
- **Withdraw**: Receiver claims streamed tokens
- **Stop**: Sender cancels stream, remaining deposit refunded

### 4. **Completion**
- Stream depletes when `deposit / flowRate` time elapses
- Receiver can claim final balance
- Sender can claim any refunds

---

## Gas Costs (Ethereum Mainnet)

| Action | Estimated Gas | Cost @ 20 gwei |
|--------|---------------|----------------|
| **Approve wVARA** | ~50,000 | ~$0.02 |
| **Create Stream** | ~150,000 | ~$0.06 |
| **Add Deposit** | ~80,000 | ~$0.03 |
| **Withdraw** | ~100,000 | ~$0.04 |
| **Stop Stream** | ~120,000 | ~$0.05 |
| **Claim Refund** | ~60,000 | ~$0.02 |

**Total to create stream**: ~$0.08 USD (at current ETH prices)

---

## Comparison: Vara vs Vara.eth Streams

| Feature | Vara Streams | Vara.eth Streams |
|---------|--------------|------------------|
| **Network** | Vara Mainnet | Ethereum Mainnet |
| **Wallet** | Polkadot.js, SubWallet | MetaMask, WalletConnect |
| **Tokens** | gVARA, wUSDC, wUSDT, WETH, WBTC | wVARA (more coming) |
| **Gas Token** | VARA | ETH |
| **Address Format** | kG... (SS58) | 0x... (EVM) |
| **Confirmation Time** | ~6 seconds | ~12 seconds + 1-2 min runtime |
| **Gas Costs** | ~0.01 VARA | ~$0.08 USD |
| **Super Tokens** | ✅ Yes (gVARA) | ❌ Not yet |
| **Distribution Pools** | ✅ Yes | ❌ Not yet |
| **Liquidation** | ✅ Yes | ❌ Not yet |

---

## Current Limitations

1. **Single Token**: Only wVARA is supported (more tokens coming)
2. **No Super Tokens**: Vara.eth doesn't support gVARA-style super tokens yet
3. **No Pools**: Distribution pools not yet implemented
4. **Longer Confirmation**: 1-2 min delay for Vara.eth runtime processing
5. **Higher Gas**: Ethereum mainnet gas costs vs Vara's low fees

---

## Advantages of Vara.eth

1. **EVM Compatibility**: Use MetaMask and familiar EVM tools
2. **Ethereum Liquidity**: Access to Ethereum's deep liquidity
3. **Cross-Chain**: Bridge between Vara and Ethereum ecosystems
4. **Institutional Adoption**: Ethereum's wider institutional support
5. **Composability**: Integrate with other Ethereum DeFi protocols

---

## Use Cases

### 1. **Payroll**
Stream salaries in wVARA to employees on Ethereum mainnet
```
Flow Rate: 5000 wVARA/month
Deposit: 60000 wVARA (1 year)
```

### 2. **Subscriptions**
Continuous payment for services
```
Flow Rate: 10 wVARA/month
Deposit: 120 wVARA (1 year)
```

### 3. **Vesting**
Token vesting schedules
```
Flow Rate: 1000 wVARA/month
Deposit: 48000 wVARA (4 years)
```

### 4. **Grants**
Continuous funding for projects
```
Flow Rate: 500 wVARA/month
Deposit: 6000 wVARA (1 year)
```

---

## Technical Architecture

```
┌─────────────────┐
│  MetaMask       │
│  (Sender)       │
└────────┬────────┘
         │ 1. approve(wVARA)
         │ 2. deposit(receiver, flowRate, amount)
         ▼
┌─────────────────┐
│ StreamEscrow    │ ← Holds wVARA deposits
│ (Solidity)      │
└────────┬────────┘
         │ 3. sendMessage(payload)
         ▼
┌─────────────────┐
│ stream-core-eth │ ← Vara.eth WASM program
│ (Mirror)        │
└────────┬────────┘
         │ 4. callback(streamId)
         ▼
┌─────────────────┐
│ StreamEscrow    │ ← Maps messageId → streamId
│ (State Updated) │
└─────────────────┘
```

---

## FAQ

**Q: Can I stream to a Vara address (kG...)?**  
A: No, Vara.eth only supports EVM addresses (0x...). Use regular Vara streams for Vara addresses.

**Q: Can I use USDC instead of wVARA?**  
A: Not yet. Only wVARA is supported currently. More tokens coming soon.

**Q: Why is confirmation slower than Vara?**  
A: Vara.eth runtime processes messages in batches (1-2 min). This is a tradeoff for EVM compatibility.

**Q: Can I cancel a stream?**  
A: Yes, call `stop()` and claim your refund. Receiver keeps already-streamed tokens.

**Q: What happens if my deposit runs out?**  
A: Stream continues at 0 flow rate. You can top up anytime with `addDeposit()`.

**Q: Can I stream to multiple receivers?**  
A: Not in a single stream. Create separate streams for each receiver.

---

## Next Steps

1. ✅ **Get wVARA** — Bridge VARA to Ethereum via [bridge.vara.network](https://bridge.vara.network)
2. ✅ **Connect MetaMask** — Switch to Ethereum Mainnet
3. ✅ **Create Stream** — Go to `/app/vara-eth` and fill the form
4. ⏳ **Wait for Confirmation** — Stream becomes ACTIVE in 1-2 min
5. ✅ **Manage Stream** — Add deposit, withdraw, or stop anytime

---

## Support

- **Docs**: [docs.growstreams.xyz](https://docs.growstreams.xyz)
- **Discord**: [discord.gg/growstreams](https://discord.gg/growstreams)
- **GitHub**: [github.com/growstreams](https://github.com/growstreams)
- **Etherscan**: [etherscan.io](https://etherscan.io) (view transactions)

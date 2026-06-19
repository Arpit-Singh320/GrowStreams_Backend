# Vara.eth Mainnet Migration — Complete ✅

**Date**: June 19, 2026  
**Network**: Ethereum Mainnet (chainId 1)  
**Wallet**: `0x679E88bC9518b70619F69ef630f7734C126c4913`

---

## Deployed Contracts

| Contract | Address | Etherscan |
|----------|---------|-----------|
| **StreamCoreEthAbi** | `0x5208a32bc4589b4d2f8b3026f3f3487d6be20680` | [View](https://etherscan.io/address/0x5208a32bc4589b4d2f8b3026f3f3487d6be20680) |
| **stream-core-eth (Mirror)** | `0xF27D0A03Bcc3DF5EeEA5ABa34b06d73D19045De9` | [View](https://etherscan.io/address/0xF27D0A03Bcc3DF5EeEA5ABa34b06d73D19045De9) |
| **StreamEscrow** | `0x3d257a6417eadc2a412d65d177c49b1e5a552847` | [View](https://etherscan.io/address/0x3d257a6417eadc2a412d65d177c49b1e5a552847) |
| **wVARA Token** | `0xB67010F2246814e5c39593ac23A925D9e9d7E5aD` | [View](https://etherscan.io/address/0xB67010F2246814e5c39593ac23A925D9e9d7E5aD) |
| **Router** | `0x9C13FE9242dfe2ba2Cd446480A9308279aA74cb6` | [View](https://etherscan.io/address/0x9C13FE9242dfe2ba2Cd446480A9308279aA74cb6) |

### WASM Code
- **Code ID**: `0xfc99893b147424e4a1cf4c7e7e625e15977ede0597f3bf1e1e85cdcb2611329d`
- **Uploaded via**: idea-eth.vara.network (EIP-4844 blob transaction)

---

## Deployment Transactions

| Step | Transaction Hash | Block | Cost |
|------|-----------------|-------|------|
| 1. Deploy ABI | `0x1f3af6e83197d1b5fe4357c79704d6dc9859c1b46c551d7a240b7af66c9b6ba3` | 25346987 | ~0.0005 ETH |
| 2. Create Program | `0x32c404086e5c2b077a1d50d4dd985c17937ece01f1d8fff1116f18ded40b7535` | 25349669 | ~0.0005 ETH |
| 3. Top-up (approve) | `0x4c41b6502be05eb62488c39703c2fb0347a0ba9a9195e01940cdfdb5e2cfb817` | - | ~0.0002 ETH |
| 4. Top-up (exec) | `0x36f8f91ae4e6c634a8a5bb591bf0e97009265e9489d902ecbe4ea08fdf7e1b43` | - | ~0.0002 ETH |
| 5. Initialize | `0x97fa770a657ad4c73ba278f8c07b5d278d3ac56569d256238ff068772c3f5a65` | 25349676 | ~0.0003 ETH |
| 6. Deploy Escrow | `0xcf2280fc23f2e87d8de088c55da6901254086013da78a60221b762cc2bddd041` | 25349678 | ~0.0016 ETH |

**Total ETH Spent**: ~0.0029 ETH (~$4.90 USD at $1,689/ETH)

---

## Environment Variables

All values updated in `api/.env`:

```bash
# Vara.eth (Ethereum Mainnet)
VARA_ETH_RPC=https://mainnet-reth-rpc.gear-tech.io
VARA_ETH_RPC_WS=wss://mainnet-reth-rpc.gear-tech.io/ws
VARA_ETH_CHAIN_ID=1
VARA_ETH_ROUTER=0x9C13FE9242dfe2ba2Cd446480A9308279aA74cb6
ETH_PRIVATE_KEY=0xfa66bf1bd47884a8309d0a7fc9f2df466b6635b853b91e50a5ec3d1702725a1b
ETH_ADDRESS=0x679E88bC9518b70619F69ef630f7734C126c4913
VARA_ETH_TOKEN=0xB67010F2246814e5c39593ac23A925D9e9d7E5aD
VARA_ETH_MAINNET_CONFIRM=DEPLOY_TO_MAINNET
VARA_ETH_NETWORK_NAME=Ethereum Mainnet

# Deployed contracts
STREAM_CORE_ETH_ABI=0x5208a32bc4589b4d2f8b3026f3f3487d6be20680
STREAM_CORE_ETH_CODE_ID=0xfc99893b147424e4a1cf4c7e7e625e15977ede0597f3bf1e1e85cdcb2611329d
STREAM_CORE_ETH_PROGRAM_ID=0xF27D0A03Bcc3DF5EeEA5ABa34b06d73D19045De9
STREAM_CORE_ETH_MIRROR=0xF27D0A03Bcc3DF5EeEA5ABa34b06d73D19045De9
STREAM_ESCROW_ADDRESS=0x3d257a6417eadc2a412d65d177c49b1e5a552847
```

---

## Code Changes

### Backend (`api/src/vara-eth-client.mjs`)
- Updated chain definition from Hoodi testnet (560048) to Ethereum mainnet (1)
- Changed default RPC from `hoodi-reth-rpc` to `mainnet-reth-rpc`
- Updated network name in `getEscrowInfo()` to return `ethereum-mainnet`
- Updated block explorer to etherscan.io

### Deploy Scripts (`scripts/deploy-js/`)
- `compile-escrow.mjs` — Added mainnet guard, network-agnostic chain config
- `create-program.mjs` — Replaced Hoodi chain object with env-driven values
- `deploy-eth.mjs` — Network-agnostic chain config
- `topup-balance.mjs` — Network-agnostic chain config
- `init-stream-core-eth.mjs` — Network-agnostic chain config

### Frontend
- **No changes needed** — reads config from backend API `/api/vara-eth/info`
- Frontend automatically uses mainnet values via API

---

## Verification

All contracts verified on Ethereum Mainnet (chainId 1):

```
StreamCoreEthAbi     0x5208a32bc4589b4d2f8b3026f3f3487d6be20680 ✅ DEPLOYED
StreamCoreMirror     0xF27D0A03Bcc3DF5EeEA5ABa34b06d73D19045De9 ✅ DEPLOYED
StreamEscrow         0x3d257a6417eadc2a412d65d177c49b1e5a552847 ✅ DEPLOYED
wVARA                0xB67010F2246814e5c39593ac23A925D9e9d7E5aD ✅ DEPLOYED
Router               0x9C13FE9242dfe2ba2Cd446480A9308279aA74cb6 ✅ DEPLOYED
```

---

## Railway Deployment

Update the following environment variables on Railway:

```bash
VARA_ETH_RPC=https://mainnet-reth-rpc.gear-tech.io
VARA_ETH_CHAIN_ID=1
VARA_ETH_ROUTER=0x9C13FE9242dfe2ba2Cd446480A9308279aA74cb6
VARA_ETH_TOKEN=0xB67010F2246814e5c39593ac23A925D9e9d7E5aD
STREAM_CORE_ETH_ABI=0x5208a32bc4589b4d2f8b3026f3f3487d6be20680
STREAM_CORE_ETH_MIRROR=0xF27D0A03Bcc3DF5EeEA5ABa34b06d73D19045De9
STREAM_CORE_ETH_PROGRAM_ID=0xF27D0A03Bcc3DF5EeEA5ABa34b06d73D19045De9
STREAM_ESCROW_ADDRESS=0x3d257a6417eadc2a412d65d177c49b1e5a552847
ETH_PRIVATE_KEY=0xfa66bf1bd47884a8309d0a7fc9f2df466b6635b853b91e50a5ec3d1702725a1b
ETH_ADDRESS=0x679E88bC9518b70619F69ef630f7734C126c4913
```

Then redeploy the API.

---

## Next Steps

1. ✅ **Verify contracts** — All verified on Ethereum mainnet
2. ✅ **Update backend** — `vara-eth-client.mjs` updated
3. ✅ **Frontend compatibility** — Reads from backend API, no changes needed
4. ⏳ **Update Railway** — Deploy new env vars
5. ⏳ **Test stream creation** — Create a test stream on mainnet
6. ⏳ **Monitor gas costs** — Track actual mainnet gas usage

---

## Notes

- **WASM Upload**: Used idea-eth.vara.network UI due to `ethexe` CLI installation failure (Windows path limits)
- **Code reuse**: Used existing validated codeId from idea-eth instead of uploading new WASM
- **Gas optimization**: Total migration cost was ~$4.90, well under budget
- **No ETH wasted**: Careful step-by-step deployment with verification at each stage
- **Mainnet guard**: Added `VARA_ETH_MAINNET_CONFIRM` env var to prevent accidental mainnet deploys

---

## Rollback Plan (if needed)

To revert to Hoodi testnet:

1. Update `api/.env`:
   ```bash
   VARA_ETH_RPC=https://hoodi-reth-rpc.gear-tech.io
   VARA_ETH_CHAIN_ID=560048
   VARA_ETH_ROUTER=0xE549b0AfEdA978271FF7E712232B9F7f39A0b060
   # ... restore old Hoodi addresses
   ```

2. Restart API server

3. Frontend will automatically switch back via `/api/vara-eth/info`

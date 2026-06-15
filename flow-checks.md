# Vara.eth Phase 6 — Flow Checks

## Run

```bash
# Full E2E (write transactions, ~5 min for Vara.eth callbacks)
node scripts/deploy-js/test-vara-eth.mjs

# Read-only (no gas required, instant)
node scripts/deploy-js/test-vara-eth.mjs --skip-write

# Custom receiver address
node scripts/deploy-js/test-vara-eth.mjs --receiver 0x<address>
```

---

## Checklist

### C — Environment & Contract Wiring

| # | Check | Pass condition |
|---|-------|---------------|
| C1 | Required env vars present | `STREAM_ESCROW_ADDRESS`, `VARA_ETH_TOKEN`, `STREAM_CORE_ETH_MIRROR`, `ETH_PRIVATE_KEY` all set |
| C2 | RPC reachable | `eth_chainId` returns `560048` |
| C3 | Mirror executable balance > 0 | Program was topped up with wVARA |
| C4 | Mirror stateHash non-zero | Program was initialized |
| C5 | `Escrow.token()` matches env | `VARA_ETH_TOKEN` address matches on-chain |
| C6 | `Escrow.streamCoreAbi()` correct | Matches `STREAM_CORE_ETH_ABI` address |
| C7 | `deploy-state.json` escrow matches env | No stale addresses |

### Q — Read-only Queries (6.4)

| # | Check | Pass condition |
|---|-------|---------------|
| Q1 | `StreamServiceTotalStreams` readable | Returns a `uint64` |
| Q2 | `StreamServiceGetSenderStreams` for relayer | Returns stream ID array |
| Q3 | `StreamServiceStreamExists` for last stream | Returns `true` |
| Q4 | `StreamServiceWithdrawableBalance` | Returns `uint128` |
| Q5 | Relayer token balance > 0 | Has mUSDC to deposit |
| Q6 | Relayer ETH balance > 0.01 ETH | Has gas for transactions |

### W — Write Flow (6.1 E2E)

| # | Check | Pass condition |
|---|-------|---------------|
| W1 | ERC-20 approve escrow | Tx success + allowance set |
| W2 | `StreamEscrow.deposit()` | Tx success + `StreamPending` event |
| W3 | `StreamCreated` callback | Event emitted within 4 min of deposit |
| W3b | Callback messageId matches | Same `bytes32` across pending→confirmed |
| W3c | No `AsyncCallFailed` | No `ReplyCallFailed` from Vara.eth runtime |
| W4a | `streamDepositor(id)` = relayer | Escrow mapping set by callback |
| W4b | `StreamServiceStreamExists(id)` = true | Stream live in Vara.eth program |
| W4c | TotalStreams increased | Confirms stream registered on-chain |

### D — Unit-return Callbacks (6.2 RecordDeposit)

| # | Check | Pass condition |
|---|-------|---------------|
| D1 | Approve for addDeposit | Tx success |
| D2 | `StreamEscrow.addDeposit()` | Tx success + `DepositPending` event |
| D3 | `DepositConfirmed` callback | Unit-return `replyOn_streamServiceRecordDeposit` fired |
| D3b | No `AsyncCallFailed` | Fallback `(bytes32,())` selector handled correctly |

### Withdraw + Claim

| # | Check | Pass condition |
|---|-------|---------------|
| W5 | `WithdrawableBalance` readable | Returns accrued amount |
| W6 | `StreamEscrow.withdraw()` | Tx success + `WithdrawPending` event |
| W7 | `WithdrawConfirmed` callback | Tokens transferred to recipient |
| W7b | No `AsyncCallFailed` | Clean withdraw callback |
| W8 | `StreamEscrow.stopStream()` | Tx success + `StopPending` event |
| W9 | `StopConfirmed` callback | Returns `unstreamed` amount |
| W10 | `claimable(relayer)` > 0 after stop | Unstreamed credited |
| W11 | `StreamEscrow.claim()` | Tokens returned to relayer |

### M — mintSeedsEvm (6.3)

| # | Check | Pass condition |
|---|-------|---------------|
| M1 | `mintSeedsEvm()` sends Mirror.sendMessage | Tx success |
| M1b | Quest Seeds Mirror processes reply | No revert in tx receipt |

---

## Contract Addresses (Hoodi testnet)

| Contract | Address |
|----------|---------|
| stream-core-eth Mirror | `0xd3CB10206785Db691d60CF829859044e8c05b9FB` |
| stream-core-eth ABI | `0x7F11e270b10944da1C492497B5cFF5f59bA33BB7` |
| StreamEscrow | `0xd807159630609366585117181a6ab1127bb09838` |
| mUSDC (token) | `0x61ffd23e5b553da8b3d42f8d072cb0263396d14b` |

---

## Known Caveats

- **C3 WARN (expected)**: `Mirror.executableBalance()` reverts with `0x99dd405f` on this Vara.eth runtime version — it is a Gear-internal error that fires when the program's executable balance slot is not yet initialised via the Router. Use the ethexe CLI `executable-balance-top-up` to fund it. The `stateHash` check (C4) is the reliable proxy for "program is live".
- **Q2 WARN (expected)**: The Mirror contract does not expose direct EVM `view` reads for program state. The test falls back to scanning `StreamCreated` event logs from the Escrow contract as a proxy. This is reliable within the 90 000-block RPC log window.
- **Callback timing**: Vara.eth runtime processes async replies per Ethereum block (~12s). Allow 2–4 minutes for `StreamCreated` and `StopConfirmed`. `DepositConfirmed` / `WithdrawConfirmed` are unit-return and typically arrive in 1–2 blocks.
- **Unit-return fallback**: `replyOn_streamServiceRecordDeposit(bytes32,())` hits the `fallback()` function in `StreamEscrow.sol`. If `AsyncCallFailed` fires instead, check the fallback selector hash matches `keccak256("replyOn_streamServiceRecordDeposit(bytes32,())")`.
- **WithdrawableBalance vs actual streams**: The Mirror ABI query uses `uint64 nowSecs` — pass `block.timestamp` not JS `Date.now()/1000`.
- **claimable = 0 after stop**: Expected if 100% of the deposit was streamed by the time stop is called. Use a large deposit relative to flow rate in tests.
- **Mint Seeds**: `VARA_ETH_QUEST_SEEDS_MIRROR` is optional. Skip M tests if not deployed.

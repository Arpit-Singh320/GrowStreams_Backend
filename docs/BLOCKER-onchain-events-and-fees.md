# BLOCKER: On-chain events not emitted + no protocol fee

Status: **Open — requires smart-contract changes + redeploy (outside backend scope)**
Found: Phase B liveness testing, June 2026
Impact: Blocks the Phase 2 grant KPIs for volume, DAU, MAU, unique wallets, streams count, and protocol fees.

---

## B-EVENTS — Contracts declare events but never emit them

### What we proved (live mainnet test)
1. Deposited native VARA into the TokenVault via `VaultService.DepositNative` (real tx,
   blockHash `0x31699f06…`, response `{ok:null}`).
2. Subscribed to raw `UserMessageSent` AND the sails-js `TokensDeposited` event during a deposit.
3. Result: **raw vault messages = 1, sails TokensDeposited events = 0.**
4. The one message was a **reply to the caller** (`destination = caller`, payload
   `VaultService.DepositNative`), NOT an event broadcast to `ZERO_ADDRESS`.
5. Source confirmation: `grep` for `emit_event` / `self.emit` in
   `contracts/stream-core/src/lib.rs` and `contracts/token-vault/src/lib.rs` → **zero matches.**

### Conclusion
The IDLs (`stream-core.idl`, `token-vault.idl`) declare `events { StreamCreated, Withdrawn,
TokensDeposited, … }`, but the deployed contracts **never call the Gear event-emission
mechanism**. Gear/sails events are messages sent to `ZERO_ADDRESS`; the contracts only return
replies to callers. So there is nothing for an indexer to capture.

### Why this matters
The event indexer (`api/src/services/event-indexer.mjs`) is correctly written and subscribes
properly — verified the parser loads all events and `subscribe` is live. But it captures 0 rows
because **no events are emitted**. This is NOT a backend bug; it is a contract gap.

Every on-chain activity KPI depends on this:
- Unique wallets that created/received streams (500+)
- DAU (40+), MAU (300+)
- Total streams created (1,500+)
- Total streaming volume ($25,000+) — also needed for the DeFiLlama **volume** adapter

### Required fix (contract team)
1. Add `self.emit_event(Event::…)` (or the sails `#[event]` emission) at each state change in
   `stream-core` (StreamCreated/Updated/Stopped/Paused/Resumed/Withdrawn/Deposited/Liquidated)
   and `token-vault` (TokensDeposited/TokensWithdrawn/StreamAllocated/…).
2. Redeploy both contracts to Vara mainnet.
3. Re-run the Phase B liveness test to confirm events now fire to `ZERO_ADDRESS`.
4. THEN backend Phase A (historical backfill + block cursor) and the volume pipeline become viable.

### Backend interim option (if contracts can't change soon)
Capture activity from the **backend command path** only (already done): when the API signs a
tx via `command()`, log it. Limitation: misses wallet-signed (payload-mode) transactions that
bypass the backend — so counts undercount real usage. This is the current
`backend_command_logs_fallback` mode. Not sufficient for the on-chain-verified KPIs, but keeps
the dashboard populated for backend-routed actions.

---

## B-FEES — No protocol fee in the contract

### What we found
`grep` for fee logic (`fee`, `2.5`, `fee_bps`, `protocol_fee`, `collect_fee`) in
`contracts/stream-core/src/lib.rs` → **no protocol-fee logic exists.**

### Why this matters
KPI: "Protocol fees generated $250+ — On-chain fee contract, 2.5% protocol fee on streamed
value." The 2.5% fee is **not charged anywhere on-chain**, so it cannot be measured or
reported. There is no fee contract/accumulator to read.

### Required fix (contract team)
1. Implement the 2.5% protocol fee in `stream-core` (deduct on withdrawal/settlement, accrue to
   a fee account/treasury).
2. Redeploy.
3. Expose the accrued fee via a query the backend can read for the dashboard + any DeFiLlama
   fees adapter.

---

## Recommended decision
Both KPIs (on-chain activity/volume, and fees) are blocked on **contract changes + redeploy**,
not backend code. Decision needed from the team:
- Prioritize the contract changes (emit events + add fee) and redeploy, then resume backend
  Phases A/C/D and the fee metric; OR
- Renegotiate / re-scope these specific KPIs with the Vara Foundation.

Backend work that does NOT depend on this and can proceed now: TVL (done), platform metrics
(done), and the DeFiLlama **TVL** adapter (done, pending real TVL).

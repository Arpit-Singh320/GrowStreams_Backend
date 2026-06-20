# GrowStreams Phase 2 KPIs — Current State, Blockers & Proposal

Prepared for: **GrowStreams dev team + Vara Foundation**
Date: June 2026
Author: Engineering (analytics/TVL workstream)

This document reports the verified technical state of the Phase 2 KPI infrastructure,
the blockers found through live on-chain testing, and concrete proposals. All claims
below were verified against Vara **mainnet** (genesis `0xfe1b4c55…c53763`), not assumed.

---

## 1. Executive summary

- **TVL infrastructure is DONE and correct.** Live on-chain balances, honest pricing,
  and a DeFiLlama-ready TVL adapter all verified and consistent.
- **Volume / DAU / MAU / streams-count / fees are BLOCKED** — not by backend code, but by
  two **smart-contract gaps** found via live testing:
  1. The contracts **declare events in their IDLs but never emit them on-chain.**
  2. The contracts **charge no protocol fee** (the 2.5% fee does not exist on-chain).
- These require **contract changes + redeploy**, outside the backend's control.
- **Context:** Vara currently has **$0 DeFi TVL on DeFiLlama** and **no DeFi protocol
  indexed** (verified via DeFiLlama API — zero protocols list "Vara"). GrowStreams would be
  **the first TVL-bearing DeFi protocol on Vara to integrate DeFiLlama.** This is genuinely
  novel work on this chain, which is why the tooling has to be built from first principles.

---

## 2. KPI-by-KPI status (verified)

| KPI | Target | Status | Blocker |
|-----|--------|--------|---------|
| **DeFiLlama TVL integration** | Live | 🟢 **Ready** | Adapter built + tested; needs real TVL to list |
| Average TVL maintained | $10k+ | 🟡 Measurable, low | Needs real deposits (infra works) |
| **DeFiLlama volume integration** | Live | 🔴 **Blocked** | Contracts emit no events |
| Total streaming volume | $25k+ | 🔴 Blocked | No event data to sum |
| Unique wallets w/ streams | 500+ | 🔴 Blocked | No on-chain event capture |
| DAU / MAU | 40+ / 300+ | 🔴 Blocked (on-chain) | No event capture; platform DAU works off-chain |
| Total streams created | 1,500+ | 🔴 Blocked | StreamCore emits no StreamCreated event |
| Protocol fees generated | $250+ | 🔴 Blocked | No fee logic in contract |
| 30-day retention | 25%+ | 🟡 Partial | Off-chain quest data exists; on-chain needs events |
| Public analytics dashboard | Live | 🟢 **Live** | Done; refreshes < 24h |
| Community size | 10,000+ | ⚪ Non-engineering | — |

Legend: 🟢 done · 🟡 partial/measurable · 🔴 blocked · ⚪ out of scope

---

## 3. The two blockers (with proof)

### 3.1 BLOCKER A — Contracts do not emit on-chain events

**How we proved it (live mainnet, reproducible):**
1. Deposited native VARA into TokenVault via `VaultService.DepositNative`
   (real tx — blockHash `0x31699f06…`, response `{ok:null}`).
2. Subscribed simultaneously to raw Gear `UserMessageSent` and the sails-js
   `TokensDeposited` event.
3. **Raw vault messages = 1; sails `TokensDeposited` events = 0.**
4. The single message was a **reply to the caller** (destination = caller address,
   payload `VaultService.DepositNative`), NOT an event broadcast to `ZERO_ADDRESS`.
5. Source check: zero `emit_event` / `self.emit` calls in
   `contracts/stream-core/src/lib.rs` or `contracts/token-vault/src/lib.rs`.

**Conclusion:** The `events { … }` blocks in the IDLs are declarations only. Gear/sails
events are messages to `ZERO_ADDRESS`; our contracts only return replies. The event
indexer (`event-indexer.mjs`) is correctly implemented and subscribed — verified the
parser loads all 8 stream + 7 vault events and `subscribe` is live — but it captures **0
rows because nothing is emitted.** This is a contract gap, not a backend bug.

**Fix (contract team):** add event emission at each state change in stream-core
(StreamCreated/Updated/Stopped/Paused/Resumed/Withdrawn/Deposited/Liquidated) and
token-vault (TokensDeposited/TokensWithdrawn/…), then redeploy. Re-run the liveness test
to confirm events fire to `ZERO_ADDRESS`.

### 3.2 BLOCKER B — No protocol fee on-chain

`grep` for fee logic (`fee`, `2.5`, `fee_bps`, `protocol_fee`, `collect_fee`) in
`stream-core/src/lib.rs` → **no matches.** The 2.5% fee in the KPI is not charged
anywhere on-chain, so it cannot be measured or reported. Requires a contract change
(deduct fee on settlement, accrue to a treasury/fee account) + redeploy + a query to read
the accrued total.

---

## 4. What IS done and working (no blocker)

- **Live on-chain TVL**: reads VFT `BalanceOf(vault)` per token + real native VARA
  balance. gVARA (SuperTokenService) + wVARA + native VARA, summed and priced as VARA.
- **Honest pricing & data integrity**: fixed a 100× wVARA mispricing and a mislabeled
  "155 VARA" (was an all-token accounting counter, not native VARA); purged test/mock data.
- **DeFiLlama TVL adapter**: reads Vara RPC directly (`gear_calculateReplyForHandle` +
  `state_getStorage`), axios-only, no project API — fully DeFiLlama-compliant. Output
  matches the backend exactly. Held until real TVL exists (DeFiLlama won't list dust).
- **Platform analytics**: full off-chain coverage — distinct users across both
  registration systems (~1.8k wallets), quests, XP, campaigns, invites, referrals,
  vouchers, seasons. Off-chain platform DAU works today.

---

## 5. Options to move forward

### Option 1 — Fix the contracts (correct, unblocks everything)
Add event emission + the 2.5% fee to stream-core/token-vault and redeploy. Then the
backend resumes: historical backfill + block-cursor indexer → real volume/DAU/MAU/streams
→ DeFiLlama volume adapter → fee metric. **Recommended** if a redeploy is feasible in the
grant window.

### Option 2 — Hybrid tx-hash attestation (interim, partially trustless)
The backend already records `block_hash` + `extrinsic_hash` for every **backend-signed**
transaction (verified: `command()` returns real hashes; schema has the columns). We can:
- Add a "report your tx hash" endpoint for **wallet-signed** (payload-mode) transactions —
  the same pattern bridges already use (`sourceTxHash` is client-reported today).
- Expose the list of tx hashes; a DeFiLlama/anyone can **verify each hash on-chain** and
  recompute volume independently.

**Strengths:** hashes are cryptographically verifiable on the explorer; more trustless
than raw backend logs; works without a contract redeploy.
**Limitations:** (a) covers only transactions that flow through (or report back to) the
backend — a wallet-signed tx that never reports its hash is invisible; (b) requires
frontend changes to report hashes; (c) DeFiLlama's standard volume adapters expect
chain-derived data, so a hash-attestation feed may need their reviewer's sign-off as a
non-standard methodology. Good as a **bridge to Option 1**, not a permanent substitute.

### Option 3 — Re-scope the KPIs with the Foundation
If contract redeploy isn't feasible in the grant window, propose adjusting the on-chain
activity/volume/fee KPIs — e.g. measure **TVL + platform engagement** (both real and
working now) for this tranche, and move volume/fees to a follow-up milestone tied to the
contract upgrade.

---

## 6. Is this novel on Vara?

**Yes — verified.** DeFiLlama recognizes "Vara" as a chain, but:
- Querying DeFiLlama's protocol API returns **zero protocols** listing Vara.
- The only Vara entry in the ecosystem is **Vara Bridge** (a bridge, not a TVL DeFi app).
- Vara chain TVL on DeFiLlama is effectively **$0**.

There is **no existing streaming/DEX/lending protocol with a DeFiLlama TVL or volume
adapter on Vara.** The non-EVM (Gear/Substrate) adapter pattern we built — reading
contract state via `gear_calculateReplyForHandle` and account balances via
`state_getStorage`, with hand-rolled SCALE encode/decode and no `@polkadot/api` — is not a
copy of an existing Vara adapter; it was built from first principles against DeFiLlama's
non-EVM conventions. So this is **early, novel integration work for the Vara ecosystem**,
not a well-trodden path. That also explains why the contract-side event/fee gaps surfaced
only now: no prior project on Vara had driven analytics + DeFiLlama integration to this
depth.

---

## 7. Recommendation

1. **Contract team:** prioritize adding (a) event emission and (b) the 2.5% fee, then
   redeploy. This single change unblocks 6 of the Phase 2 KPIs.
2. **In parallel:** implement Option 2 (hybrid tx-hash attestation) as an interim feed so
   the dashboard shows verifiable volume sooner and to de-risk the DeFiLlama volume
   submission.
3. **Foundation:** if the redeploy cannot land in the grant window, consider Option 3 —
   accept TVL + platform metrics for this tranche and tie volume/fees to the contract
   upgrade milestone.

Backend work that needs no contract change (TVL, platform analytics, the TVL adapter) is
already complete and verified.

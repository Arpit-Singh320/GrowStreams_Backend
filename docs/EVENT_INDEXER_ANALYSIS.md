# Event Indexer Analysis & Volume Adapter Roadmap

**Generated:** 2026-06-20
**Objective:** Enable DeFiLlama Volume adapter for GrowStreams
**Dependency:** Reliable on-chain event indexer

---

## Executive Summary

The existing event indexer (developed by another team member) is functional but has critical gaps that prevent it from supporting the Volume adapter and KPI requirements. The indexer currently captures events via live subscription but lacks historical backfill, restart recovery, and comprehensive volume computation.

**Key Finding:** The indexer itself is ~10% of the total effort. The remaining ~90% is split between indexer hardening (60%), volume computation (20%), and other integration work (10%).

---

## Current State Assessment

### What Works
- ✅ Live event subscription via Gear API event system
- ✅ Captures stream events (sender/receiver) and vault events (deposits/withdrawals)
- ✅ Bridge transaction tracking
- ✅ Database schema in place (`on_chain_events` table)
- ✅ Integration with analytics service for wallet counting

### Critical Gaps

| Gap | Severity | Impact | Layer |
|-----|----------|--------|-------|
| **No historical backfill** | 🔴 Critical | Cumulative volume KPI requires all-time data | 2 |
| **No restart recovery** | 🔴 Critical | Lost events = permanently wrong volume data | 2 |
| **No protocol fee logic** | 🔴 Critical | $250+ protocol fees KPI cannot be measured | 1 |
| **Volume limited to stablecoins** | 🟡 Medium | gVARA/wVARA streams not valued in USD | 3 |
| **Liveness unverified** | 🟡 Medium | End-to-end path never tested with real events | 2 |
| **DeFiLlama constraints** | 🟢 Low | Same axios-only pattern as TVL adapter | 5 |

---

## Detailed Blocker Analysis

### B0: CONTRACTS DO NOT EMIT EVENTS (CRITICAL - BLOCKS EVERYTHING)
**Problem:** Liveness test revealed that neither token-vault nor stream-core contracts emit events. The IDL declares event interfaces, but the Rust implementation never calls `emit()`. Contracts only send replies to callers, never broadcast events to ZERO_ADDRESS.

**Evidence:**
- Vault deposit test: Only 1 UserMessageSent (reply to caller, dest=0x868111d8...)
- Contract source grep: No `emit` or `event` calls found in token-vault or stream-core
- Sails-js subscription filters require destination === ZERO_ADDRESS (events)
- All contract messages go to caller addresses (replies), not ZERO_ADDRESS

**Impact:**
- ❌ Event subscription indexing is **fundamentally impossible**
- ❌ Current indexer strategy cannot work (no events to subscribe to)
- ❌ Volume adapter cannot rely on event-based indexing
- ❌ All event-based approaches (B1, B2, B5) are blocked

**Solution Required:** Complete indexing strategy redesign. Options:
1. **State-based indexing**: Read contract state directly, compute deltas between blocks
2. **Extrinsic-based indexing**: Parse transaction extrinsics, reconstruct state changes
3. **Hybrid backend logs**: Use existing command logs (not DeFiLlama-compliant)

**Status:** CRITICAL BLOCKER - Requires architectural decision before proceeding

---

### B1: No Historical Backfill (Critical - BLOCKED BY B0)
**Problem:** Subscription-only model means events before indexer start are lost forever. Cumulative volume KPI requires complete historical data.

**Impact:**
- Volume metrics will be incomplete from day one
- Cannot answer "all-time volume" questions
- Historical TVL snapshots cannot be reconstructed

**Solution:** Add block-scanning backfill from contract deploy block to present, then switch to live subscription.

**BLOCKED BY:** B0 - Event subscription impossible, need different approach

---

### B2: No Restart Recovery (Critical - BLOCKED BY B0)
**Problem:** No persistent block cursor. On restart, indexer loses its position and cannot resume. Events during downtime are permanently lost.

**Impact:**
- Network blips = data gaps
- Server restarts = missing volume
- Cannot be "enterprise-grade" without durability

**Solution:** Implement persistent block cursor (database) with resume capability on restart.

**BLOCKED BY:** B0 - Event subscription impossible, need different approach

---

### B3: No Protocol Fee Logic (Critical - Contract Level)
**Problem:** Contract analysis shows no 2.5% fee mechanism in stream-core. The "$250+ protocol fees" KPI cannot be measured because the fee isn't charged on-chain.

**Impact:**
- Protocol fee KPI is unmeasurable with current contract
- This is a contract-level gap, not a backend gap

**Solution Options:**
1. Add fee logic to stream-core contract + redeploy
2. Renegotiate/drop this KPI
3. Track fees off-chain (not recommended for DeFiLlama)

**Action Required:** Escalate to contract team immediately.

---

### B4: Volume Only Counts Stablecoin Withdrawals (Medium)
**Problem:** `getVolumeMetrics` currently only values stablecoin withdrawals. gVARA and wVARA streams are not included in USD volume.

**Impact:**
- Volume undercounted (missing VARA-denominated streams)
- Doesn't reflect actual protocol activity

**Solution:** Extend volume computation to value all token streams using existing pricing infrastructure (VARA price from CoinGecko).

---

### B5: Liveness Unverified (Medium)
**Problem:** Zero rows captured so far. Not necessarily a bug (no mainnet activity), but the end-to-end path has never actually fired.

**Impact:**
- Cannot confirm indexer works in production
- Risk of discovering bugs only after deployment

**Solution:** Create one real testnet/mainnet stream or withdrawal, verify `on_chain_events` row lands.

---

### B6: DeFiLlama Dimension-Adapter Constraints (Low)
**Problem:** Volume adapter must follow same rules as TVL adapter: axios-only, no @polkadot/api, no project API calls.

**Impact:**
- Cannot use existing sails-js infrastructure
- Must use raw Gear JSON-RPC + manual SCALE decoding

**Solution:** Reuse pattern from TVL adapter (already solved).

---

## Recommended Phased Approach

### Phase A: Make Indexer Trustworthy (B1, B2)
**Goal:** Add historical backfill + persistent cursor for restart recovery

**Components:**
1. Block-scanning backfill from contract deploy block
2. Persistent block cursor in database
3. Resume logic on restart (scan from last cursor)
4. Idempotency handling (skip already-processed events)
5. Hybrid model: backfill once → live subscribe → resume on restart

**Complexity:** High
**Effort:** ~60% of total work

---

### Phase B: Verify Liveness (B5)
**Goal:** Prove indexer captures real events end-to-end

**Components:**
1. Create one real stream or withdrawal on testnet/mainnet
2. Verify `on_chain_events` row appears
3. Confirm all fields populated correctly
4. Test restart recovery (if Phase A complete)

**Complexity:** Low
**Effort:** ~5% of total work

**Recommendation:** Do this BEFORE Phase A to de-risk the foundation.

---

### Phase C: Volume USD Computation (B4)
**Goal:** Extend volume metrics to value all token streams

**Components:**
1. Modify `getVolumeMetrics` to include gVARA/wVARA
2. Reuse existing CoinGecko pricing for VARA
3. Handle per-token valuation with proper decimals
4. Deduplication to avoid double-counting
5. Expose clean volume series (24h/7d/30d/all-time)

**Complexity:** Medium
**Effort:** ~20% of total work

---

### Phase D: Volume Dimension-Adapter (B6)
**Goal:** Build DeFiLlama volume adapter

**Components:**
1. Reuse TVL adapter's axios/RPC pattern
2. Query `on_chain_events` or compute from chain state
3. Format for DeFiLlama dimension-adapter spec
4. Test locally before PR submission

**Complexity:** Low–Medium
**Effort:** ~10% of total work

---

### Separate Track: Protocol Fee (B3)
**Goal:** Enable $250+ protocol fees KPI

**Status:** Blocked on contract change

**Action Required:**
1. Document gap for contract team
2. Decision point: add fee + redeploy OR drop KPI
3. Not solvable by backend alone

---

## Complexity Breakdown

| Component | Complexity | Notes |
|-----------|------------|-------|
| Indexer backfill + cursor (Phase A) | High | Block scanning, decode historical UserMessageSent, cursor persistence, idempotency. The hard part. |
| Liveness test (Phase B) | Low | One real tx + verify |
| Volume USD computation (Phase C) | Medium | Reuses pricing; needs careful per-token valuation + dedup |
| Volume dimension-adapter (Phase D) | Low–Medium | Pattern already solved with TVL adapter |
| Protocol fee (B3) | High + out of scope | Contract change + redeploy + audit |

---

## Recommendations

### Immediate Actions
1. **Run Phase B (liveness test) first** - Prove the foundation works before building on it
2. **Escalate B3 (protocol fee)** to contract team - This is a contract-level blocker that needs immediate attention
3. **Plan Phase A (indexer hardening)** in detail after liveness is confirmed

### Build Strategy
1. **Build on the existing indexer** - It's good work, don't replace it
2. **Add backfill + cursor** - Make it production-grade
3. **Verify with real events** - Don't assume it works without testing
4. **Then build volume computation** - Once data flow is solid
5. **Finally, the adapter** - Small piece, last step

### Risk Mitigation
- **Phase B first** de-risks the entire effort
- **Phase A second** ensures data durability
- **Protocol fee escalation** prevents wasted effort on unmeasurable KPI

---

## Next Steps

**Option A:** Plan Phase A (indexer backfill/cursor) in detail
**Option B:** Run Phase B liveness test first to de-risk
**Option C:** Write up B3 contract-fee blocker as formal note for contract team

**Recommended Order:** B → A → C → D (with B3 escalated in parallel)

---

## Appendix: Contract Analysis

### Protocol Fee Gap
Grepped `stream-core` contract source - no 2.5% fee mechanism found. The fee logic needs to be added to the contract before the protocol fees KPI can be measured.

### Event Types Captured
- Stream events: sender, receiver, amount, timestamp
- Vault events: deposits, withdrawals, wallet
- Bridge transactions: wallet, completed_at

### Database Schema
`on_chain_events` table exists with appropriate fields for event storage and querying.

---

**Report Status:** Ready for review
**Next Decision:** Choose starting phase (recommended: Phase B liveness test)

#![no_std]

//! Distribution Pool — Superfluid-style GDA (General Distribution Agreement) for GrowStreams.
//!
//! A pool holds Super Token units assigned to members. Two distribution modes:
//!
//! ## Instant Distribution
//! Admin calls `distribute(amount)`. The `settled_value_per_unit` index advances by
//! `amount / total_units`. Each member can `claim()` their owed share at any time:
//!   owed = (settled_value_per_unit - member_settled_snapshot) * member_units
//!
//! This is O(1) gas regardless of member count — identical to Superfluid's IDA.
//!
//! ## Streaming Distribution
//! Admin opens a stream TO the pool via stream-core. The pool contract is registered
//! as a Super Token flow controller. As tokens flow in, the pool advances the
//! `settled_value_per_unit` index in real-time based on `inflow_rate_per_unit`
//! (the pool's incoming flow rate / total_units). Members' claimable amounts grow
//! continuously without any per-second transactions.
//!
//! ## Super Token cross-contract calls
//! All token movements use the registered `super_token` contract:
//!   - `distribute` debits admin's super token via `TransferFrom`
//!   - `claim` credits member via `Transfer`
//!   - `set_inflow_rate` calls `UpdateFlow` on the super token to register the pool's stream
//!
//! ## Design choices matching Superfluid GDA
//! - Units are unsigned integers (not percentages) — proportional shares
//! - Admin manages unit allocation; members cannot self-assign units
//! - A member with 0 units receives nothing
//! - Precision: values are scaled by PRECISION (1e18) to avoid integer truncation

use sails_rs::{
    cell::RefCell,
    collections::BTreeMap,
    gstd::{exec, msg},
    prelude::*,
};
use gstd::msg as gstd_msg;
use parity_scale_codec::Decode as ScaleDecode;

// ---------------------------------------------------------------------------
// Precision scalar — prevents truncation in per-unit index arithmetic
// ---------------------------------------------------------------------------
const PRECISION: u128 = 1_000_000_000_000_000_000u128; // 1e18

// ---------------------------------------------------------------------------
// Cross-contract call helpers
// ---------------------------------------------------------------------------

fn encode_call(service: &str, method: &str, args: impl Encode) -> Vec<u8> {
    let mut payload = Vec::new();
    service.encode_to(&mut payload);
    method.encode_to(&mut payload);
    args.encode_to(&mut payload);
    payload
}

/// Decode a bool reply from a super-token Transfer / TransferFrom call.
fn decode_bool_reply(reply_bytes: &[u8]) -> bool {
    if reply_bytes.is_empty() { return true; }
    {
        let mut input = &reply_bytes[..];
        if <String as ScaleDecode>::decode(&mut input).is_ok()
            && <String as ScaleDecode>::decode(&mut input).is_ok()
        {
            if let Ok(b) = <bool as ScaleDecode>::decode(&mut input) { return b; }
        }
    }
    if reply_bytes.len() == 1 { return reply_bytes[0] != 0; }
    let last = reply_bytes[reply_bytes.len() - 1];
    if last == 0 { return false; }
    if last == 1 { return true; }
    false
}

/// Decode Result<(), str> from super-token UpdateFlow reply.
fn decode_result_ok(reply_bytes: &[u8]) -> bool {
    if reply_bytes.is_empty() { return true; }
    {
        let mut input = &reply_bytes[..];
        if <String as ScaleDecode>::decode(&mut input).is_ok()
            && <String as ScaleDecode>::decode(&mut input).is_ok()
        {
            return input.first().map(|&b| b == 0x00).unwrap_or(false);
        }
    }
    if reply_bytes.len() == 1 { return reply_bytes[0] == 0x00; }
    false
}

/// Call super-token Transfer (pool → member).
async fn super_token_transfer(super_token: ActorId, to: ActorId, amount: u128) -> bool {
    let payload = encode_call("SuperTokenService", "Transfer", (to, amount));
    let reply = match gstd_msg::send_bytes_for_reply(super_token, payload, 0, 0) {
        Ok(f) => match f.await { Ok(b) => b, Err(_) => return false },
        Err(_) => return false,
    };
    decode_bool_reply(reply.as_slice())
}

/// Call super-token TransferFrom (admin → pool).
async fn super_token_transfer_from(
    super_token: ActorId,
    from: ActorId,
    to: ActorId,
    amount: u128,
) -> bool {
    let payload = encode_call("SuperTokenService", "TransferFrom", (from, to, amount));
    let reply = match gstd_msg::send_bytes_for_reply(super_token, payload, 0, 0) {
        Ok(f) => match f.await { Ok(b) => b, Err(_) => return false },
        Err(_) => return false,
    };
    decode_bool_reply(reply.as_slice())
}

/// Call super-token UpdateFlow — used by set_inflow_rate to register pool's stream.
async fn super_token_update_flow(
    super_token: ActorId,
    sender: ActorId,
    receiver: ActorId,
    delta: u128,
    is_increase: bool,
) -> bool {
    let payload = encode_call(
        "SuperTokenService",
        "UpdateFlow",
        (sender, receiver, delta, is_increase),
    );
    let reply = match gstd_msg::send_bytes_for_reply(super_token, payload, 0, 0) {
        Ok(f) => match f.await { Ok(b) => b, Err(_) => return false },
        Err(_) => return false,
    };
    decode_result_ok(reply.as_slice())
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

pub type PoolId = u64;

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct MemberState {
    /// Number of units this member holds.
    pub units: u128,
    /// Snapshot of `settled_value_per_unit` at last claim or unit update.
    pub settled_snapshot: u128,
    /// Total amount claimed by this member (cumulative).
    pub total_claimed: u128,
}

impl MemberState {
    fn new() -> Self {
        Self { units: 0, settled_snapshot: 0, total_claimed: 0 }
    }
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct PoolState {
    pub id: PoolId,
    pub admin: ActorId,
    /// The Super Token contract this pool distributes.
    pub super_token: ActorId,
    /// Total units across all members.
    pub total_units: u128,
    /// Scaled index: total tokens distributed per unit × PRECISION.
    /// Advances with every instant distribution and every streaming tick.
    pub settled_value_per_unit: u128,
    /// Per-second inflow rate (from an active stream into this pool).
    /// 0 = no active streaming distribution.
    pub inflow_rate: u128,
    /// Timestamp (seconds) when inflow_rate was last set.
    pub inflow_updated_at: u64,
    /// Total tokens distributed (instant + streaming, settled amounts only).
    pub total_distributed: u128,
    pub created_at: u64,
    pub updated_at: u64,
}

impl PoolState {
    /// Advance the settled_value_per_unit index for elapsed streaming inflow.
    /// This should be called before any operation that reads claimable amounts.
    fn tick(&mut self, now: u64) {
        if self.inflow_rate == 0 || self.total_units == 0 || now <= self.inflow_updated_at {
            self.inflow_updated_at = now;
            return;
        }
        let elapsed = (now - self.inflow_updated_at) as u128;
        let inflow = self.inflow_rate.saturating_mul(elapsed);
        let delta_per_unit = inflow.saturating_mul(PRECISION) / self.total_units;
        self.settled_value_per_unit =
            self.settled_value_per_unit.saturating_add(delta_per_unit);
        self.total_distributed = self.total_distributed.saturating_add(inflow);
        self.inflow_updated_at = now;
    }
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct PoolConfig {
    pub admin: ActorId,
    pub total_pools: u64,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct ClaimPreview {
    pub member: ActorId,
    pub claimable: u128,
    pub units: u128,
    pub total_claimed: u128,
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

pub struct DistributionPoolState {
    pub admin: ActorId,
    pub next_pool_id: PoolId,
    pub pools: BTreeMap<PoolId, PoolState>,
    pub members: BTreeMap<(PoolId, ActorId), MemberState>,
    /// pools owned by each admin
    pub admin_pools: BTreeMap<ActorId, Vec<PoolId>>,
}

impl DistributionPoolState {
    fn new(admin: ActorId) -> Self {
        Self {
            admin,
            next_pool_id: 1,
            pools: BTreeMap::new(),
            members: BTreeMap::new(),
            admin_pools: BTreeMap::new(),
        }
    }

    fn claimable_for(pool: &PoolState, member: &MemberState, now: u64) -> u128 {
        // Compute real-time settled_value_per_unit (includes streaming inflow)
        let mut vpu = pool.settled_value_per_unit;
        if pool.inflow_rate > 0 && pool.total_units > 0 && now > pool.inflow_updated_at {
            let elapsed = (now - pool.inflow_updated_at) as u128;
            let inflow = pool.inflow_rate.saturating_mul(elapsed);
            let delta = inflow.saturating_mul(PRECISION) / pool.total_units;
            vpu = vpu.saturating_add(delta);
        }
        let earned_scaled = vpu.saturating_sub(member.settled_snapshot);
        let earned = earned_scaled.saturating_mul(member.units) / PRECISION;
        earned
    }
}

static mut GLOBAL_STATE: Option<DistributionPoolState> = None;

fn gstate() -> &'static DistributionPoolState {
    unsafe { GLOBAL_STATE.as_ref().expect("State not initialized") }
}

fn gstate_mut() -> &'static mut DistributionPoolState {
    unsafe { GLOBAL_STATE.as_mut().expect("State not initialized") }
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

pub struct DistributionPoolProgram;

#[program]
impl DistributionPoolProgram {
    pub fn new() -> Self {
        let admin = msg::source();
        unsafe {
            GLOBAL_STATE = Some(DistributionPoolState::new(admin));
        }
        Self
    }

    pub fn pool_service(&self) -> PoolService {
        PoolService
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

pub struct PoolService;

impl PoolService {
    pub fn new() -> Self { Self }
}

#[service]
impl PoolService {

    // -----------------------------------------------------------------------
    // Pool lifecycle
    // -----------------------------------------------------------------------

    /// Create a new distribution pool for a given Super Token.
    /// The caller becomes the pool admin.
    #[export]
    pub fn create_pool(&mut self, super_token: ActorId) -> PoolId {
        assert!(super_token != ActorId::zero(), "Super token must be set");
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;
        let s = gstate_mut();
        let id = s.next_pool_id;
        s.next_pool_id += 1;

        let pool = PoolState {
            id,
            admin: caller,
            super_token,
            total_units: 0,
            settled_value_per_unit: 0,
            inflow_rate: 0,
            inflow_updated_at: now,
            total_distributed: 0,
            created_at: now,
            updated_at: now,
        };

        s.pools.insert(id, pool);
        s.admin_pools.entry(caller).or_insert_with(Vec::new).push(id);
        id
    }

    // -----------------------------------------------------------------------
    // Unit management (pool admin only)
    // -----------------------------------------------------------------------

    /// Set the number of units for a member.
    /// Setting units to 0 effectively removes the member from distributions.
    /// Any pending claimable amount is preserved in their snapshot.
    #[export]
    pub fn set_units(
        &mut self,
        pool_id: PoolId,
        member: ActorId,
        new_units: u128,
    ) -> Result<(), &'static str> {
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;
        let s = gstate_mut();

        let pool = s.pools.get_mut(&pool_id).ok_or("Pool not found")?;
        if pool.admin != caller { return Err("Unauthorized"); }

        // Tick: advance streaming index before changing unit counts
        pool.tick(now);
        pool.updated_at = now;

        let key = (pool_id, member);
        let m = s.members.entry(key).or_insert_with(MemberState::new);

        // Preserve already-earned but unclaimed amount in snapshot
        // by recording the current pool index as their new base.
        // (They keep their old earned amount because total_claimed is separate.)
        let old_units = m.units;
        m.settled_snapshot = pool.settled_value_per_unit;
        m.units = new_units;

        // Update total_units
        let pool = s.pools.get_mut(&pool_id).unwrap();
        pool.total_units = pool.total_units
            .saturating_sub(old_units)
            .saturating_add(new_units);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Instant distribution
    // -----------------------------------------------------------------------

    /// Distribute `amount` tokens instantly to all current unit holders.
    /// Caller must have approved `amount` of super tokens to this contract first.
    /// Any dust (due to integer truncation) stays in the pool's allowance.
    #[export]
    pub async fn distribute(
        &mut self,
        pool_id: PoolId,
        amount: u128,
    ) -> Result<(), &'static str> {
        if amount == 0 { return Err("ZeroAmount"); }
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        let (super_token, pool_actor) = {
            let s = gstate();
            let pool = s.pools.get(&pool_id).ok_or("Pool not found")?;
            if pool.admin != caller { return Err("Unauthorized"); }
            if pool.total_units == 0 { return Err("NoMembers"); }
            (pool.super_token, exec::program_id())
        };

        // Pull tokens from admin into the pool contract via TransferFrom.
        // Admin must have called super_token.approve(pool_contract, amount) first.
        let ok = super_token_transfer_from(super_token, caller, pool_actor, amount).await;
        if !ok { return Err("TransferFromFailed"); }

        // Advance index
        let s = gstate_mut();
        let pool = s.pools.get_mut(&pool_id).unwrap();
        pool.tick(now);
        let delta_per_unit = amount.saturating_mul(PRECISION) / pool.total_units;
        pool.settled_value_per_unit =
            pool.settled_value_per_unit.saturating_add(delta_per_unit);
        pool.total_distributed = pool.total_distributed.saturating_add(amount);
        pool.updated_at = now;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Streaming distribution
    // -----------------------------------------------------------------------

    /// Set (or update) the per-second inflow rate for a streaming distribution.
    ///
    /// This registers the pool as receiver of a super-token stream from `sender`
    /// at `flow_rate` tokens/second. The pool then distributes in real-time to
    /// all unit holders proportionally.
    ///
    /// Pass `flow_rate = 0` to stop the streaming distribution.
    #[export]
    pub async fn set_inflow_rate(
        &mut self,
        pool_id: PoolId,
        sender: ActorId,
        flow_rate: u128,
    ) -> Result<(), &'static str> {
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        let (super_token, old_rate, pool_actor) = {
            let s = gstate();
            let pool = s.pools.get(&pool_id).ok_or("Pool not found")?;
            if pool.admin != caller { return Err("Unauthorized"); }
            (pool.super_token, pool.inflow_rate, exec::program_id())
        };

        // Reverse old flow (if any)
        if old_rate > 0 {
            let ok = super_token_update_flow(super_token, sender, pool_actor, old_rate, false).await;
            if !ok { return Err("UpdateFlowReverseFailed"); }
        }

        // Apply new flow (if any)
        if flow_rate > 0 {
            let ok = super_token_update_flow(super_token, sender, pool_actor, flow_rate, true).await;
            if !ok { return Err("UpdateFlowFailed"); }
        }

        // Commit: tick first (settle accrued at old rate), then update rate
        let s = gstate_mut();
        let pool = s.pools.get_mut(&pool_id).unwrap();
        pool.tick(now);
        pool.inflow_rate = flow_rate;
        pool.inflow_updated_at = now;
        pool.updated_at = now;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Claim
    // -----------------------------------------------------------------------

    /// Claim all accrued tokens for the caller from a given pool.
    /// Transfers claimable super tokens from the pool contract to the caller.
    #[export]
    pub async fn claim(&mut self, pool_id: PoolId) -> Result<u128, &'static str> {
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        let (super_token, claimable) = {
            let s = gstate();
            let pool = s.pools.get(&pool_id).ok_or("Pool not found")?;
            let member = s.members.get(&(pool_id, caller)).ok_or("NotAMember")?;
            if member.units == 0 { return Err("ZeroUnits"); }
            let c = DistributionPoolState::claimable_for(pool, member, now);
            if c == 0 { return Err("NothingToClaim"); }
            (pool.super_token, c)
        };

        // Transfer tokens from pool contract to member
        let ok = super_token_transfer(super_token, caller, claimable).await;
        if !ok { return Err("TransferFailed"); }

        // Advance the pool index (tick), then update member snapshot
        let s = gstate_mut();
        let pool = s.pools.get_mut(&pool_id).unwrap();
        pool.tick(now);

        let member = s.members.get_mut(&(pool_id, caller)).unwrap();
        member.settled_snapshot = pool.settled_value_per_unit;
        member.total_claimed = member.total_claimed.saturating_add(claimable);

        Ok(claimable)
    }

    /// Claim on behalf of a member (permissionless — anyone can trigger).
    /// Useful for keepers to push distributions to inactive members.
    #[export]
    pub async fn claim_for(
        &mut self,
        pool_id: PoolId,
        member: ActorId,
    ) -> Result<u128, &'static str> {
        let now = exec::block_timestamp() / 1000;

        let (super_token, claimable) = {
            let s = gstate();
            let pool = s.pools.get(&pool_id).ok_or("Pool not found")?;
            let m = s.members.get(&(pool_id, member)).ok_or("NotAMember")?;
            if m.units == 0 { return Err("ZeroUnits"); }
            let c = DistributionPoolState::claimable_for(pool, m, now);
            if c == 0 { return Err("NothingToClaim"); }
            (pool.super_token, c)
        };

        let ok = super_token_transfer(super_token, member, claimable).await;
        if !ok { return Err("TransferFailed"); }

        let s = gstate_mut();
        let pool = s.pools.get_mut(&pool_id).unwrap();
        pool.tick(now);

        let m = s.members.get_mut(&(pool_id, member)).unwrap();
        m.settled_snapshot = pool.settled_value_per_unit;
        m.total_claimed = m.total_claimed.saturating_add(claimable);

        Ok(claimable)
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    #[export]
    pub fn get_pool(&self, pool_id: PoolId) -> Option<PoolState> {
        gstate().pools.get(&pool_id).cloned()
    }

    #[export]
    pub fn get_member_state(&self, pool_id: PoolId, member: ActorId) -> MemberState {
        gstate()
            .members
            .get(&(pool_id, member))
            .cloned()
            .unwrap_or_else(MemberState::new)
    }

    /// Preview how much a member can claim right now (real-time, includes streaming).
    #[export]
    pub fn get_claimable(&self, pool_id: PoolId, member: ActorId) -> u128 {
        let s = gstate();
        let now = exec::block_timestamp() / 1000;
        let pool = match s.pools.get(&pool_id) { Some(p) => p, None => return 0 };
        let m = match s.members.get(&(pool_id, member)) {
            Some(m) => m,
            None => return 0,
        };
        DistributionPoolState::claimable_for(pool, m, now)
    }

    /// Batch preview for all members of a pool (returns at most 100 entries).
    #[export]
    pub fn get_all_claimable(&self, pool_id: PoolId) -> Vec<ClaimPreview> {
        let s = gstate();
        let now = exec::block_timestamp() / 1000;
        let pool = match s.pools.get(&pool_id) { Some(p) => p, None => return Vec::new() };

        s.members
            .iter()
            .filter(|((pid, _), _)| *pid == pool_id)
            .take(100)
            .map(|((_, addr), m)| {
                let claimable = DistributionPoolState::claimable_for(pool, m, now);
                ClaimPreview {
                    member: *addr,
                    claimable,
                    units: m.units,
                    total_claimed: m.total_claimed,
                }
            })
            .collect()
    }

    #[export]
    pub fn get_admin_pools(&self, admin: ActorId) -> Vec<PoolId> {
        gstate()
            .admin_pools
            .get(&admin)
            .cloned()
            .unwrap_or_default()
    }

    #[export]
    pub fn total_pools(&self) -> u64 {
        gstate().pools.len() as u64
    }

    #[export]
    pub fn get_config(&self) -> PoolConfig {
        let s = gstate();
        PoolConfig {
            admin: s.admin,
            total_pools: s.pools.len() as u64,
        }
    }
}

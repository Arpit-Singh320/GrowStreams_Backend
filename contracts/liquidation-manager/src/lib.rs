#![no_std]

//! Liquidation Manager — solvency enforcement for GrowStreams Super Token streams.
//!
//! ## Responsibilities
//!
//! 1. **Solvency check**: `is_solvent(account, super_token)` queries the super token
//!    for real-time balance and net flow rate, returning how many seconds until the
//!    account runs dry.
//!
//! 2. **Liquidation**: `liquidate_stream(stream_id)` can be called by anyone when a
//!    stream's sender super token balance is critically low. It:
//!    a. Calls `stream-core.StopStream` to halt the flow immediately.
//!    b. Calls `super_token.SettleAccount(sender)` so the balance is materialised.
//!    c. Records the liquidation event on-chain for auditability.
//!    d. Optionally rewards the liquidator from the liquidation penalty buffer.
//!
//! 3. **Sentinel / top-up**: `top_up(stream_id, amount)` — any address can deposit
//!    super tokens on behalf of a stream sender to keep the stream alive, functioning
//!    as a Superfluid-style sentinel top-up mechanism.
//!
//! 4. **Risk scoring**: `get_stream_risk(stream_id)` returns a standardised struct
//!    with remaining seconds, health factor, and solvency status — used by the off-
//!    chain keeper cron to prioritise which streams to liquidate.
//!
//! ## No state migration needed
//! This contract is entirely additive — it stores its own liquidation history and
//! integrates with `stream-core` and `super-token` via cross-contract calls only.

use sails_rs::{
    collections::BTreeMap,
    gstd::{exec, msg},
    prelude::*,
};
use gstd::msg as gstd_msg;
use parity_scale_codec::Decode as ScaleDecode;

// ---------------------------------------------------------------------------
// Cross-contract helpers
// ---------------------------------------------------------------------------

fn encode_call(service: &str, method: &str, args: impl Encode) -> Vec<u8> {
    let mut payload = Vec::new();
    service.encode_to(&mut payload);
    method.encode_to(&mut payload);
    args.encode_to(&mut payload);
    payload
}

fn decode_result_ok(reply_bytes: &[u8]) -> bool {
    if reply_bytes.is_empty() { return true; }
    let mut input = &reply_bytes[..];
    if <String as ScaleDecode>::decode(&mut input).is_ok()
        && <String as ScaleDecode>::decode(&mut input).is_ok()
    {
        return input.first().map(|&b| b == 0x00).unwrap_or(false);
    }
    if reply_bytes.len() == 1 { return reply_bytes[0] == 0x00; }
    false
}

fn decode_u128_reply(reply_bytes: &[u8]) -> u128 {
    let mut input = &reply_bytes[..];
    // Strip sails routing prefix (service + method names)
    if <String as ScaleDecode>::decode(&mut input).is_ok()
        && <String as ScaleDecode>::decode(&mut input).is_ok()
    {
        if let Ok(v) = <u128 as ScaleDecode>::decode(&mut input) { return v; }
    }
    0
}

fn decode_i128_reply(reply_bytes: &[u8]) -> i128 {
    let mut input = &reply_bytes[..];
    if <String as ScaleDecode>::decode(&mut input).is_ok()
        && <String as ScaleDecode>::decode(&mut input).is_ok()
    {
        if let Ok(v) = <i128 as ScaleDecode>::decode(&mut input) { return v; }
    }
    0
}

async fn call_checked(target: ActorId, payload: Vec<u8>) -> Vec<u8> {
    match gstd_msg::send_bytes_for_reply(target, payload, 0, 0) {
        Ok(f) => match f.await { Ok(b) => b, Err(_) => Vec::new() },
        Err(_) => Vec::new(),
    }
}

/// Query super_token.BalanceOf(account) → u128
async fn query_balance(super_token: ActorId, account: ActorId) -> u128 {
    let payload = encode_call("SuperTokenService", "BalanceOf", account);
    let reply = call_checked(super_token, payload).await;
    decode_u128_reply(reply.as_slice())
}

/// Query super_token.NetFlowRate(account) → i128
async fn query_flow_rate(super_token: ActorId, account: ActorId) -> i128 {
    let payload = encode_call("SuperTokenService", "NetFlowRate", account);
    let reply = call_checked(super_token, payload).await;
    decode_i128_reply(reply.as_slice())
}

/// Call super_token.SettleAccount(account)
async fn settle_account(super_token: ActorId, account: ActorId) -> bool {
    let payload = encode_call("SuperTokenService", "SettleAccount", account);
    let reply = call_checked(super_token, payload).await;
    !reply.is_empty() // settle_account returns null — any reply = success
}

/// Call stream_core.StopStream(stream_id) — Result<(), str>
async fn stop_stream(stream_core: ActorId, stream_id: u64) -> bool {
    let payload = encode_call("StreamService", "StopStream", stream_id);
    let reply = call_checked(stream_core, payload).await;
    decode_result_ok(reply.as_slice())
}

/// Call super_token.Transfer(to, amount) for liquidation reward
async fn transfer_reward(super_token: ActorId, to: ActorId, amount: u128) -> bool {
    let payload = encode_call("SuperTokenService", "Transfer", (to, amount));
    let reply = call_checked(super_token, payload).await;
    if reply.is_empty() { return false; }
    // Transfer returns bool
    let mut input = &reply[..];
    if <String as ScaleDecode>::decode(&mut input).is_ok()
        && <String as ScaleDecode>::decode(&mut input).is_ok()
    {
        if let Ok(b) = <bool as ScaleDecode>::decode(&mut input) { return b; }
    }
    false
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
pub enum SolvencyStatus {
    /// Account has enough balance to sustain all outgoing flows.
    Solvent,
    /// Account will run dry within `critical_seconds` — top-up urgently needed.
    Critical,
    /// Account balance is zero or negative — stream must be liquidated now.
    Insolvent,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct StreamRisk {
    pub stream_id: u64,
    pub sender: ActorId,
    pub super_token: ActorId,
    /// Real-time balance of the sender at query time.
    pub sender_balance: u128,
    /// Net outgoing flow rate (positive = net outgoing, i.e. -net_flow_rate).
    pub outflow_rate: u128,
    /// Seconds remaining before balance hits zero. u64::MAX = infinite (no outflow).
    pub seconds_remaining: u64,
    /// Ratio: balance / (min_buffer). 100 = at min_buffer, >100 = healthy, <100 = critical.
    pub health_factor: u32,
    pub status: SolvencyStatus,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct LiquidationRecord {
    pub stream_id: u64,
    pub sender: ActorId,
    pub liquidator: ActorId,
    pub super_token: ActorId,
    pub liquidated_at: u64,
    pub reward_paid: u128,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct LiquidationManagerConfig {
    pub admin: ActorId,
    pub stream_core: ActorId,
    /// Seconds of outflow at which an account is considered "critical".
    pub critical_threshold_seconds: u64,
    /// Liquidation reward in base units of the super token paid to the keeper.
    pub liquidation_reward: u128,
    pub total_liquidations: u64,
    pub paused: bool,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

static mut STATE: Option<LiqManagerState> = None;

struct LiqManagerState {
    config: LiquidationManagerConfig,
    /// History of all liquidations, keyed by stream_id
    liquidations: BTreeMap<u64, LiquidationRecord>,
    /// stream_id → true if currently being processed (reentrancy guard)
    processing: BTreeMap<u64, bool>,
}

impl LiqManagerState {
    fn new(admin: ActorId) -> Self {
        Self {
            config: LiquidationManagerConfig {
                admin,
                stream_core: ActorId::zero(),
                critical_threshold_seconds: 3600,  // 1 hour buffer = critical
                liquidation_reward: 0,
                total_liquidations: 0,
                paused: false,
            },
            liquidations: BTreeMap::new(),
            processing: BTreeMap::new(),
        }
    }

    fn get() -> &'static mut Self {
        unsafe { STATE.as_mut().expect("State not initialized") }
    }

    /// Classify solvency given balance, outflow rate and config.
    fn classify(
        balance: u128,
        outflow_rate: u128,
        critical_threshold_seconds: u64,
    ) -> (SolvencyStatus, u64, u32) {
        if outflow_rate == 0 {
            return (SolvencyStatus::Solvent, u64::MAX, 1000);
        }
        if balance == 0 {
            return (SolvencyStatus::Insolvent, 0, 0);
        }
        let seconds_remaining = (balance / outflow_rate).min(u64::MAX as u128) as u64;
        let min_buffer = outflow_rate.saturating_mul(critical_threshold_seconds as u128);
        let health_factor = if min_buffer == 0 {
            1000u32
        } else {
            ((balance as u128 * 100) / min_buffer).min(1000) as u32
        };
        let status = if seconds_remaining == 0 {
            SolvencyStatus::Insolvent
        } else if balance < min_buffer {
            SolvencyStatus::Critical
        } else {
            SolvencyStatus::Solvent
        };
        (status, seconds_remaining, health_factor)
    }
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

pub struct LiquidationManagerProgram;

#[program]
impl LiquidationManagerProgram {
    pub fn new() -> Self {
        let admin = msg::source();
        unsafe { STATE = Some(LiqManagerState::new(admin)); }
        Self
    }

    pub fn liquidation_service(&self) -> LiquidationService {
        LiquidationService
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

pub struct LiquidationService;

impl LiquidationService {
    pub fn new() -> Self { Self }
}

#[service]
impl LiquidationService {

    // -----------------------------------------------------------------------
    // Core: solvency check (async — queries super token cross-contract)
    // -----------------------------------------------------------------------

    /// Check whether `account` is solvent with respect to its outgoing super
    /// token flows. Returns a full `StreamRisk` struct (minus stream_id, which
    /// is set to 0 for this free-form query).
    #[export]
    pub async fn check_solvency(
        &self,
        account: ActorId,
        super_token: ActorId,
    ) -> StreamRisk {
        let s = LiqManagerState::get();
        let now = exec::block_timestamp() / 1000;
        let _ = now;

        let balance = query_balance(super_token, account).await;
        let net_flow_rate = query_flow_rate(super_token, account).await;

        // Outflow is -net_flow_rate when net_flow_rate is negative
        let outflow_rate = if net_flow_rate < 0 {
            (-net_flow_rate) as u128
        } else {
            0u128
        };

        let (status, seconds_remaining, health_factor) = LiqManagerState::classify(
            balance,
            outflow_rate,
            s.config.critical_threshold_seconds,
        );

        StreamRisk {
            stream_id: 0,
            sender: account,
            super_token,
            sender_balance: balance,
            outflow_rate,
            seconds_remaining,
            health_factor,
            status,
        }
    }

    // -----------------------------------------------------------------------
    // Core: liquidate a stream
    // -----------------------------------------------------------------------

    /// Liquidate an insolvent stream. Can be called by anyone (permissionless keeper).
    ///
    /// Flow:
    /// 1. Query sender's real-time balance from the super token.
    /// 2. Assert the account is insolvent (balance = 0 or within critical threshold).
    /// 3. Call `stream-core.StopStream(stream_id)` — this reverses the flow via super token.
    /// 4. Settle the sender's account to materialise the final balance.
    /// 5. Pay liquidation reward to caller from the contract's own super token balance.
    /// 6. Record the liquidation event.
    #[export]
    pub async fn liquidate_stream(
        &mut self,
        stream_id: u64,
        sender: ActorId,
        super_token: ActorId,
    ) -> Result<(), &'static str> {
        {
            let s = LiqManagerState::get();
            if s.config.paused { return Err("Paused"); }
            if s.config.stream_core == ActorId::zero() { return Err("StreamCoreNotSet"); }
            // Reentrancy guard
            if *s.processing.get(&stream_id).unwrap_or(&false) {
                return Err("AlreadyProcessing");
            }
        }

        // Set reentrancy guard
        LiqManagerState::get().processing.insert(stream_id, true);

        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        // Step 1: Query current balance and flow rate
        let balance = query_balance(super_token, sender).await;
        let net_flow_rate = query_flow_rate(super_token, sender).await;
        let outflow_rate = if net_flow_rate < 0 { (-net_flow_rate) as u128 } else { 0u128 };

        let s = LiqManagerState::get();
        let (status, _, _) = LiqManagerState::classify(
            balance,
            outflow_rate,
            s.config.critical_threshold_seconds,
        );

        if status == SolvencyStatus::Solvent {
            s.processing.insert(stream_id, false);
            return Err("StreamIsSolvent");
        }

        let stream_core = s.config.stream_core;
        let reward = s.config.liquidation_reward;

        // Step 2: Stop the stream via stream-core
        let stopped = stop_stream(stream_core, stream_id).await;
        if !stopped {
            LiqManagerState::get().processing.insert(stream_id, false);
            return Err("StopStreamFailed");
        }

        // Step 3: Settle sender account to materialise final static balance
        settle_account(super_token, sender).await;

        // Step 4: Pay liquidation reward to keeper (non-blocking — don't fail if reward transfer fails)
        let reward_paid = if reward > 0 {
            let ok = transfer_reward(super_token, caller, reward).await;
            if ok { reward } else { 0 }
        } else {
            0
        };

        // Step 5: Record liquidation
        let s = LiqManagerState::get();
        s.liquidations.insert(stream_id, LiquidationRecord {
            stream_id,
            sender,
            liquidator: caller,
            super_token,
            liquidated_at: now,
            reward_paid,
        });
        s.config.total_liquidations += 1;
        s.processing.insert(stream_id, false);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Sentinel / top-up
    // -----------------------------------------------------------------------

    /// Top up a stream sender's super token balance on their behalf.
    /// Anyone can call this — useful for automated keepers, sentinel contracts,
    /// or sponsors who want to keep a stream alive.
    ///
    /// Caller must hold the super tokens and have approved this contract.
    /// This contract then calls `super_token.TransferFrom(caller, sender, amount)`.
    #[export]
    pub async fn top_up(
        &mut self,
        sender: ActorId,
        super_token: ActorId,
        amount: u128,
    ) -> Result<(), &'static str> {
        if amount == 0 { return Err("ZeroAmount"); }
        let caller = msg::source();
        let payload = encode_call("SuperTokenService", "TransferFrom", (caller, sender, amount));
        let reply = call_checked(super_token, payload).await;
        // TransferFrom returns bool
        let mut ok = false;
        {
            let mut input = &reply[..];
            if <String as ScaleDecode>::decode(&mut input).is_ok()
                && <String as ScaleDecode>::decode(&mut input).is_ok()
            {
                if let Ok(b) = <bool as ScaleDecode>::decode(&mut input) { ok = b; }
            }
        }
        if !ok { return Err("TransferFailed"); }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    #[export]
    pub fn set_stream_core(&mut self, stream_core: ActorId) -> Result<(), &'static str> {
        let s = LiqManagerState::get();
        if msg::source() != s.config.admin { return Err("Unauthorized"); }
        s.config.stream_core = stream_core;
        Ok(())
    }

    #[export]
    pub fn set_critical_threshold(&mut self, seconds: u64) -> Result<(), &'static str> {
        let s = LiqManagerState::get();
        if msg::source() != s.config.admin { return Err("Unauthorized"); }
        if seconds == 0 { return Err("ZeroThreshold"); }
        s.config.critical_threshold_seconds = seconds;
        Ok(())
    }

    #[export]
    pub fn set_liquidation_reward(&mut self, reward: u128) -> Result<(), &'static str> {
        let s = LiqManagerState::get();
        if msg::source() != s.config.admin { return Err("Unauthorized"); }
        s.config.liquidation_reward = reward;
        Ok(())
    }

    #[export]
    pub fn set_admin(&mut self, new_admin: ActorId) -> Result<(), &'static str> {
        let s = LiqManagerState::get();
        if msg::source() != s.config.admin { return Err("Unauthorized"); }
        s.config.admin = new_admin;
        Ok(())
    }

    #[export]
    pub fn pause(&mut self) -> Result<(), &'static str> {
        let s = LiqManagerState::get();
        if msg::source() != s.config.admin { return Err("Unauthorized"); }
        s.config.paused = true;
        Ok(())
    }

    #[export]
    pub fn unpause(&mut self) -> Result<(), &'static str> {
        let s = LiqManagerState::get();
        if msg::source() != s.config.admin { return Err("Unauthorized"); }
        s.config.paused = false;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    #[export]
    pub fn get_config(&self) -> LiquidationManagerConfig {
        LiqManagerState::get().config.clone()
    }

    #[export]
    pub fn get_liquidation(&self, stream_id: u64) -> Option<LiquidationRecord> {
        LiqManagerState::get().liquidations.get(&stream_id).cloned()
    }

    #[export]
    pub fn total_liquidations(&self) -> u64 {
        LiqManagerState::get().config.total_liquidations
    }

    /// Pure solvency calculation — offline computation, no cross-contract call.
    /// Caller provides the balance and flow rate values (queried separately).
    #[export]
    pub fn compute_risk(
        &self,
        stream_id: u64,
        sender: ActorId,
        super_token: ActorId,
        balance: u128,
        net_flow_rate: i128,
    ) -> StreamRisk {
        let s = LiqManagerState::get();
        let outflow_rate = if net_flow_rate < 0 { (-net_flow_rate) as u128 } else { 0u128 };
        let (status, seconds_remaining, health_factor) =
            LiqManagerState::classify(balance, outflow_rate, s.config.critical_threshold_seconds);
        StreamRisk {
            stream_id,
            sender,
            super_token,
            sender_balance: balance,
            outflow_rate,
            seconds_remaining,
            health_factor,
            status,
        }
    }
}

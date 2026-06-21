#![cfg_attr(not(test), no_std)]

//! Super Token — Superfluid-style streaming VFT for GrowStreams on Vara.
//!
//! A Super Token wraps any existing VFT (or acts as a pure/native token) and
//! adds real-time balance accounting so that `balance_of(account)` reflects
//! ongoing streams without any per-second transactions.
//!
//! ## Conservation model (buffered, flow-aware)
//!
//! Earlier versions tracked only a per-account signed `net_flow_rate`, which
//! let a receiver's balance grow **without bound** — it ignored whether the
//! sender had any funds left. That minted tokens out of nothing
//! (`Σ balance_of > total_supply`).
//!
//! This version is **flow-aware**. Every stream is an explicit
//! `Flow { rate, buffer, last_update }` keyed by `(sender, receiver)`:
//!
//!  * On `start_flow`, the stream's full `buffer` (== stream-core `deposited`)
//!    is **escrowed out of the sender's settled balance** into the flow.
//!  * As time passes, the receiver accrues `min(rate × elapsed, buffer)` — the
//!    buffer is a **hard ceiling**. Once it is drained the flow stops paying.
//!  * On `stop_flow`, any unspent buffer is refunded to the sender.
//!
//! This gives the exact invariant, preserved by every mutation:
//!
//!   total_supply == Σ static_balance(account) + Σ flow.buffer
//!   Σ balance_of(account) ≤ total_supply        (never mints phantom tokens)
//!
//! ## Token modes
//! - Wrapper: underlying_token != zero  → wrap/unwrap pull/push a VFT
//! - Pure:    underlying_token == zero, native == false → admin-mintable
//! - Native:  underlying_token == zero, native == true  → wrap/unwrap VARA
//!
//! ## Authorization
//! The flow methods (`start_flow`, `set_flow_rate`, `add_flow_buffer`,
//! `stop_flow`) may only be called by a registered "flow controller"
//! (i.e., `stream-core`). The admin sets flow controllers via
//! `add_flow_controller`.

use sails_rs::{
    cell::RefCell,
    collections::BTreeMap,
    gstd::{exec, msg},
    prelude::*,
};
use gstd::msg as gstd_msg;
use parity_scale_codec::Decode as ScaleDecode;

// ---------------------------------------------------------------------------
// VFT U256 helper — same pattern as token-vault / wvara
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct VftU256([u8; 32]);

impl VftU256 {
    fn from_u128(val: u128) -> Self {
        let mut buf = [0u8; 32];
        buf[..16].copy_from_slice(&val.to_le_bytes());
        Self(buf)
    }
}

impl Encode for VftU256 {
    fn encode_to<T: parity_scale_codec::Output + ?Sized>(&self, dest: &mut T) {
        dest.write(&self.0);
    }
}

fn encode_call(service: &str, method: &str, args: impl Encode) -> Vec<u8> {
    let mut payload = Vec::new();
    service.encode_to(&mut payload);
    method.encode_to(&mut payload);
    args.encode_to(&mut payload);
    payload
}

fn decode_vft_bool_reply(reply_bytes: &[u8]) -> bool {
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single streaming flow from `sender` to `receiver`.
///
/// `buffer` is the remaining escrowed balance backing this flow. It is debited
/// from the sender's settled balance when the flow is opened (or topped up) and
/// it is the hard ceiling on how much the receiver can ever accrue: the
/// receiver gains `min(rate × elapsed, buffer)`.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct Flow {
    /// Streaming rate in base units per second.
    pub rate: u128,
    /// Remaining escrowed funds backing this flow (the hard accrual ceiling).
    pub buffer: u128,
    /// Block timestamp (seconds) when this flow was last settled.
    pub last_update: u64,
}

/// Back-compat view returned by `get_account_state` so existing API/keeper
/// consumers keep working. `net_flow_rate` is *derived* from active flows.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct AccountState {
    /// Settled (static) balance — escrowed flow buffers are NOT included.
    pub static_balance: u128,
    /// Derived net flow rate in base units per second (incoming − outgoing,
    /// counting only flows that still have buffer remaining).
    pub net_flow_rate: i128,
    /// Block timestamp (seconds) of this view.
    pub flow_updated_at: u64,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct SuperTokenMeta {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub underlying_token: ActorId,
    pub is_native_wrapper: bool,
    pub admin: ActorId,
    pub total_supply: u128,
    pub flow_controller_count: u32,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
// Variant order AND per-field order must mirror super-token.idl exactly — the
// off-chain indexer decodes by SCALE variant index and positional fields.
// There is no `token` field: the super-token IS the token (gVARA), so the
// indexer resolves the token contextually from the emitting program id.

#[event]
#[derive(Encode, TypeInfo)]
pub enum SuperTokenEvent {
    FeeCollected {
        payer: ActorId,
        amount: u128,
        treasury: ActorId,
    },
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct SuperTokenState {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    /// For Wrapper mode: the VFT contract being wrapped.
    /// ActorId::zero() for Pure / Native modes.
    pub underlying_token: ActorId,
    /// True when this contract accepts native VARA (wrap/unwrap VARA <-> gVARA).
    pub is_native_wrapper: bool,
    pub admin: ActorId,
    pub paused: bool,
    /// Total wrapped/minted supply. Equals `Σ balances + Σ flow.buffer`.
    pub total_supply: u128,
    /// Per-account settled balance (escrowed buffers held separately in `flows`).
    pub balances: BTreeMap<ActorId, u128>,
    /// Active streaming flows keyed by (sender, receiver).
    pub flows: BTreeMap<(ActorId, ActorId), Flow>,
    /// Standard ERC-20-style allowances for instant transfers.
    pub allowances: BTreeMap<(ActorId, ActorId), u128>,
    /// Authorised flow controllers (e.g. stream-core program IDs).
    pub flow_controllers: BTreeMap<ActorId, bool>,
}

impl SuperTokenState {
    fn new(
        admin: ActorId,
        name: String,
        symbol: String,
        decimals: u8,
        underlying_token: ActorId,
        is_native_wrapper: bool,
    ) -> Self {
        Self {
            name,
            symbol,
            decimals,
            underlying_token,
            is_native_wrapper,
            admin,
            paused: false,
            total_supply: 0,
            balances: BTreeMap::new(),
            flows: BTreeMap::new(),
            allowances: BTreeMap::new(),
            flow_controllers: BTreeMap::new(),
        }
    }

    fn balance(&self, id: &ActorId) -> u128 {
        self.balances.get(id).copied().unwrap_or(0)
    }

    fn credit(&mut self, id: ActorId, amount: u128) {
        if amount == 0 { return; }
        let e = self.balances.entry(id).or_insert(0);
        *e = e.saturating_add(amount);
    }

    /// Returns false if `id` has insufficient settled balance.
    fn debit(&mut self, id: ActorId, amount: u128) -> bool {
        if amount == 0 { return true; }
        let bal = self.balance(&id);
        if bal < amount { return false; }
        self.balances.insert(id, bal - amount);
        true
    }

    /// Pending (unsettled) accrual of a single flow at `now`, capped at buffer.
    fn flow_pending(flow: &Flow, now: u64) -> u128 {
        if flow.rate == 0 || flow.buffer == 0 || now <= flow.last_update {
            return 0;
        }
        let elapsed = (now - flow.last_update) as u128;
        flow.rate.saturating_mul(elapsed).min(flow.buffer)
    }

    /// Settle every flow that pays into `account`, moving accrued amounts from
    /// each flow's buffer into the receiver's settled balance.
    fn settle_incoming(&mut self, account: ActorId, now: u64) {
        let keys: Vec<(ActorId, ActorId)> = self
            .flows
            .iter()
            .filter(|((_, r), _)| *r == account)
            .map(|(k, _)| *k)
            .collect();
        for k in keys {
            let pending = {
                let flow = self.flows.get(&k).expect("flow exists");
                Self::flow_pending(flow, now)
            };
            if pending > 0 {
                let flow = self.flows.get_mut(&k).expect("flow exists");
                flow.buffer -= pending;
                flow.last_update = now;
            } else if let Some(flow) = self.flows.get_mut(&k) {
                flow.last_update = now;
            }
            self.credit(account, pending);
        }
    }

    /// Settle a single flow in place (drain accrued buffer to the receiver).
    fn settle_flow(&mut self, key: (ActorId, ActorId), now: u64) {
        let pending = match self.flows.get(&key) {
            Some(flow) => Self::flow_pending(flow, now),
            None => return,
        };
        if let Some(flow) = self.flows.get_mut(&key) {
            flow.buffer -= pending;
            flow.last_update = now;
        }
        let receiver = key.1;
        self.credit(receiver, pending);
    }

    /// Real-time balance: settled balance plus everything still owed by
    /// incoming flows (each capped at its remaining buffer).
    fn realtime_balance(&self, id: &ActorId, now: u64) -> u128 {
        let mut bal = self.balance(id);
        for ((_, r), flow) in self.flows.iter() {
            if r == id {
                bal = bal.saturating_add(Self::flow_pending(flow, now));
            }
        }
        bal
    }

    /// Derived net flow rate (incoming − outgoing) counting only flows that
    /// still have buffer left to pay out.
    fn net_flow_rate(&self, id: &ActorId) -> i128 {
        let mut net: i128 = 0;
        for ((s, r), flow) in self.flows.iter() {
            if flow.rate == 0 || flow.buffer == 0 { continue; }
            if r == id { net = net.saturating_add(flow.rate as i128); }
            if s == id { net = net.saturating_sub(flow.rate as i128); }
        }
        net
    }

    fn is_flow_controller(&self, caller: &ActorId) -> bool {
        *self.flow_controllers.get(caller).unwrap_or(&false)
    }
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

pub struct SuperTokenProgram {
    state: RefCell<SuperTokenState>,
}

#[program]
impl SuperTokenProgram {
    /// Constructor.
    ///
    /// Arguments:
    /// - `name`, `symbol`, `decimals` — token metadata.
    /// - `underlying_token` — VFT to wrap. Pass `ActorId::zero()` for Pure/Native.
    /// - `is_native_wrapper` — set true to enable VARA wrap/unwrap.
    pub fn new(
        name: String,
        symbol: String,
        decimals: u8,
        underlying_token: ActorId,
        is_native_wrapper: bool,
    ) -> Self {
        let admin = msg::source();
        Self {
            state: RefCell::new(SuperTokenState::new(
                admin,
                name,
                symbol,
                decimals,
                underlying_token,
                is_native_wrapper,
            )),
        }
    }

    pub fn super_token_service(&self) -> SuperTokenService<'_> {
        SuperTokenService::new(&self.state)
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

pub struct SuperTokenService<'a> {
    state: &'a RefCell<SuperTokenState>,
}

impl<'a> SuperTokenService<'a> {
    pub fn new(state: &'a RefCell<SuperTokenState>) -> Self {
        Self { state }
    }
}

#[service(events = SuperTokenEvent)]
impl<'a> SuperTokenService<'a> {
    // -----------------------------------------------------------------------
    // Wrap / Unwrap
    // -----------------------------------------------------------------------

    /// Wrapper mode: pull `amount` of the underlying VFT from caller into this
    /// contract and credit the caller's settled balance.
    #[export]
    pub async fn wrap(&mut self, amount: u128) -> Result<(), &'static str> {
        {
            let state = self.state.borrow();
            if state.paused { return Err("Paused"); }
            if state.underlying_token == ActorId::zero() || state.is_native_wrapper {
                return Err("Not a wrapper token; use wrap_native or mint");
            }
        }
        if amount == 0 { return Err("ZeroAmount"); }

        let caller = msg::source();
        let (underlying, vault_id) = {
            let state = self.state.borrow();
            (state.underlying_token, exec::program_id())
        };

        let amount_u256 = VftU256::from_u128(amount);
        let payload = encode_call("Vft", "TransferFrom", (caller, vault_id, amount_u256));
        let reply = gstd_msg::send_bytes_for_reply(underlying, payload, 0, 0)
            .map_err(|_| "VftCallFailed")?
            .await
            .map_err(|_| "VftCallFailed")?;
        if !decode_vft_bool_reply(reply.as_slice()) {
            return Err("VftTransferFailed");
        }

        let mut state = self.state.borrow_mut();
        state.credit(caller, amount);
        state.total_supply = state.total_supply.saturating_add(amount);
        Ok(())
    }

    /// Wrapper mode: burn `amount` of super tokens from caller and send back
    /// the underlying VFT. Incoming flows are settled first so the caller can
    /// unwrap funds that streamed in.
    #[export]
    pub async fn unwrap(&mut self, amount: u128) -> Result<(), &'static str> {
        {
            let state = self.state.borrow();
            if state.paused { return Err("Paused"); }
            if state.underlying_token == ActorId::zero() || state.is_native_wrapper {
                return Err("Not a wrapper token; use unwrap_native or burn");
            }
        }
        if amount == 0 { return Err("ZeroAmount"); }

        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        {
            let mut state = self.state.borrow_mut();
            state.settle_incoming(caller, now);
            if !state.debit(caller, amount) { return Err("InsufficientBalance"); }
            state.total_supply = state.total_supply.saturating_sub(amount);
        }

        let underlying = self.state.borrow().underlying_token;
        let amount_u256 = VftU256::from_u128(amount);
        let payload = encode_call("Vft", "Transfer", (caller, amount_u256));
        let reply = gstd_msg::send_bytes_for_reply(underlying, payload, 0, 0)
            .map_err(|_| "VftCallFailed")?
            .await
            .map_err(|_| "VftCallFailed")?;

        if !decode_vft_bool_reply(reply.as_slice()) {
            // Revert the balance deduction on VFT failure
            let mut state = self.state.borrow_mut();
            state.credit(caller, amount);
            state.total_supply = state.total_supply.saturating_add(amount);
            return Err("VftTransferFailed");
        }
        Ok(())
    }

    /// Native wrapper mode: attach VARA value to wrap into gVARA.
    #[export]
    pub fn wrap_native(&mut self) -> Result<(), &'static str> {
        let state_ref = self.state.borrow();
        if state_ref.paused { return Err("Paused"); }
        if !state_ref.is_native_wrapper { return Err("NotNativeWrapper"); }
        drop(state_ref);

        let value = msg::value();
        if value == 0 { return Err("ZeroAmount"); }

        let caller = msg::source();
        let mut state = self.state.borrow_mut();
        state.credit(caller, value);
        state.total_supply = state.total_supply.saturating_add(value);
        Ok(())
    }

    /// Native wrapper mode: burn gVARA and send back native VARA.
    #[export]
    pub fn unwrap_native(&mut self, amount: u128) -> Result<(), &'static str> {
        {
            let state = self.state.borrow();
            if state.paused { return Err("Paused"); }
            if !state.is_native_wrapper { return Err("NotNativeWrapper"); }
        }
        if amount == 0 { return Err("ZeroAmount"); }

        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;
        {
            let mut state = self.state.borrow_mut();
            state.settle_incoming(caller, now);
            if !state.debit(caller, amount) { return Err("InsufficientBalance"); }
            state.total_supply = state.total_supply.saturating_sub(amount);
        }
        msg::send(caller, b"", amount).map_err(|_| "NativeTransferFailed")?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // VFT-compatible instant transfers
    // -----------------------------------------------------------------------

    /// Instant transfer — settles the sender's incoming flows, then moves
    /// `amount` from sender's settled balance to receiver's settled balance.
    #[export]
    pub fn transfer(&mut self, to: ActorId, amount: u128) -> bool {
        if amount == 0 { return false; }
        let caller = msg::source();
        if caller == to { return false; }

        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();

        state.settle_incoming(caller, now);
        if !state.debit(caller, amount) { return false; }
        state.credit(to, amount);
        true
    }

    #[export]
    pub fn approve(&mut self, spender: ActorId, amount: u128) -> bool {
        let owner = msg::source();
        let mut state = self.state.borrow_mut();
        state.allowances.insert((owner, spender), amount);
        true
    }

    #[export]
    pub fn transfer_from(&mut self, from: ActorId, to: ActorId, amount: u128) -> bool {
        if amount == 0 { return false; }
        let spender = msg::source();
        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();

        let allowance = state.allowances.get(&(from, spender)).copied().unwrap_or(0);
        if allowance < amount { return false; }

        state.settle_incoming(from, now);
        if !state.debit(from, amount) { return false; }
        state.allowances.insert((from, spender), allowance - amount);
        state.credit(to, amount);
        true
    }

    // -----------------------------------------------------------------------
    // Flow control (called by stream-core)
    // -----------------------------------------------------------------------

    /// Open (or add rate + buffer to) a flow from `sender` to `receiver`.
    ///
    /// `buffer` (== stream-core `deposited`) is escrowed out of the sender's
    /// settled balance. It is the hard ceiling on receiver accrual. `rate` is
    /// added to any existing flow's rate.
    ///
    /// Authorisation: caller must be a registered flow controller.
    #[export]
    pub fn start_flow(
        &mut self,
        sender: ActorId,
        receiver: ActorId,
        rate: u128,
        buffer: u128,
    ) -> Result<(), &'static str> {
        let caller = msg::source();
        {
            let state = self.state.borrow();
            if !state.is_flow_controller(&caller) { return Err("Unauthorized"); }
            if state.paused { return Err("Paused"); }
        }
        if sender == receiver { return Err("SenderIsReceiver"); }
        if rate == 0 { return Err("ZeroRate"); }

        let now = exec::block_timestamp() / 1000;
        let key = (sender, receiver);
        let mut state = self.state.borrow_mut();

        // Settle any existing flow before changing its parameters.
        state.settle_flow(key, now);

        // Escrow the buffer out of the sender's settled balance.
        if !state.debit(sender, buffer) { return Err("InsufficientBuffer"); }

        let flow = state.flows.entry(key).or_insert(Flow {
            rate: 0,
            buffer: 0,
            last_update: now,
        });
        flow.rate = flow.rate.saturating_add(rate);
        flow.buffer = flow.buffer.saturating_add(buffer);
        flow.last_update = now;
        Ok(())
    }

    /// Top up the buffer backing an existing flow (stream deposit). Escrows
    /// `amount` from the sender's settled balance into the flow.
    #[export]
    pub fn add_flow_buffer(
        &mut self,
        sender: ActorId,
        receiver: ActorId,
        amount: u128,
    ) -> Result<(), &'static str> {
        let caller = msg::source();
        {
            let state = self.state.borrow();
            if !state.is_flow_controller(&caller) { return Err("Unauthorized"); }
            if state.paused { return Err("Paused"); }
        }
        if amount == 0 { return Err("ZeroAmount"); }

        let now = exec::block_timestamp() / 1000;
        let key = (sender, receiver);
        let mut state = self.state.borrow_mut();

        if !state.flows.contains_key(&key) { return Err("FlowNotFound"); }
        state.settle_flow(key, now);
        if !state.debit(sender, amount) { return Err("InsufficientBuffer"); }
        let flow = state.flows.get_mut(&key).expect("flow exists");
        flow.buffer = flow.buffer.saturating_add(amount);
        Ok(())
    }

    /// Change the rate of an existing flow without touching its buffer.
    /// Used by stream-core `update_stream`.
    #[export]
    pub fn set_flow_rate(
        &mut self,
        sender: ActorId,
        receiver: ActorId,
        new_rate: u128,
    ) -> Result<(), &'static str> {
        let caller = msg::source();
        {
            let state = self.state.borrow();
            if !state.is_flow_controller(&caller) { return Err("Unauthorized"); }
            if state.paused { return Err("Paused"); }
        }

        let now = exec::block_timestamp() / 1000;
        let key = (sender, receiver);
        let mut state = self.state.borrow_mut();

        if !state.flows.contains_key(&key) { return Err("FlowNotFound"); }
        state.settle_flow(key, now);
        let flow = state.flows.get_mut(&key).expect("flow exists");
        flow.rate = new_rate;
        Ok(())
    }

    /// Stop a flow: settle accrued amount to the receiver, refund any unspent
    /// buffer to the sender, and remove the flow.
    #[export]
    pub fn stop_flow(
        &mut self,
        sender: ActorId,
        receiver: ActorId,
    ) -> Result<(), &'static str> {
        let caller = msg::source();
        {
            let state = self.state.borrow();
            if !state.is_flow_controller(&caller) { return Err("Unauthorized"); }
            // NOTE: stopping is allowed even while paused so funds aren't trapped.
        }

        let now = exec::block_timestamp() / 1000;
        let key = (sender, receiver);
        let mut state = self.state.borrow_mut();

        if !state.flows.contains_key(&key) { return Err("FlowNotFound"); }
        // Settle accrued to receiver, then refund the remainder to the sender.
        state.settle_flow(key, now);
        let remaining = state.flows.remove(&key).map(|f| f.buffer).unwrap_or(0);
        state.credit(sender, remaining);
        Ok(())
    }

    /// Materialise an account's accrued incoming flows into its settled balance.
    /// Callable by anyone (keeper / owner). Safe to call repeatedly.
    #[export]
    pub fn settle_account(&mut self, account: ActorId) {
        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();
        state.settle_incoming(account, now);
    }

    /// Move a protocol fee from `from`'s settled balance to `treasury`'s settled
    /// balance, as an internal ledger transfer (no mint/burn, so the
    /// conservation invariant `Σ balances + Σ buffers == total_supply` holds).
    ///
    /// Mirrors `token-vault::collect_fee`: stream-core skims the fee entry-side
    /// and calls this so gVARA streams become fee-bearing. Incoming flows are
    /// settled first so a payer can pay the fee out of gVARA that streamed in.
    ///
    /// Authorisation: caller must be a registered flow controller (stream-core).
    #[export]
    pub fn collect_fee(
        &mut self,
        from: ActorId,
        amount: u128,
        treasury: ActorId,
    ) -> Result<(), &'static str> {
        if amount == 0 { return Ok(()); }
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;
        {
            let mut state = self.state.borrow_mut();
            if !state.is_flow_controller(&caller) { return Err("Unauthorized"); }
            state.settle_incoming(from, now);
            if !state.debit(from, amount) { return Err("InsufficientFee"); }
            state.credit(treasury, amount);
        }
        self.emit_event(SuperTokenEvent::FeeCollected { payer: from, amount, treasury })
            .map_err(|_| "EventFailed")?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Admin: Pure token mint / burn
    // -----------------------------------------------------------------------

    /// Pure token mode: admin mints tokens directly (no underlying VFT).
    #[export]
    pub fn mint(&mut self, to: ActorId, amount: u128) -> Result<(), &'static str> {
        {
            let state = self.state.borrow();
            if msg::source() != state.admin { return Err("Unauthorized"); }
            if state.paused { return Err("Paused"); }
        }
        if amount == 0 { return Err("ZeroAmount"); }

        let mut state = self.state.borrow_mut();
        state.credit(to, amount);
        state.total_supply = state.total_supply.saturating_add(amount);
        Ok(())
    }

    /// Burn caller's own tokens (settles incoming flows first).
    #[export]
    pub fn burn(&mut self, amount: u128) -> Result<(), &'static str> {
        if amount == 0 { return Err("ZeroAmount"); }
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();
        state.settle_incoming(caller, now);
        if !state.debit(caller, amount) { return Err("InsufficientBalance"); }
        state.total_supply = state.total_supply.saturating_sub(amount);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Admin: Access control
    // -----------------------------------------------------------------------

    #[export]
    pub fn add_flow_controller(&mut self, controller: ActorId) -> Result<(), &'static str> {
        let mut state = self.state.borrow_mut();
        if msg::source() != state.admin { return Err("Unauthorized"); }
        state.flow_controllers.insert(controller, true);
        Ok(())
    }

    #[export]
    pub fn remove_flow_controller(&mut self, controller: ActorId) -> Result<(), &'static str> {
        let mut state = self.state.borrow_mut();
        if msg::source() != state.admin { return Err("Unauthorized"); }
        state.flow_controllers.insert(controller, false);
        Ok(())
    }

    #[export]
    pub fn set_admin(&mut self, new_admin: ActorId) -> Result<(), &'static str> {
        let mut state = self.state.borrow_mut();
        if msg::source() != state.admin { return Err("Unauthorized"); }
        state.admin = new_admin;
        Ok(())
    }

    #[export]
    pub fn pause(&mut self) -> Result<(), &'static str> {
        let mut state = self.state.borrow_mut();
        if msg::source() != state.admin { return Err("Unauthorized"); }
        state.paused = true;
        Ok(())
    }

    #[export]
    pub fn unpause(&mut self) -> Result<(), &'static str> {
        let mut state = self.state.borrow_mut();
        if msg::source() != state.admin { return Err("Unauthorized"); }
        state.paused = false;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Real-time balance — settled balance plus capped accrual from all
    /// incoming flows at the current timestamp. Never exceeds what senders
    /// have actually escrowed.
    #[export]
    pub fn balance_of(&self, account: ActorId) -> u128 {
        let state = self.state.borrow();
        let now = exec::block_timestamp() / 1000;
        state.realtime_balance(&account, now)
    }

    /// Static (settled) balance only — does NOT include unsettled flow accrual.
    #[export]
    pub fn static_balance_of(&self, account: ActorId) -> u128 {
        let state = self.state.borrow();
        state.balance(&account)
    }

    /// Derived net flow rate for an account (base units per second, signed).
    #[export]
    pub fn net_flow_rate(&self, account: ActorId) -> i128 {
        let state = self.state.borrow();
        state.net_flow_rate(&account)
    }

    /// Full account state (settled balance + derived flow rate + timestamp).
    #[export]
    pub fn get_account_state(&self, account: ActorId) -> AccountState {
        let state = self.state.borrow();
        let now = exec::block_timestamp() / 1000;
        AccountState {
            static_balance: state.balance(&account),
            net_flow_rate: state.net_flow_rate(&account),
            flow_updated_at: now,
        }
    }

    /// Inspect a single flow's current parameters (rate + remaining buffer).
    #[export]
    pub fn get_flow(&self, sender: ActorId, receiver: ActorId) -> Option<Flow> {
        let state = self.state.borrow();
        state.flows.get(&(sender, receiver)).cloned()
    }

    #[export]
    pub fn allowance(&self, owner: ActorId, spender: ActorId) -> u128 {
        let state = self.state.borrow();
        state.allowances.get(&(owner, spender)).copied().unwrap_or(0)
    }

    #[export]
    pub fn total_supply(&self) -> u128 {
        let state = self.state.borrow();
        state.total_supply
    }

    #[export]
    pub fn name(&self) -> String {
        self.state.borrow().name.clone()
    }

    #[export]
    pub fn symbol(&self) -> String {
        self.state.borrow().symbol.clone()
    }

    #[export]
    pub fn decimals(&self) -> u8 {
        self.state.borrow().decimals
    }

    #[export]
    pub fn underlying_token(&self) -> ActorId {
        self.state.borrow().underlying_token
    }

    #[export]
    pub fn is_native_wrapper(&self) -> bool {
        self.state.borrow().is_native_wrapper
    }

    #[export]
    pub fn is_paused(&self) -> bool {
        self.state.borrow().paused
    }

    #[export]
    pub fn is_flow_controller(&self, account: ActorId) -> bool {
        let state = self.state.borrow();
        state.is_flow_controller(&account)
    }

    #[export]
    pub fn get_meta(&self) -> SuperTokenMeta {
        let state = self.state.borrow();
        let controller_count = state.flow_controllers.values().filter(|&&v| v).count() as u32;
        SuperTokenMeta {
            name: state.name.clone(),
            symbol: state.symbol.clone(),
            decimals: state.decimals,
            underlying_token: state.underlying_token,
            is_native_wrapper: state.is_native_wrapper,
            admin: state.admin,
            total_supply: state.total_supply,
            flow_controller_count: controller_count,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — pure accounting invariants (host-runnable, no gstd runtime)
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    fn actor(n: u8) -> ActorId {
        let mut b = [0u8; 32];
        b[0] = n;
        ActorId::from(b)
    }

    /// Conservation invariant: settled balances plus all escrowed flow buffers
    /// must always equal total_supply. If this holds, Σ balance_of ≤ supply and
    /// no phantom tokens can be minted.
    fn assert_conserved(s: &SuperTokenState) {
        let bal_sum: u128 = s.balances.values().copied().sum();
        let buf_sum: u128 = s.flows.values().map(|f| f.buffer).sum();
        assert_eq!(
            bal_sum + buf_sum,
            s.total_supply,
            "conservation violated: balances({bal_sum}) + buffers({buf_sum}) != supply({})",
            s.total_supply
        );
    }

    fn fresh(supply_to: ActorId, amount: u128) -> SuperTokenState {
        let mut s = SuperTokenState::new(
            actor(255), "g".into(), "g".into(), 12, ActorId::zero(), true,
        );
        s.credit(supply_to, amount);
        s.total_supply = amount;
        s
    }

    /// Simulate start_flow's state mutation (escrow buffer, open/extend flow).
    fn open_flow(s: &mut SuperTokenState, sender: ActorId, receiver: ActorId, rate: u128, buffer: u128, now: u64) -> bool {
        let key = (sender, receiver);
        s.settle_flow(key, now);
        if !s.debit(sender, buffer) { return false; }
        let f = s.flows.entry(key).or_insert(Flow { rate: 0, buffer: 0, last_update: now });
        f.rate = f.rate.saturating_add(rate);
        f.buffer = f.buffer.saturating_add(buffer);
        f.last_update = now;
        true
    }

    /// Simulate stop_flow (settle accrued, refund remainder to sender).
    fn close_flow(s: &mut SuperTokenState, sender: ActorId, receiver: ActorId, now: u64) {
        let key = (sender, receiver);
        s.settle_flow(key, now);
        let remaining = s.flows.remove(&key).map(|f| f.buffer).unwrap_or(0);
        s.credit(sender, remaining);
    }

    #[test]
    fn receiver_accrual_is_capped_at_buffer() {
        // 50 gVARA buffer, rate 1/sec. After 1_000_000 seconds the receiver must
        // NOT exceed the 50-unit buffer — this is the exact bug from the report
        // (deposit 50, balance ran to 736+ and rising).
        let sender = actor(1);
        let receiver = actor(2);
        let mut s = fresh(sender, 50);

        assert!(open_flow(&mut s, sender, receiver, 1, 50, 0));
        assert_conserved(&s);

        // Far in the future: receiver capped at 50, never more.
        let bal = s.realtime_balance(&receiver, 1_000_000);
        assert_eq!(bal, 50, "receiver accrual must be capped at the 50-unit buffer");

        // Sender's real balance never goes negative and totals are conserved.
        assert_eq!(s.realtime_balance(&sender, 1_000_000), 0);
    }

    #[test]
    fn conservation_holds_through_full_lifecycle() {
        let sender = actor(1);
        let receiver = actor(2);
        let mut s = fresh(sender, 100);

        // Open a flow escrowing 60 of the 100.
        assert!(open_flow(&mut s, sender, receiver, 2, 60, 0));
        assert_conserved(&s);
        assert_eq!(s.balance(&sender), 40); // 100 - 60 escrowed

        // Settle the receiver at t=10s → 20 units streamed (2/sec × 10).
        s.settle_incoming(receiver, 10);
        assert_conserved(&s);
        assert_eq!(s.balance(&receiver), 20);

        // Stop at t=15s → another 10 streamed (total 30), refund 30 to sender.
        close_flow(&mut s, sender, receiver, 15);
        assert_conserved(&s);
        assert_eq!(s.balance(&receiver), 30);
        assert_eq!(s.balance(&sender), 70); // 40 + 30 refunded
        assert!(s.flows.is_empty());
    }

    #[test]
    fn buffer_exhaustion_auto_stops_accrual() {
        let sender = actor(1);
        let receiver = actor(2);
        let mut s = fresh(sender, 10);

        // rate 5/sec, buffer 10 → fully drained after 2 seconds.
        assert!(open_flow(&mut s, sender, receiver, 5, 10, 0));

        assert_eq!(s.realtime_balance(&receiver, 1), 5);
        assert_eq!(s.realtime_balance(&receiver, 2), 10);
        // After exhaustion, no further accrual.
        assert_eq!(s.realtime_balance(&receiver, 100), 10);
        assert_eq!(s.realtime_balance(&receiver, 1_000_000), 10);
        assert_conserved(&s);
    }

    #[test]
    fn deposit_top_up_extends_buffer() {
        let sender = actor(1);
        let receiver = actor(2);
        let mut s = fresh(sender, 100);

        // rate 1/sec, buffer 10.
        assert!(open_flow(&mut s, sender, receiver, 1, 10, 0));
        // Without top-up the receiver would cap at 10.
        // Top up with 40 more at t=5 (simulates add_flow_buffer): settle first.
        {
            let key = (sender, receiver);
            s.settle_flow(key, 5);
            assert!(s.debit(sender, 40));
            s.flows.get_mut(&key).unwrap().buffer += 40;
        }
        assert_conserved(&s);

        // 5 already streamed; remaining buffer is 5 + 40 = 45. Total cap is now 50.
        assert_eq!(s.realtime_balance(&receiver, 1_000_000), 50);
        assert_conserved(&s);
    }

    #[test]
    fn insufficient_balance_rejects_flow() {
        let sender = actor(1);
        let receiver = actor(2);
        let mut s = fresh(sender, 30);
        // Asking to escrow 50 with only 30 must fail and leave state untouched.
        assert!(!open_flow(&mut s, sender, receiver, 1, 50, 0));
        assert_conserved(&s);
        assert_eq!(s.balance(&sender), 30);
        assert!(s.flows.is_empty());
    }

    /// collect_fee moves the fee from payer to treasury as a pure internal
    /// transfer — total_supply is unchanged and conservation still holds.
    #[test]
    fn collect_fee_moves_fee_and_conserves() {
        let payer = actor(1);
        let treasury = actor(9);
        let mut s = fresh(payer, 1000);

        // Simulate collect_fee's state mutation: debit payer, credit treasury.
        let fee = 25u128; // 2.5% of 1000
        assert!(s.debit(payer, fee));
        s.credit(treasury, fee);

        assert_eq!(s.balance(&payer), 975);
        assert_eq!(s.balance(&treasury), 25);
        assert_eq!(s.total_supply, 1000, "fee transfer must not change supply");
        assert_conserved(&s);
    }
}

#![no_std]

//! Super Token — Superfluid-style streaming VFT for GrowStreams on Vara.
//!
//! A Super Token wraps any existing VFT (or acts as a pure/native token) and
//! adds real-time balance accounting so that `balance_of(account)` reflects
//! ongoing streams without any per-second transactions.
//!
//! Real-time balance formula (per account):
//!   balance(t) = static_balance
//!              + net_flow_rate_signed × (t - flow_updated_at)
//!
//! Where `net_flow_rate_signed` is the sum of all incoming flow rates
//! minus all outgoing flow rates (in base units per second), stored as i128.
//!
//! ## Token modes
//! - Wrapper: underlying_token != zero  → wrap/unwrap pull/push a VFT
//! - Pure:    underlying_token == zero, native == false → admin-mintable
//! - Native:  underlying_token == zero, native == true  → wrap/unwrap VARA
//!
//! ## Authorization
//! `update_flow` may only be called by a registered "flow controller"
//! (i.e., `stream-core`). The admin sets flow controllers via `add_flow_controller`.

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

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct AccountState {
    /// Settled (static) balance — updated on every settle() call.
    pub static_balance: u128,
    /// Net flow rate in base units per second.
    /// Positive = more incoming than outgoing (balance grows).
    /// Negative = more outgoing than incoming (balance shrinks).
    pub net_flow_rate: i128,
    /// Block timestamp (seconds) when `static_balance` was last settled.
    pub flow_updated_at: u64,
}

impl AccountState {
    fn new() -> Self {
        Self { static_balance: 0, net_flow_rate: 0, flow_updated_at: 0 }
    }

    /// Real-time balance at timestamp `now` (clamped to 0, never negative).
    fn realtime_balance(&self, now: u64) -> u128 {
        let elapsed = now.saturating_sub(self.flow_updated_at) as i128;
        let accrued = self.net_flow_rate.saturating_mul(elapsed);
        let raw = self.static_balance as i128 + accrued;
        if raw < 0 { 0 } else { raw as u128 }
    }

    /// Settle accrued flow into static_balance.
    fn settle(&mut self, now: u64) {
        let accrued = {
            let elapsed = now.saturating_sub(self.flow_updated_at) as i128;
            self.net_flow_rate.saturating_mul(elapsed)
        };
        let new_bal = self.static_balance as i128 + accrued;
        self.static_balance = if new_bal < 0 { 0 } else { new_bal as u128 };
        self.flow_updated_at = now;
    }
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
    /// Total wrapped/minted supply (settled view).
    pub total_supply: u128,
    /// Per-account streaming + static balance state.
    pub accounts: BTreeMap<ActorId, AccountState>,
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
            accounts: BTreeMap::new(),
            allowances: BTreeMap::new(),
            flow_controllers: BTreeMap::new(),
        }
    }

    fn account(&mut self, id: ActorId) -> &mut AccountState {
        self.accounts.entry(id).or_insert_with(AccountState::new)
    }

    fn account_ref(&self, id: &ActorId) -> Option<&AccountState> {
        self.accounts.get(id)
    }

    fn realtime_balance(&self, id: &ActorId, now: u64) -> u128 {
        self.account_ref(id)
            .map(|a| a.realtime_balance(now))
            .unwrap_or(0)
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

#[service]
impl<'a> SuperTokenService<'a> {
    // -----------------------------------------------------------------------
    // Wrap / Unwrap
    // -----------------------------------------------------------------------

    /// Wrapper mode: pull `amount` of the underlying VFT from caller into this
    /// contract and credit the caller's static_balance.
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

        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();
        let acct = state.account(caller);
        acct.settle(now);
        acct.static_balance = acct.static_balance.saturating_add(amount);
        state.total_supply = state.total_supply.saturating_add(amount);
        Ok(())
    }

    /// Wrapper mode: burn `amount` of super tokens from caller and send back
    /// the underlying VFT.
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
            let acct = state.account(caller);
            acct.settle(now);
            if acct.static_balance < amount { return Err("InsufficientBalance"); }
            acct.static_balance -= amount;
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
            let acct = state.account(caller);
            acct.static_balance = acct.static_balance.saturating_add(amount);
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
        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();
        let acct = state.account(caller);
        acct.settle(now);
        acct.static_balance = acct.static_balance.saturating_add(value);
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
            let acct = state.account(caller);
            acct.settle(now);
            if acct.static_balance < amount { return Err("InsufficientBalance"); }
            acct.static_balance -= amount;
            state.total_supply = state.total_supply.saturating_sub(amount);
        }
        msg::send(caller, b"", amount).map_err(|_| "NativeTransferFailed")?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // VFT-compatible instant transfers
    // -----------------------------------------------------------------------

    /// Instant transfer — debits sender's real-time balance, credits receiver's
    /// static_balance. Both accounts are settled first.
    #[export]
    pub fn transfer(&mut self, to: ActorId, amount: u128) -> bool {
        if amount == 0 { return false; }
        let caller = msg::source();
        if caller == to { return false; }

        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();

        let sender_acct = state.account(caller);
        sender_acct.settle(now);
        if sender_acct.static_balance < amount { return false; }
        sender_acct.static_balance -= amount;

        let recv_acct = state.account(to);
        recv_acct.settle(now);
        recv_acct.static_balance = recv_acct.static_balance.saturating_add(amount);
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

        let from_acct = state.account(from);
        from_acct.settle(now);
        if from_acct.static_balance < amount { return false; }
        from_acct.static_balance -= amount;
        state.allowances.insert((from, spender), allowance - amount);

        let to_acct = state.account(to);
        to_acct.settle(now);
        to_acct.static_balance = to_acct.static_balance.saturating_add(amount);
        true
    }

    // -----------------------------------------------------------------------
    // Flow control (called by stream-core)
    // -----------------------------------------------------------------------

    /// Update the net flow rate of an account by a signed delta.
    ///
    /// Called by an authorised flow controller (stream-core) when a stream is
    /// created, updated, or stopped. Settles both accounts first so accrued
    /// amounts are materialised before the rate changes.
    ///
    /// - `sender`     — the account whose rate decreases (outgoing flow).
    /// - `receiver`   — the account whose rate increases (incoming flow).
    /// - `delta`      — flow rate change in base units per second (unsigned).
    /// - `is_increase`— if true, sender rate decreases and receiver increases;
    ///                  if false (stream stopped/decreased), roles are reversed.
    #[export]
    pub fn update_flow(
        &mut self,
        sender: ActorId,
        receiver: ActorId,
        delta: u128,
        is_increase: bool,
    ) -> Result<(), &'static str> {
        let caller = msg::source();
        {
            let state = self.state.borrow();
            if !state.is_flow_controller(&caller) { return Err("Unauthorized"); }
            if state.paused { return Err("Paused"); }
        }
        if delta == 0 { return Ok(()); }

        let now = exec::block_timestamp() / 1000;
        let signed_delta = delta as i128;

        let mut state = self.state.borrow_mut();

        let sender_acct = state.account(sender);
        sender_acct.settle(now);
        if is_increase {
            sender_acct.net_flow_rate = sender_acct.net_flow_rate.saturating_sub(signed_delta);
        } else {
            sender_acct.net_flow_rate = sender_acct.net_flow_rate.saturating_add(signed_delta);
        }

        let recv_acct = state.account(receiver);
        recv_acct.settle(now);
        if is_increase {
            recv_acct.net_flow_rate = recv_acct.net_flow_rate.saturating_add(signed_delta);
        } else {
            recv_acct.net_flow_rate = recv_acct.net_flow_rate.saturating_sub(signed_delta);
        }

        Ok(())
    }

    /// Manually settle an account's accrued flow into static_balance.
    /// Can be called by anyone (e.g. a keeper / the account owner).
    #[export]
    pub fn settle_account(&mut self, account: ActorId) {
        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();
        let acct = state.account(account);
        acct.settle(now);
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

        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();
        let acct = state.account(to);
        acct.settle(now);
        acct.static_balance = acct.static_balance.saturating_add(amount);
        state.total_supply = state.total_supply.saturating_add(amount);
        Ok(())
    }

    /// Burn caller's own tokens (reduces static balance after settling).
    #[export]
    pub fn burn(&mut self, amount: u128) -> Result<(), &'static str> {
        if amount == 0 { return Err("ZeroAmount"); }
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;
        let mut state = self.state.borrow_mut();
        let acct = state.account(caller);
        acct.settle(now);
        if acct.static_balance < amount { return Err("InsufficientBalance"); }
        acct.static_balance -= amount;
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

    /// Real-time balance — accounts for all active flows at current timestamp.
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
        state.account_ref(&account)
            .map(|a| a.static_balance)
            .unwrap_or(0)
    }

    /// Net flow rate for an account (base units per second, signed as i128).
    #[export]
    pub fn net_flow_rate(&self, account: ActorId) -> i128 {
        let state = self.state.borrow();
        state.account_ref(&account)
            .map(|a| a.net_flow_rate)
            .unwrap_or(0)
    }

    /// Full account state (static balance + flow rate + last settled timestamp).
    #[export]
    pub fn get_account_state(&self, account: ActorId) -> AccountState {
        let state = self.state.borrow();
        state.account_ref(&account)
            .cloned()
            .unwrap_or_else(AccountState::new)
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

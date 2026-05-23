#![no_std]

use sails_rs::{
    collections::BTreeMap,
    gstd::msg,
    prelude::*,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct TokenMeta {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: u128,
    pub admin: ActorId,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

static mut STATE: Option<WvaraState> = None;

pub struct WvaraState {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: u128,
    pub admin: ActorId,
    pub balances: BTreeMap<ActorId, u128>,
    pub allowances: BTreeMap<(ActorId, ActorId), u128>,
}

impl WvaraState {
    fn new(admin: ActorId) -> Self {
        Self {
            name: String::from("Wrapped VARA"),
            symbol: String::from("wVARA"),
            decimals: 12,
            total_supply: 0,
            admin,
            balances: BTreeMap::new(),
            allowances: BTreeMap::new(),
        }
    }

    fn get() -> &'static mut Self {
        unsafe { STATE.as_mut().expect("State not initialized") }
    }

    fn balance_of(&self, account: &ActorId) -> u128 {
        self.balances.get(account).copied().unwrap_or(0)
    }

    fn allowance_of(&self, owner: &ActorId, spender: &ActorId) -> u128 {
        self.allowances.get(&(*owner, *spender)).copied().unwrap_or(0)
    }
}

// ---------------------------------------------------------------------------
// Program (constructor)
// ---------------------------------------------------------------------------

pub struct WvaraProgram;

#[program]
impl WvaraProgram {
    pub fn new() -> Self {
        let admin = msg::source();
        unsafe {
            STATE = Some(WvaraState::new(admin));
        }
        Self
    }

    pub fn vft_service(&self) -> VftService {
        VftService
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

pub struct VftService;

impl VftService {
    pub fn new() -> Self {
        Self
    }
}

#[service]
impl VftService {
    // ---- VFT standard methods (required by token-vault) ----

    #[export]
    pub fn transfer(&mut self, to: ActorId, amount: u128) -> bool {
        let state = WvaraState::get();
        let from = msg::source();

        let from_balance = state.balance_of(&from);
        assert!(from_balance >= amount, "Insufficient balance");

        let entry_from = state.balances.entry(from).or_insert(0);
        *entry_from = entry_from.saturating_sub(amount);

        let entry_to = state.balances.entry(to).or_insert(0);
        *entry_to = entry_to.saturating_add(amount);

        true
    }

    #[export]
    pub fn approve(&mut self, spender: ActorId, amount: u128) -> bool {
        let state = WvaraState::get();
        let owner = msg::source();
        state.allowances.insert((owner, spender), amount);
        true
    }

    #[export]
    pub fn transfer_from(&mut self, from: ActorId, to: ActorId, amount: u128) -> bool {
        let state = WvaraState::get();
        let spender = msg::source();

        let from_balance = state.balance_of(&from);
        assert!(from_balance >= amount, "Insufficient balance");

        let current_allowance = state.allowance_of(&from, &spender);
        assert!(current_allowance >= amount, "Insufficient allowance");

        state.allowances.insert(
            (from, spender),
            current_allowance.saturating_sub(amount),
        );

        let entry_from = state.balances.entry(from).or_insert(0);
        *entry_from = entry_from.saturating_sub(amount);

        let entry_to = state.balances.entry(to).or_insert(0);
        *entry_to = entry_to.saturating_add(amount);

        true
    }

    // ---- Wrap / Unwrap (native VARA <-> wVARA) ----

    /// Wrap: send native VARA with this message, receive wVARA 1:1
    #[export]
    pub fn wrap(&mut self) {
        let state = WvaraState::get();
        let caller = msg::source();
        let value = msg::value();

        assert!(value > 0, "Must send VARA to wrap");

        let entry = state.balances.entry(caller).or_insert(0);
        *entry = entry.saturating_add(value);
        state.total_supply = state.total_supply.saturating_add(value);
    }

    /// Unwrap: burn wVARA and receive native VARA 1:1
    #[export]
    pub fn unwrap(&mut self, amount: u128) {
        let state = WvaraState::get();
        let caller = msg::source();

        assert!(amount > 0, "Amount must be > 0");

        let balance = state.balance_of(&caller);
        assert!(balance >= amount, "Insufficient wVARA balance");

        let entry = state.balances.entry(caller).or_insert(0);
        *entry = entry.saturating_sub(amount);
        state.total_supply = state.total_supply.saturating_sub(amount);

        msg::send(caller, b"", amount).expect("Failed to send VARA");
    }

    // ---- Admin mint/burn (for emergency / bridge scenarios) ----

    #[export]
    pub fn mint(&mut self, to: ActorId, amount: u128) {
        let state = WvaraState::get();
        let caller = msg::source();
        assert!(caller == state.admin, "Only admin can mint");
        assert!(amount > 0, "Amount must be > 0");

        let entry = state.balances.entry(to).or_insert(0);
        *entry = entry.saturating_add(amount);
        state.total_supply = state.total_supply.saturating_add(amount);
    }

    #[export]
    pub fn burn(&mut self, amount: u128) {
        let state = WvaraState::get();
        let caller = msg::source();

        let balance = state.balance_of(&caller);
        assert!(balance >= amount, "Insufficient balance to burn");

        let entry = state.balances.entry(caller).or_insert(0);
        *entry = entry.saturating_sub(amount);
        state.total_supply = state.total_supply.saturating_sub(amount);
    }

    // ---- Queries ----

    #[export]
    pub fn balance_of(&self, account: ActorId) -> u128 {
        let state = WvaraState::get();
        state.balance_of(&account)
    }

    #[export]
    pub fn allowance(&self, owner: ActorId, spender: ActorId) -> u128 {
        let state = WvaraState::get();
        state.allowance_of(&owner, &spender)
    }

    #[export]
    pub fn total_supply(&self) -> u128 {
        let state = WvaraState::get();
        state.total_supply
    }

    #[export]
    pub fn name(&self) -> String {
        let state = WvaraState::get();
        state.name.clone()
    }

    #[export]
    pub fn symbol(&self) -> String {
        let state = WvaraState::get();
        state.symbol.clone()
    }

    #[export]
    pub fn decimals(&self) -> u8 {
        let state = WvaraState::get();
        state.decimals
    }

    #[export]
    pub fn get_meta(&self) -> TokenMeta {
        let state = WvaraState::get();
        TokenMeta {
            name: state.name.clone(),
            symbol: state.symbol.clone(),
            decimals: state.decimals,
            total_supply: state.total_supply,
            admin: state.admin,
        }
    }
}

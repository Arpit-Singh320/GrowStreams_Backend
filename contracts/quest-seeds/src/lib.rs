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
pub struct SeedsMeta {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: u128,
    pub admin: ActorId,
    pub total_holders: u32,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct MintEvent {
    pub to: ActorId,
    pub amount: u128,
    pub reason: String,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

static mut STATE: Option<QuestSeedsState> = None;

pub struct QuestSeedsState {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: u128,
    pub admin: ActorId,
    pub balances: BTreeMap<ActorId, u128>,
}

impl QuestSeedsState {
    fn new(admin: ActorId) -> Self {
        Self {
            name: String::from("GrowStreams Seeds"),
            symbol: String::from("SEEDS"),
            decimals: 0,
            total_supply: 0,
            admin,
            balances: BTreeMap::new(),
        }
    }

    fn get() -> &'static mut Self {
        unsafe { STATE.as_mut().expect("State not initialized") }
    }

    fn balance_of(&self, account: &ActorId) -> u128 {
        self.balances.get(account).copied().unwrap_or(0)
    }

    fn holder_count(&self) -> u32 {
        self.balances.iter().filter(|(_, &v)| v > 0).count() as u32
    }
}

// ---------------------------------------------------------------------------
// Program (constructor)
// ---------------------------------------------------------------------------

pub struct QuestSeedsProgram;

#[program]
impl QuestSeedsProgram {
    pub fn new() -> Self {
        let admin = msg::source();
        unsafe {
            STATE = Some(QuestSeedsState::new(admin));
        }
        Self
    }

    pub fn seeds_service(&self) -> SeedsService {
        SeedsService
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

pub struct SeedsService;

impl SeedsService {
    pub fn new() -> Self {
        Self
    }
}

#[service]
impl SeedsService {
    // ---- Commands ----

    /// Mint Seeds to a user (admin only). Called by backend on quest completion.
    #[export]
    pub fn mint(&mut self, to: ActorId, amount: u128, reason: String) -> MintEvent {
        let state = QuestSeedsState::get();
        let caller = msg::source();
        assert!(caller == state.admin, "Only admin can mint");
        assert!(amount > 0, "Amount must be > 0");

        let entry = state.balances.entry(to).or_insert(0);
        *entry = entry.saturating_add(amount);
        state.total_supply = state.total_supply.saturating_add(amount);

        MintEvent { to, amount, reason }
    }

    /// Batch mint Seeds to multiple users (admin only).
    #[export]
    pub fn batch_mint(&mut self, recipients: Vec<(ActorId, u128, String)>) -> Vec<MintEvent> {
        let state = QuestSeedsState::get();
        let caller = msg::source();
        assert!(caller == state.admin, "Only admin can mint");

        let mut events = Vec::new();
        for (to, amount, reason) in recipients {
            if amount == 0 {
                continue;
            }
            let entry = state.balances.entry(to).or_insert(0);
            *entry = entry.saturating_add(amount);
            state.total_supply = state.total_supply.saturating_add(amount);
            events.push(MintEvent { to, amount, reason });
        }
        events
    }

    /// Transfer Seeds between users.
    #[export]
    pub fn transfer(&mut self, to: ActorId, amount: u128) -> bool {
        let state = QuestSeedsState::get();
        let from = msg::source();

        let from_balance = state.balance_of(&from);
        assert!(from_balance >= amount, "Insufficient Seeds balance");

        let entry_from = state.balances.entry(from).or_insert(0);
        *entry_from = entry_from.saturating_sub(amount);

        let entry_to = state.balances.entry(to).or_insert(0);
        *entry_to = entry_to.saturating_add(amount);

        true
    }

    /// Burn Seeds (caller burns their own).
    #[export]
    pub fn burn(&mut self, amount: u128) {
        let state = QuestSeedsState::get();
        let caller = msg::source();

        let balance = state.balance_of(&caller);
        assert!(balance >= amount, "Insufficient Seeds to burn");

        let entry = state.balances.entry(caller).or_insert(0);
        *entry = entry.saturating_sub(amount);
        state.total_supply = state.total_supply.saturating_sub(amount);
    }

    // ---- Queries ----

    #[export]
    pub fn balance_of(&self, account: ActorId) -> u128 {
        let state = QuestSeedsState::get();
        state.balance_of(&account)
    }

    #[export]
    pub fn total_supply(&self) -> u128 {
        let state = QuestSeedsState::get();
        state.total_supply
    }

    #[export]
    pub fn name(&self) -> String {
        let state = QuestSeedsState::get();
        state.name.clone()
    }

    #[export]
    pub fn symbol(&self) -> String {
        let state = QuestSeedsState::get();
        state.symbol.clone()
    }

    #[export]
    pub fn decimals(&self) -> u8 {
        let state = QuestSeedsState::get();
        state.decimals
    }

    #[export]
    pub fn get_meta(&self) -> SeedsMeta {
        let state = QuestSeedsState::get();
        SeedsMeta {
            name: state.name.clone(),
            symbol: state.symbol.clone(),
            decimals: state.decimals,
            total_supply: state.total_supply,
            admin: state.admin,
            total_holders: state.holder_count(),
        }
    }
}

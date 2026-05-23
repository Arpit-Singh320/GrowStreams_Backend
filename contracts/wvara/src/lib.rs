#![no_std]

use sails_rs::{
    collections::BTreeMap,
    gstd::msg,
    prelude::*,
};

// ---------------------------------------------------------------------------
// U256 helper — token-vault encodes amounts as 32-byte LE (u256)
// ---------------------------------------------------------------------------

/// Decode a u256 (32-byte LE) sent by token-vault into a u128.
/// Only the low 16 bytes matter; values >u128::MAX are clamped (won't happen in practice).
#[derive(Clone, Copy, Default)]
pub struct U256Le([u8; 32]);

impl Decode for U256Le {
    fn decode<I: parity_scale_codec::Input>(
        input: &mut I,
    ) -> Result<Self, parity_scale_codec::Error> {
        let mut buf = [0u8; 32];
        input.read(&mut buf)?;
        Ok(Self(buf))
    }
}

impl TypeInfo for U256Le {
    type Identity = Self;
    fn type_info() -> scale_info::Type {
        scale_info::Type::builder()
            .path(scale_info::Path::new("U256Le", module_path!()))
            .composite(scale_info::build::Fields::unnamed().field(|f| {
                f.ty::<[u8; 32]>()
            }))
            .into()
    }
}

impl U256Le {
    fn to_u128(self) -> u128 {
        u128::from_le_bytes(self.0[..16].try_into().unwrap_or([0u8; 16]))
    }
}

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

    /// Service name MUST be "Vft" — token-vault calls encode_call("Vft", "TransferFrom", ...)
    pub fn vft(&self) -> Vft {
        Vft
    }
}

// ---------------------------------------------------------------------------
// Service — named "Vft" to match token-vault's outgoing call encoding
// ---------------------------------------------------------------------------

pub struct Vft;

#[service]
impl Vft {
    // ---- VFT standard (amounts as U256Le to match token-vault encoding) ----

    /// Called by token-vault as: Vft::Transfer(to, amount_u256)
    #[export]
    pub fn transfer(&mut self, to: ActorId, amount: U256Le) -> bool {
        let state = WvaraState::get();
        let from = msg::source();
        let amt = amount.to_u128();

        let from_balance = state.balance_of(&from);
        if from_balance < amt { return false; }

        *state.balances.entry(from).or_insert(0) -= amt;
        *state.balances.entry(to).or_insert(0) += amt;
        true
    }

    /// Called by token-vault as: Vft::TransferFrom(from, to, amount_u256)
    #[export]
    pub fn transfer_from(&mut self, from: ActorId, to: ActorId, amount: U256Le) -> bool {
        let state = WvaraState::get();
        let spender = msg::source();
        let amt = amount.to_u128();

        let from_balance = state.balance_of(&from);
        if from_balance < amt { return false; }

        let allowance = state.allowance_of(&from, &spender);
        if allowance < amt { return false; }

        state.allowances.insert((from, spender), allowance - amt);
        *state.balances.entry(from).or_insert(0) -= amt;
        *state.balances.entry(to).or_insert(0) += amt;
        true
    }

    /// Called by frontend approve step: Vft::Approve(spender, amount_u256)
    #[export]
    pub fn approve(&mut self, spender: ActorId, amount: U256Le) -> bool {
        let state = WvaraState::get();
        let owner = msg::source();
        state.allowances.insert((owner, spender), amount.to_u128());
        true
    }

    // ---- Wrap / Unwrap (native VARA <-> wVARA) ----

    /// Wrap native VARA → wVARA 1:1. Attach VARA value to this message.
    #[export]
    pub fn wrap(&mut self) {
        let state = WvaraState::get();
        let caller = msg::source();
        let value = msg::value();
        assert!(value > 0, "Must send VARA to wrap");
        *state.balances.entry(caller).or_insert(0) += value;
        state.total_supply += value;
    }

    /// Unwrap wVARA → native VARA 1:1. Burns wVARA and sends back VARA.
    #[export]
    pub fn unwrap(&mut self, amount: u128) {
        let state = WvaraState::get();
        let caller = msg::source();
        assert!(amount > 0, "Amount must be > 0");
        let balance = state.balance_of(&caller);
        assert!(balance >= amount, "Insufficient wVARA balance");
        *state.balances.entry(caller).or_insert(0) -= amount;
        state.total_supply -= amount;
        msg::send(caller, b"", amount).expect("Failed to send VARA");
    }

    // ---- Admin mint/burn ----

    #[export]
    pub fn mint(&mut self, to: ActorId, amount: u128) {
        let state = WvaraState::get();
        assert!(msg::source() == state.admin, "Only admin can mint");
        assert!(amount > 0, "Amount must be > 0");
        *state.balances.entry(to).or_insert(0) += amount;
        state.total_supply += amount;
    }

    #[export]
    pub fn burn(&mut self, amount: u128) {
        let state = WvaraState::get();
        let caller = msg::source();
        let balance = state.balance_of(&caller);
        assert!(balance >= amount, "Insufficient balance to burn");
        *state.balances.entry(caller).or_insert(0) -= amount;
        state.total_supply -= amount;
    }

    // ---- Queries ----

    #[export]
    pub fn balance_of(&self, account: ActorId) -> u128 {
        WvaraState::get().balance_of(&account)
    }

    #[export]
    pub fn allowance(&self, owner: ActorId, spender: ActorId) -> u128 {
        WvaraState::get().allowance_of(&owner, &spender)
    }

    #[export]
    pub fn total_supply(&self) -> u128 {
        WvaraState::get().total_supply
    }

    #[export]
    pub fn name(&self) -> String {
        WvaraState::get().name.clone()
    }

    #[export]
    pub fn symbol(&self) -> String {
        WvaraState::get().symbol.clone()
    }

    #[export]
    pub fn decimals(&self) -> u8 {
        WvaraState::get().decimals
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

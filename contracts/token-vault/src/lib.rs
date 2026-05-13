#![no_std]

use sails_rs::{
    cell::RefCell,
    collections::BTreeMap,
    gstd::msg,
    prelude::*,
};
use gstd::msg as gstd_msg;
use gstd::exec;
use parity_scale_codec::Decode as ScaleDecode;

/// A u256 value encoded as 32 bytes LE for VFT interop.
/// VFT contracts expect u256 (SCALE = 32 bytes LE) but vault uses u128 internally.
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

/// Decode a VFT bool reply defensively across possible encodings:
///   1. Sails route-prefixed:  SCALE(service) + SCALE(method) + bool
///   2. Raw bool:              a single byte (0x00 / 0x01)
///   3. Empty reply:           some VFT implementations reply with no bytes on success
///
/// Returns `false` only when a definitive `false` is decoded. Otherwise returns
/// `true`, because reaching this function already means `send_bytes_for_reply.await`
/// did NOT return ErrorReply (i.e. the VFT contract did not panic and the
/// transfer has been applied on-chain). Treating an un-parseable reply as
/// failure would desynchronize the vault's ledger from the VFT balances.
fn decode_vft_bool_reply(reply_bytes: &[u8]) -> bool {
    // No reply bytes → VFT returned unit/empty; treat as success.
    if reply_bytes.is_empty() {
        return true;
    }

    // Try 1: Sails-routed encoding — SCALE(service) + SCALE(method) + bool
    {
        let mut input = &reply_bytes[..];
        if <String as ScaleDecode>::decode(&mut input).is_ok()
            && <String as ScaleDecode>::decode(&mut input).is_ok()
        {
            if let Ok(b) = <bool as ScaleDecode>::decode(&mut input) {
                return b;
            }
        }
    }

    // Try 2: raw single-byte bool
    if reply_bytes.len() == 1 {
        return reply_bytes[0] != 0;
    }

    // Try 3: last-byte heuristic (Sails replies end with the result payload)
    let last = reply_bytes[reply_bytes.len() - 1];
    if last == 0 {
        return false;
    }
    if last == 1 {
        return true;
    }

    // Unknown reply format, but the VFT did not panic → assume success.
    true
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct VaultBalance {
    pub owner: ActorId,
    pub token: ActorId,
    pub total_deposited: u128,
    pub total_allocated: u128,
    pub available: u128,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct VaultConfig {
    pub admin: ActorId,
    pub stream_core: ActorId,
    pub paused: bool,
    pub total_tokens_held: u128,
}

/// Typed error enum for vault operations.
/// Exposed via `#[export(unwrap_result)]` for explicit fail-fast semantics.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub enum VaultError {
    Paused,
    ZeroAmount,
    UseDepositNative,
    UseWithdrawNative,
    InsufficientBalance,
    VftTransferFailed,
    Unauthorized,
    NoAllocation,
    AllocationExceeded,
    NativeTransferFailed,
}

// ---------------------------------------------------------------------------
// State (program-owned RefCell — production default per Gear patterns)
// ---------------------------------------------------------------------------

pub struct TokenVaultState {
    pub admin: ActorId,
    pub stream_core: ActorId,
    pub paused: bool,
    pub balances: BTreeMap<(ActorId, ActorId), VaultBalance>,
    pub stream_allocations: BTreeMap<u64, u128>,
}

impl TokenVaultState {
    fn new(admin: ActorId, stream_core: ActorId) -> Self {
        Self {
            admin,
            stream_core,
            paused: false,
            balances: BTreeMap::new(),
            stream_allocations: BTreeMap::new(),
        }
    }

    fn get_or_create_balance(&mut self, owner: ActorId, token: ActorId) -> &mut VaultBalance {
        self.balances.entry((owner, token)).or_insert(VaultBalance {
            owner,
            token,
            total_deposited: 0,
            total_allocated: 0,
            available: 0,
        })
    }
}

// ---------------------------------------------------------------------------
// Program (owns state via RefCell)
// ---------------------------------------------------------------------------

pub struct TokenVaultProgram {
    state: RefCell<TokenVaultState>,
}

#[program]
impl TokenVaultProgram {
    pub fn new() -> Self {
        let admin = msg::source();
        Self {
            state: RefCell::new(TokenVaultState::new(admin, ActorId::zero())),
        }
    }

    pub fn vault_service(&self) -> VaultService<'_> {
        VaultService::new(&self.state)
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

pub struct VaultService<'a> {
    state: &'a RefCell<TokenVaultState>,
}

impl<'a> VaultService<'a> {
    pub fn new(state: &'a RefCell<TokenVaultState>) -> Self {
        Self { state }
    }
}

#[service]
impl<'a> VaultService<'a> {
    // ---- Commands ----

    #[export]
    pub async fn deposit_tokens(&mut self, token: ActorId, amount: u128) -> Result<(), VaultError> {
        {
            let state = self.state.borrow();
            if state.paused { return Err(VaultError::Paused); }
        }
        if amount == 0 { return Err(VaultError::ZeroAmount); }
        if token == ActorId::zero() { return Err(VaultError::UseDepositNative); }

        let caller = msg::source();

        // Pull tokens from caller via VFT transfer_from(caller, vault, amount)
        let vault_id = exec::program_id();
        let amount_u256 = VftU256::from_u128(amount);
        let payload = encode_call(
            "Vft",
            "TransferFrom",
            (caller, vault_id, amount_u256),
        );
        let reply = gstd_msg::send_bytes_for_reply(token, payload, 0, 0)
            .map_err(|_| VaultError::VftTransferFailed)?
            .await
            .map_err(|_| VaultError::VftTransferFailed)?;

        // Decode reply: strip SCALE route prefix (service + method name), then decode bool
        let reply_bytes: &[u8] = reply.as_slice();
        if !decode_vft_bool_reply(reply_bytes) {
            return Err(VaultError::VftTransferFailed);
        }

        let mut state = self.state.borrow_mut();
        let balance = state.get_or_create_balance(caller, token);
        balance.total_deposited = balance.total_deposited.saturating_add(amount);
        balance.available = balance.available.saturating_add(amount);
        Ok(())
    }

    #[export]
    pub fn deposit_native(&mut self) -> Result<(), VaultError> {
        let mut state = self.state.borrow_mut();
        if state.paused { return Err(VaultError::Paused); }
        
        let value = msg::value();
        if value == 0 { return Err(VaultError::ZeroAmount); }
        
        let caller = msg::source();
        let token = ActorId::zero();
        let balance = state.get_or_create_balance(caller, token);
        balance.total_deposited = balance.total_deposited.saturating_add(value);
        balance.available = balance.available.saturating_add(value);
        Ok(())
    }

    #[export]
    pub async fn withdraw_tokens(&mut self, token: ActorId, amount: u128) -> Result<(), VaultError> {
        if token == ActorId::zero() { return Err(VaultError::UseWithdrawNative); }
        let caller = msg::source();

        // Debit first, revert on VFT failure
        {
            let mut state = self.state.borrow_mut();
            if state.paused { return Err(VaultError::Paused); }
            let balance = state.get_or_create_balance(caller, token);
            if balance.available < amount { return Err(VaultError::InsufficientBalance); }
            balance.available = balance.available.saturating_sub(amount);
        }

        // Send tokens to caller via VFT transfer(caller, amount)
        let amount_u256 = VftU256::from_u128(amount);
        let payload = encode_call(
            "Vft",
            "Transfer",
            (caller, amount_u256),
        );
        let reply = gstd_msg::send_bytes_for_reply(token, payload, 0, 0)
            .map_err(|_| VaultError::VftTransferFailed)?
            .await
            .map_err(|_| VaultError::VftTransferFailed)?;

        let reply_bytes: &[u8] = reply.as_slice();
        // If VFT transfer failed, revert the balance change
        if !decode_vft_bool_reply(reply_bytes) {
            let mut state = self.state.borrow_mut();
            let balance = state.get_or_create_balance(caller, token);
            balance.available = balance.available.saturating_add(amount);
            return Err(VaultError::VftTransferFailed);
        }
        Ok(())
    }

    #[export]
    pub fn withdraw_native(&mut self, amount: u128) -> Result<(), VaultError> {
        let mut state = self.state.borrow_mut();
        if state.paused { return Err(VaultError::Paused); }
        
        let caller = msg::source();
        let token = ActorId::zero();
        let balance = state.get_or_create_balance(caller, token);
        if balance.available < amount { return Err(VaultError::InsufficientBalance); }
        
        balance.available = balance.available.saturating_sub(amount);
        msg::send(caller, b"", amount).map_err(|_| VaultError::NativeTransferFailed)?;
        Ok(())
    }

    #[export]
    pub fn allocate_to_stream(
        &mut self,
        owner: ActorId,
        token: ActorId,
        amount: u128,
        stream_id: u64,
    ) -> Result<(), VaultError> {
        let mut state = self.state.borrow_mut();
        let caller = msg::source();
        if caller != state.stream_core { return Err(VaultError::Unauthorized); }

        let balance = state.get_or_create_balance(owner, token);
        if balance.available < amount { return Err(VaultError::InsufficientBalance); }

        balance.available = balance.available.saturating_sub(amount);
        balance.total_allocated = balance.total_allocated.saturating_add(amount);

        let current = state.stream_allocations.entry(stream_id).or_insert(0);
        *current = current.saturating_add(amount);
        Ok(())
    }

    #[export]
    pub fn release_from_stream(
        &mut self,
        owner: ActorId,
        token: ActorId,
        amount: u128,
        stream_id: u64,
    ) -> Result<(), VaultError> {
        let mut state = self.state.borrow_mut();
        let caller = msg::source();
        if caller != state.stream_core { return Err(VaultError::Unauthorized); }

        let alloc = state
            .stream_allocations
            .get_mut(&stream_id)
            .ok_or(VaultError::NoAllocation)?;
        if *alloc < amount { return Err(VaultError::AllocationExceeded); }
        *alloc = alloc.saturating_sub(amount);

        let balance = state.get_or_create_balance(owner, token);
        balance.total_allocated = balance.total_allocated.saturating_sub(amount);
        balance.available = balance.available.saturating_add(amount);
        Ok(())
    }

    #[export]
    pub async fn transfer_to_receiver(
        &mut self,
        token: ActorId,
        receiver: ActorId,
        amount: u128,
        stream_id: u64,
    ) -> Result<(), VaultError> {
        {
            let mut state = self.state.borrow_mut();
            let caller = msg::source();
            if caller != state.stream_core { return Err(VaultError::Unauthorized); }

            let alloc = state
                .stream_allocations
                .get_mut(&stream_id)
                .ok_or(VaultError::NoAllocation)?;
            if *alloc < amount { return Err(VaultError::AllocationExceeded); }
            *alloc = alloc.saturating_sub(amount);
        }

        if token == ActorId::zero() {
            msg::send(receiver, b"\x00", amount).map_err(|_| VaultError::NativeTransferFailed)?;
        } else {
            // Send tokens to receiver via VFT transfer(receiver, amount)
            let amount_u256 = VftU256::from_u128(amount);
            let payload = encode_call(
                "Vft",
                "Transfer",
                (receiver, amount_u256),
            );
            let reply = gstd_msg::send_bytes_for_reply(token, payload, 0, 0)
                .map_err(|_| VaultError::VftTransferFailed)?
                .await
                .map_err(|_| VaultError::VftTransferFailed)?;

            let reply_bytes: &[u8] = reply.as_slice();
            if !decode_vft_bool_reply(reply_bytes) {
                return Err(VaultError::VftTransferFailed);
            }
        }
        Ok(())
    }

    #[export]
    pub fn emergency_pause(&mut self) -> Result<(), VaultError> {
        let mut state = self.state.borrow_mut();
        let caller = msg::source();
        if caller != state.admin { return Err(VaultError::Unauthorized); }
        state.paused = true;
        Ok(())
    }

    #[export]
    pub fn emergency_unpause(&mut self) -> Result<(), VaultError> {
        let mut state = self.state.borrow_mut();
        let caller = msg::source();
        if caller != state.admin { return Err(VaultError::Unauthorized); }
        state.paused = false;
        Ok(())
    }

    #[export]
    pub fn set_stream_core(&mut self, stream_core: ActorId) -> Result<(), VaultError> {
        let mut state = self.state.borrow_mut();
        let caller = msg::source();
        if caller != state.admin { return Err(VaultError::Unauthorized); }
        state.stream_core = stream_core;
        Ok(())
    }

    // ---- Queries ----

    #[export]
    pub fn get_balance(&self, owner: ActorId, token: ActorId) -> VaultBalance {
        let state = self.state.borrow();
        state
            .balances
            .get(&(owner, token))
            .cloned()
            .unwrap_or(VaultBalance {
                owner,
                token,
                total_deposited: 0,
                total_allocated: 0,
                available: 0,
            })
    }

    #[export]
    pub fn get_stream_allocation(&self, stream_id: u64) -> u128 {
        let state = self.state.borrow();
        state
            .stream_allocations
            .get(&stream_id)
            .copied()
            .unwrap_or(0)
    }

    #[export]
    pub fn is_paused(&self) -> bool {
        let state = self.state.borrow();
        state.paused
    }

    #[export]
    pub fn get_config(&self) -> VaultConfig {
        let state = self.state.borrow();
        // Compute total_tokens_held by summing all available + allocated balances
        let total: u128 = state.balances.values()
            .map(|b| b.available.saturating_add(b.total_allocated))
            .sum();
        VaultConfig {
            admin: state.admin,
            stream_core: state.stream_core,
            paused: state.paused,
            total_tokens_held: total,
        }
    }
}

#![no_std]

use sails_rs::{
    collections::BTreeMap,
    gstd::{exec, msg},
    prelude::*,
};
use gstd::msg as gstd_msg;
use parity_scale_codec::Decode as ScaleDecode;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn encode_call(service: &str, method: &str, args: impl Encode) -> Vec<u8> {
    let mut payload = Vec::new();
    service.encode_to(&mut payload);
    method.encode_to(&mut payload);
    args.encode_to(&mut payload);
    payload
}

/// Decode a Sails-routed `Result<(), VaultError>` reply.
///
/// Reply wire format: SCALE(service_name) + SCALE(method_name) + SCALE(Result).
/// `Result<(), E>` discriminant: 0x00 = Ok (no payload for `()`), 0x01 = Err(_).
///
/// Returns `true` on definitive Ok, `false` on any decode failure or Err variant.
fn decode_vault_result_ok(reply_bytes: &[u8]) -> bool {
    let mut input = &reply_bytes[..];
    if <String as ScaleDecode>::decode(&mut input).is_err() { return false; }
    if <String as ScaleDecode>::decode(&mut input).is_err() { return false; }
    match input.first() {
        Some(&0x00) => true,
        _ => false,
    }
}

/// Decode a Sails-routed `Result<(), str>` reply from super-token.
/// Same discriminant logic: 0x00 prefix after service+method strings = Ok.
fn decode_super_token_result_ok(reply_bytes: &[u8]) -> bool {
    // Try Sails-routed: SCALE(service) + SCALE(method) + Result discriminant
    {
        let mut input = &reply_bytes[..];
        if <String as ScaleDecode>::decode(&mut input).is_ok()
            && <String as ScaleDecode>::decode(&mut input).is_ok()
        {
            return input.first().map(|&b| b == 0x00).unwrap_or(false);
        }
    }
    // Fallback: empty reply = success, single 0x00 byte = Ok
    if reply_bytes.is_empty() { return true; }
    if reply_bytes.len() == 1 { return reply_bytes[0] == 0x00; }
    false
}

/// Send a call to the vault and await the reply, returning true only if the
/// vault replied with `Ok(())`. Returns false on send error, reply error, or
/// `Err(VaultError)` variant.
async fn call_vault_checked(vault: ActorId, payload: Vec<u8>) -> bool {
    let reply = match gstd_msg::send_bytes_for_reply(vault, payload, 0, 0) {
        Ok(fut) => match fut.await {
            Ok(bytes) => bytes,
            Err(_) => return false,
        },
        Err(_) => return false,
    };
    decode_vault_result_ok(reply.as_slice())
}

/// Call super-token UpdateFlow and await the reply.
/// `is_increase = true`  → sender rate decreases, receiver rate increases (stream starting/increasing).
/// `is_increase = false` → sender rate increases, receiver rate decreases (stream stopping/decreasing).
async fn call_super_token_update_flow(
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
        Ok(fut) => match fut.await {
            Ok(bytes) => bytes,
            Err(_) => return false,
        },
        Err(_) => return false,
    };
    decode_super_token_result_ok(reply.as_slice())
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

pub type StreamId = u64;

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
pub enum StreamStatus {
    Active,
    Paused,
    Stopped,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct Stream {
    pub id: StreamId,
    pub sender: ActorId,
    pub receiver: ActorId,
    pub token: ActorId,
    pub flow_rate: u128,
    pub start_time: u64,
    pub last_update: u64,
    pub deposited: u128,
    pub withdrawn: u128,
    pub streamed: u128,
    pub status: StreamStatus,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct Config {
    pub admin: ActorId,
    pub min_buffer_seconds: u64,
    pub next_stream_id: StreamId,
    pub token_vault: ActorId,
    /// Number of registered super tokens.
    pub super_token_count: u32,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

static mut STATE: Option<StreamCoreState> = None;

pub struct StreamCoreState {
    pub config: Config,
    pub streams: BTreeMap<StreamId, Stream>,
    pub sender_streams: BTreeMap<ActorId, Vec<StreamId>>,
    pub receiver_streams: BTreeMap<ActorId, Vec<StreamId>>,
    pub active_count: u64,
    /// Maps underlying token ActorId → Super Token contract ActorId.
    /// When a stream's token is found here, super-token flow calls are used
    /// instead of vault allocate/release/transfer.
    pub super_token_registry: BTreeMap<ActorId, ActorId>,
}

impl StreamCoreState {
    fn new(admin: ActorId, min_buffer_seconds: u64) -> Self {
        Self {
            config: Config {
                admin,
                min_buffer_seconds,
                next_stream_id: 1,
                token_vault: ActorId::zero(),
                super_token_count: 0,
            },
            streams: BTreeMap::new(),
            sender_streams: BTreeMap::new(),
            receiver_streams: BTreeMap::new(),
            active_count: 0,
            super_token_registry: BTreeMap::new(),
        }
    }

    /// Returns the Super Token contract for `token`, if registered.
    fn super_token_for(state: &Self, token: &ActorId) -> Option<ActorId> {
        state.super_token_registry.get(token).copied()
    }

    fn get() -> &'static mut Self {
        unsafe { STATE.as_mut().expect("State not initialized") }
    }

    fn accrued_since_last_update(stream: &Stream, now: u64) -> u128 {
        if stream.status != StreamStatus::Active || now <= stream.last_update {
            return 0;
        }
        let elapsed = (now - stream.last_update) as u128;
        stream.flow_rate.saturating_mul(elapsed)
    }

    fn total_streamed(stream: &Stream, now: u64) -> u128 {
        stream
            .streamed
            .saturating_add(Self::accrued_since_last_update(stream, now))
    }

    fn withdrawable_balance(stream: &Stream, now: u64) -> u128 {
        let total = Self::total_streamed(stream, now);
        let capped = total.min(stream.deposited);
        capped.saturating_sub(stream.withdrawn)
    }

    fn remaining_buffer(stream: &Stream, now: u64) -> u128 {
        let total = Self::total_streamed(stream, now);
        stream.deposited.saturating_sub(total)
    }

    fn settle(stream: &mut Stream, now: u64) {
        if stream.status == StreamStatus::Active {
            let accrued = Self::accrued_since_last_update(stream, now);
            stream.streamed = stream.streamed.saturating_add(accrued);
            if stream.streamed > stream.deposited {
                stream.streamed = stream.deposited;
            }
            stream.last_update = now;
        }
    }

    fn should_liquidate(stream: &Stream, now: u64, min_buffer_seconds: u64) -> bool {
        if stream.status != StreamStatus::Active || stream.flow_rate == 0 {
            return false;
        }
        let remaining = Self::remaining_buffer(stream, now);
        let min_buffer = stream.flow_rate.saturating_mul(min_buffer_seconds as u128);
        remaining < min_buffer
    }
}

// ---------------------------------------------------------------------------
// Program (constructor)
// ---------------------------------------------------------------------------

pub struct StreamCoreProgram;

#[program]
impl StreamCoreProgram {
    pub fn new() -> Self {
        let admin = msg::source();
        unsafe {
            STATE = Some(StreamCoreState::new(admin, 3600));
        }
        Self
    }

    pub fn stream_service(&self) -> StreamService {
        StreamService
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

pub struct StreamService;

impl StreamService {
    pub fn new() -> Self {
        Self
    }
}

#[service]
impl StreamService {
    // ---- Commands ----

    #[export]
    pub async fn create_stream(
        &mut self,
        receiver: ActorId,
        token: ActorId,
        flow_rate: u128,
        initial_deposit: u128,
    ) -> u64 {
        let state = StreamCoreState::get();
        let sender = msg::source();
        let now = exec::block_timestamp() / 1000;

        assert!(flow_rate > 0, "Flow rate must be > 0");
        assert!(sender != receiver, "Sender and receiver must differ");

        let min_deposit = flow_rate.saturating_mul(state.config.min_buffer_seconds as u128);
        assert!(
            initial_deposit >= min_deposit,
            "Initial deposit must cover minimum buffer"
        );

        let id = state.config.next_stream_id;
        let super_token_opt = StreamCoreState::super_token_for(state, &token);

        if let Some(super_token) = super_token_opt {
            // ---- Super Token path ------------------------------------------------
            // Caller must already hold wrapped super tokens. We call update_flow
            // to register the ongoing per-second transfer. No vault interaction.
            let ok = call_super_token_update_flow(
                super_token, sender, receiver, flow_rate, true,
            ).await;
            assert!(ok, "SuperToken update_flow failed");
        } else {
            // ---- Legacy vault path -----------------------------------------------
            let vault = state.config.token_vault;
            assert!(vault != ActorId::zero(), "Token vault not configured");
            let payload = encode_call(
                "VaultService",
                "AllocateToStream",
                (sender, token, initial_deposit, id),
            );
            let ok = call_vault_checked(vault, payload).await;
            assert!(ok, "Vault allocate failed");
        }

        // Commit stream state (same for both paths).
        let state = StreamCoreState::get();
        state.config.next_stream_id += 1;

        let stream = Stream {
            id,
            sender,
            receiver,
            token,
            flow_rate,
            start_time: now,
            last_update: now,
            deposited: initial_deposit,
            withdrawn: 0,
            streamed: 0,
            status: StreamStatus::Active,
        };

        state.streams.insert(id, stream);
        state.sender_streams.entry(sender).or_default().push(id);
        state.receiver_streams.entry(receiver).or_default().push(id);
        state.active_count += 1;

        id
    }

    #[export]
    pub async fn update_stream(&mut self, stream_id: u64, new_flow_rate: u128) {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        let (old_flow_rate, token) = {
            let stream = state.streams.get(&stream_id).expect("Stream not found");
            assert!(stream.sender == caller, "Only sender can update stream");
            assert!(
                stream.status != StreamStatus::Stopped,
                "Cannot update a stopped stream"
            );
            assert!(new_flow_rate > 0, "Flow rate must be > 0");
            (stream.flow_rate, stream.token)
        };

        let super_token_opt = StreamCoreState::super_token_for(state, &token);

        if let Some(super_token) = super_token_opt {
            // ---- Super Token path: reverse old rate then apply new rate ----------
            if old_flow_rate > 0 {
                // Remove old outgoing flow from sender, remove old incoming from receiver
                let sender = state.streams.get(&stream_id).unwrap().sender;
                let receiver = state.streams.get(&stream_id).unwrap().receiver;
                let ok = call_super_token_update_flow(
                    super_token, sender, receiver, old_flow_rate, false,
                ).await;
                assert!(ok, "SuperToken update_flow (reverse) failed");
            }
            // Apply new rate
            let sender = state.streams.get(&stream_id).unwrap().sender;
            let receiver = state.streams.get(&stream_id).unwrap().receiver;
            let ok = call_super_token_update_flow(
                super_token, sender, receiver, new_flow_rate, true,
            ).await;
            assert!(ok, "SuperToken update_flow (new rate) failed");
        }
        // Legacy vault path: no vault call needed for rate change.

        // Commit stream state.
        let state = StreamCoreState::get();
        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");
        StreamCoreState::settle(stream, now);
        stream.flow_rate = new_flow_rate;
    }

    #[export]
    pub async fn stop_stream(&mut self, stream_id: u64) {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;
        let vault = state.config.token_vault;

        let (sender, token, unstreamed, deposited, streamed_after_settle, flow_rate) = {
            let stream = state.streams.get(&stream_id).expect("Stream not found");
            assert!(stream.sender == caller, "Only sender can stop stream");
            assert!(
                stream.status != StreamStatus::Stopped,
                "Stream already stopped"
            );
            let accrued = StreamCoreState::accrued_since_last_update(stream, now);
            let new_streamed = stream.streamed.saturating_add(accrued).min(stream.deposited);
            let unstreamed = stream.deposited.saturating_sub(new_streamed);
            (stream.sender, stream.token, unstreamed, stream.deposited, new_streamed, stream.flow_rate)
        };
        let _ = deposited;

        let super_token_opt = StreamCoreState::super_token_for(state, &token);

        if let Some(super_token) = super_token_opt {
            // ---- Super Token path -----------------------------------------------
            // Reverse the ongoing flow so balances stop changing.
            if flow_rate > 0 {
                let receiver = state.streams.get(&stream_id).unwrap().receiver;
                let ok = call_super_token_update_flow(
                    super_token, sender, receiver, flow_rate, false,
                ).await;
                assert!(ok, "SuperToken update_flow (stop) failed");
            }
        } else {
            // ---- Legacy vault path -----------------------------------------------
            if unstreamed > 0 && vault != ActorId::zero() {
                let payload = encode_call(
                    "VaultService",
                    "ReleaseFromStream",
                    (sender, token, unstreamed, stream_id),
                );
                let ok = call_vault_checked(vault, payload).await;
                assert!(ok, "Vault release failed");
            }
        }

        // Commit stream state (same for both paths).
        let state = StreamCoreState::get();
        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");
        stream.streamed = streamed_after_settle;
        stream.last_update = now;
        stream.status = StreamStatus::Stopped;
        stream.flow_rate = 0;
        state.active_count = state.active_count.saturating_sub(1);
    }

    #[export]
    pub async fn pause_stream(&mut self, stream_id: u64) {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        let (sender, receiver, token, flow_rate) = {
            let stream = state.streams.get(&stream_id).expect("Stream not found");
            assert!(stream.sender == caller, "Only sender can pause stream");
            assert!(stream.status == StreamStatus::Active, "Stream is not active");
            (stream.sender, stream.receiver, stream.token, stream.flow_rate)
        };

        let super_token_opt = StreamCoreState::super_token_for(state, &token);

        if let Some(super_token) = super_token_opt {
            // Pause = stop the ongoing flow; receiver balance is frozen at current real-time value.
            if flow_rate > 0 {
                let ok = call_super_token_update_flow(
                    super_token, sender, receiver, flow_rate, false,
                ).await;
                assert!(ok, "SuperToken update_flow (pause) failed");
            }
        }
        // Legacy vault path: no vault action needed on pause.

        let state = StreamCoreState::get();
        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");
        StreamCoreState::settle(stream, now);
        stream.status = StreamStatus::Paused;
        state.active_count = state.active_count.saturating_sub(1);
    }

    #[export]
    pub async fn resume_stream(&mut self, stream_id: u64) {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        let (sender, receiver, token, flow_rate) = {
            let stream = state.streams.get(&stream_id).expect("Stream not found");
            assert!(stream.sender == caller, "Only sender can resume stream");
            assert!(
                stream.status == StreamStatus::Paused,
                "Stream is not paused"
            );
            (stream.sender, stream.receiver, stream.token, stream.flow_rate)
        };

        let super_token_opt = StreamCoreState::super_token_for(state, &token);

        if let Some(super_token) = super_token_opt {
            // Resume = restart the flow from now.
            if flow_rate > 0 {
                let ok = call_super_token_update_flow(
                    super_token, sender, receiver, flow_rate, true,
                ).await;
                assert!(ok, "SuperToken update_flow (resume) failed");
            }
        }
        // Legacy vault path: no vault action needed on resume.

        let state = StreamCoreState::get();
        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");
        stream.last_update = now;
        stream.status = StreamStatus::Active;
        state.active_count += 1;
    }

    #[export]
    pub async fn deposit(&mut self, stream_id: u64, amount: u128) {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let vault = state.config.token_vault;

        let (sender, token) = {
            let stream = state.streams.get(&stream_id).expect("Stream not found");
            assert!(stream.sender == caller, "Only sender can deposit");
            assert!(
                stream.status != StreamStatus::Stopped,
                "Cannot deposit to a stopped stream"
            );
            assert!(amount > 0, "Deposit amount must be > 0");
            (stream.sender, stream.token)
        };

        assert!(vault != ActorId::zero(), "Token vault not configured");

        // Ask vault to allocate additional amount to this stream. Vault's
        // `AllocateToStream` is additive for existing stream ids.
        let payload = encode_call(
            "VaultService",
            "AllocateToStream",
            (sender, token, amount, stream_id),
        );
        let ok = call_vault_checked(vault, payload).await;
        assert!(ok, "Vault allocate failed");

        // Commit updated deposited amount.
        let state = StreamCoreState::get();
        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");
        stream.deposited = stream.deposited.saturating_add(amount);
    }

    #[export]
    pub async fn withdraw(&mut self, stream_id: u64) -> u128 {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;
        let vault = state.config.token_vault;

        let (token, receiver, withdrawable, new_streamed) = {
            let stream = state.streams.get(&stream_id).expect("Stream not found");
            assert!(stream.receiver == caller, "Only receiver can withdraw");
            let accrued = StreamCoreState::accrued_since_last_update(stream, now);
            let mut new_streamed = stream.streamed.saturating_add(accrued);
            if new_streamed > stream.deposited {
                new_streamed = stream.deposited;
            }
            let withdrawable = new_streamed.saturating_sub(stream.withdrawn);
            (stream.token, stream.receiver, withdrawable, new_streamed)
        };
        assert!(withdrawable > 0, "Nothing to withdraw");

        let super_token_opt = StreamCoreState::super_token_for(state, &token);

        if super_token_opt.is_some() {
            // ---- Super Token path -----------------------------------------------
            // The receiver's super-token balance already reflects the streamed
            // amount in real-time via net_flow_rate. No cross-contract call
            // is needed for withdrawal — the receiver can unwrap() directly
            // from their super-token balance.
            // We still update stream accounting so history is accurate.
        } else {
            // ---- Legacy vault path -----------------------------------------------
            assert!(vault != ActorId::zero(), "Token vault not configured");
            let payload = encode_call(
                "VaultService",
                "TransferToReceiver",
                (token, receiver, withdrawable, stream_id),
            );
            let ok = call_vault_checked(vault, payload).await;
            assert!(ok, "Vault transfer failed");
        }

        // Commit stream accounting (same for both paths).
        let state = StreamCoreState::get();
        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");
        stream.streamed = new_streamed;
        stream.last_update = now;
        stream.withdrawn = stream.withdrawn.saturating_add(withdrawable);

        withdrawable
    }

    #[export]
    pub fn liquidate(&mut self, stream_id: u64) {
        let state = StreamCoreState::get();
        let now = exec::block_timestamp() / 1000;
        let min_buffer_seconds = state.config.min_buffer_seconds;

        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");

        assert!(
            StreamCoreState::should_liquidate(stream, now, min_buffer_seconds),
            "Stream is not eligible for liquidation"
        );

        StreamCoreState::settle(stream, now);
        stream.status = StreamStatus::Paused;
        state.active_count = state.active_count.saturating_sub(1);
    }

    // ---- Queries ----

    #[export]
    pub fn get_stream(&self, stream_id: u64) -> Option<Stream> {
        let state = StreamCoreState::get();
        state.streams.get(&stream_id).cloned()
    }

    #[export]
    pub fn get_withdrawable_balance(&self, stream_id: u64) -> u128 {
        let state = StreamCoreState::get();
        let now = exec::block_timestamp() / 1000;
        state
            .streams
            .get(&stream_id)
            .map(|s| StreamCoreState::withdrawable_balance(s, now))
            .unwrap_or(0)
    }

    #[export]
    pub fn get_remaining_buffer(&self, stream_id: u64) -> u128 {
        let state = StreamCoreState::get();
        let now = exec::block_timestamp() / 1000;
        state
            .streams
            .get(&stream_id)
            .map(|s| StreamCoreState::remaining_buffer(s, now))
            .unwrap_or(0)
    }

    #[export]
    pub fn get_sender_streams(&self, sender: ActorId) -> Vec<u64> {
        let state = StreamCoreState::get();
        state
            .sender_streams
            .get(&sender)
            .cloned()
            .unwrap_or_default()
    }

    #[export]
    pub fn get_receiver_streams(&self, receiver: ActorId) -> Vec<u64> {
        let state = StreamCoreState::get();
        state
            .receiver_streams
            .get(&receiver)
            .cloned()
            .unwrap_or_default()
    }

    #[export]
    pub fn total_streams(&self) -> u64 {
        let state = StreamCoreState::get();
        state.streams.len() as u64
    }

    #[export]
    pub fn active_streams(&self) -> u64 {
        let state = StreamCoreState::get();
        state.active_count
    }

    #[export]
    pub fn get_config(&self) -> Config {
        let state = StreamCoreState::get();
        state.config.clone()
    }

    #[export]
    pub fn set_token_vault(&mut self, vault: ActorId) {
        let state = StreamCoreState::get();
        assert!(msg::source() == state.config.admin, "Only admin can set token_vault");
        state.config.token_vault = vault;
    }

    /// Register a Super Token contract for a given underlying token.
    ///
    /// Once registered, any stream using `underlying_token` will route
    /// flow updates through `super_token_contract` instead of the vault.
    ///
    /// Pass `super_token_contract = ActorId::zero()` to de-register.
    #[export]
    pub fn register_super_token(
        &mut self,
        underlying_token: ActorId,
        super_token_contract: ActorId,
    ) {
        let state = StreamCoreState::get();
        assert!(msg::source() == state.config.admin, "Only admin can register super tokens");

        if super_token_contract == ActorId::zero() {
            if state.super_token_registry.remove(&underlying_token).is_some() {
                state.config.super_token_count =
                    state.config.super_token_count.saturating_sub(1);
            }
        } else {
            let is_new = !state.super_token_registry.contains_key(&underlying_token);
            state.super_token_registry.insert(underlying_token, super_token_contract);
            if is_new {
                state.config.super_token_count += 1;
            }
        }
    }

    /// Look up the registered Super Token contract for an underlying token.
    #[export]
    pub fn get_super_token(&self, underlying_token: ActorId) -> Option<ActorId> {
        let state = StreamCoreState::get();
        state.super_token_registry.get(&underlying_token).copied()
    }

    /// Update the minimum buffer seconds (admin only).
    #[export]
    pub fn set_min_buffer_seconds(&mut self, seconds: u64) {
        let state = StreamCoreState::get();
        assert!(msg::source() == state.config.admin, "Only admin can set min_buffer_seconds");
        assert!(seconds > 0, "Min buffer seconds must be > 0");
        state.config.min_buffer_seconds = seconds;
    }
}

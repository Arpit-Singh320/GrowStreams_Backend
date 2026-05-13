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
}

impl StreamCoreState {
    fn new(admin: ActorId, min_buffer_seconds: u64) -> Self {
        Self {
            config: Config {
                admin,
                min_buffer_seconds,
                next_stream_id: 1,
                token_vault: ActorId::zero(),
            },
            streams: BTreeMap::new(),
            sender_streams: BTreeMap::new(),
            receiver_streams: BTreeMap::new(),
            active_count: 0,
        }
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

        // Reserve a stream id locally without committing state yet.
        let id = state.config.next_stream_id;
        let vault = state.config.token_vault;
        assert!(vault != ActorId::zero(), "Token vault not configured");

        // Call vault.AllocateToStream and wait for confirmation BEFORE
        // committing stream-core state. If the vault rejects (e.g. insufficient
        // balance), this function panics and no state mutation persists.
        let payload = encode_call(
            "VaultService",
            "AllocateToStream",
            (sender, token, initial_deposit, id),
        );
        let ok = call_vault_checked(vault, payload).await;
        assert!(ok, "Vault allocate failed");

        // Vault has committed the allocation — now commit stream state.
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
    pub fn update_stream(&mut self, stream_id: u64, new_flow_rate: u128) {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");

        assert!(stream.sender == caller, "Only sender can update stream");
        assert!(
            stream.status != StreamStatus::Stopped,
            "Cannot update a stopped stream"
        );
        assert!(new_flow_rate > 0, "Flow rate must be > 0");

        StreamCoreState::settle(stream, now);
        stream.flow_rate = new_flow_rate;
    }

    #[export]
    pub async fn stop_stream(&mut self, stream_id: u64) {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;
        let vault = state.config.token_vault;

        // Read-only snapshot to compute release amount, then await vault.
        let (sender, token, unstreamed, deposited, streamed_after_settle) = {
            let stream = state.streams.get(&stream_id).expect("Stream not found");
            assert!(stream.sender == caller, "Only sender can stop stream");
            assert!(
                stream.status != StreamStatus::Stopped,
                "Stream already stopped"
            );
            let accrued = StreamCoreState::accrued_since_last_update(stream, now);
            let new_streamed = stream.streamed.saturating_add(accrued).min(stream.deposited);
            let unstreamed = stream.deposited.saturating_sub(new_streamed);
            (stream.sender, stream.token, unstreamed, stream.deposited, new_streamed)
        };
        let _ = deposited;

        // If there is unstreamed balance, ask vault to release it back to sender.
        if unstreamed > 0 && vault != ActorId::zero() {
            let payload = encode_call(
                "VaultService",
                "ReleaseFromStream",
                (sender, token, unstreamed, stream_id),
            );
            let ok = call_vault_checked(vault, payload).await;
            assert!(ok, "Vault release failed");
        }

        // Now commit stream state.
        let state = StreamCoreState::get();
        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");
        stream.streamed = streamed_after_settle;
        stream.last_update = now;
        stream.status = StreamStatus::Stopped;
        stream.flow_rate = 0;
        state.active_count = state.active_count.saturating_sub(1);
    }

    #[export]
    pub fn pause_stream(&mut self, stream_id: u64) {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");

        assert!(stream.sender == caller, "Only sender can pause stream");
        assert!(stream.status == StreamStatus::Active, "Stream is not active");

        StreamCoreState::settle(stream, now);
        stream.status = StreamStatus::Paused;
        state.active_count = state.active_count.saturating_sub(1);
    }

    #[export]
    pub fn resume_stream(&mut self, stream_id: u64) {
        let state = StreamCoreState::get();
        let caller = msg::source();
        let now = exec::block_timestamp() / 1000;

        let stream = state.streams.get_mut(&stream_id).expect("Stream not found");

        assert!(stream.sender == caller, "Only sender can resume stream");
        assert!(
            stream.status == StreamStatus::Paused,
            "Stream is not paused"
        );

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

        // Compute withdrawable from a read-only snapshot of the stream.
        // State mutation happens ONLY after the vault confirms the transfer.
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
        assert!(vault != ActorId::zero(), "Token vault not configured");

        let payload = encode_call(
            "VaultService",
            "TransferToReceiver",
            (token, receiver, withdrawable, stream_id),
        );
        let ok = call_vault_checked(vault, payload).await;
        assert!(ok, "Vault transfer failed");

        // Vault transfer succeeded (tokens actually moved to receiver). Now
        // commit stream accounting.
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
}

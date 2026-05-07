//! GrowStreams stream-core for Vara.eth (ethexe runtime)
//!
//! Key differences from the Vara-native version:
//!
//! 1. NO cross-program async calls — ethexe forbids `wait`-based blocking and
//!    `send_bytes_for_reply(...).await` patterns.  Token custody is handled by
//!    the companion Solidity contract (StreamEscrow.sol) on the Ethereum side.
//!    This program is a pure stream-state registry.
//!
//! 2. sails-rs with `ethexe` feature (0.10.1) — NOT the Vara-native 0.6 build.
//!
//! 3. `static mut` replaced with `RefCell` — required for ethexe safety.
//!
//! 4. Public types: `[u8; 32]` for account IDs (bytes32 in Solidity).
//!    `Option<T>` is not SolValue — queries return concrete types with an
//!    `exists` bool field instead.
//!
//! 5. Constructor cannot be named `new` — reserved keyword in Solidity.
//!
//! skill: vara-eth-contract-writer

#![no_std]

// ethexe does NOT have gstd/gcore Gear-native syscalls.
// Timestamps and caller identity are passed as explicit parameters from Solidity.
use sails_rs::{cell::RefCell, collections::BTreeMap, prelude::*};

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
    pub sender: [u8; 32],
    pub receiver: [u8; 32],
    pub flow_rate: u128,
    pub start_time: u64,
    pub last_update: u64,
    pub deposited: u128,
    pub withdrawn: u128,
    pub streamed: u128,
    pub status: StreamStatus,
}

/// Full stream view — for SCALE/Sails clients only (not Solidity-ABI-exposed).
/// Solidity callers use the individual primitive getter methods instead.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct StreamView {
    pub exists: bool,
    pub id: StreamId,
    pub sender: [u8; 32],
    pub receiver: [u8; 32],
    pub flow_rate: u128,
    pub deposited: u128,
    pub withdrawn: u128,
    pub streamed: u128,
    pub withdrawable: u128,
    pub remaining_buffer: u128,
    pub status: StreamStatus,
}

#[derive(Encode, Decode, TypeInfo)]
#[event]
pub enum StreamEvent {
    StreamCreated { id: StreamId, sender: [u8; 32], receiver: [u8; 32], flow_rate: u128, deposit: u128 },
    StreamUpdated { id: StreamId, new_flow_rate: u128 },
    StreamPaused { id: StreamId },
    StreamResumed { id: StreamId },
    StreamStopped { id: StreamId, unstreamed: u128 },
    DepositRecorded { id: StreamId, amount: u128, new_deposited: u128 },
    WithdrawRecorded { id: StreamId, amount: u128 },
    StreamLiquidated { id: StreamId },
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct StreamCoreEthState {
    admin: [u8; 32],
    min_buffer_seconds: u64,
    next_stream_id: StreamId,
    streams: BTreeMap<StreamId, Stream>,
    sender_streams: BTreeMap<[u8; 32], Vec<StreamId>>,
    receiver_streams: BTreeMap<[u8; 32], Vec<StreamId>>,
    active_count: u64,
}

impl StreamCoreEthState {
    fn new(admin: [u8; 32], min_buffer_seconds: u64) -> Self {
        Self {
            admin,
            min_buffer_seconds,
            next_stream_id: 1,
            streams: BTreeMap::new(),
            sender_streams: BTreeMap::new(),
            receiver_streams: BTreeMap::new(),
            active_count: 0,
        }
    }

    fn accrued(stream: &Stream, now: u64) -> u128 {
        if stream.status != StreamStatus::Active || now <= stream.last_update {
            return 0;
        }
        let elapsed = (now - stream.last_update) as u128;
        stream.flow_rate.saturating_mul(elapsed)
    }

    fn total_streamed(stream: &Stream, now: u64) -> u128 {
        stream.streamed.saturating_add(Self::accrued(stream, now))
    }

    fn withdrawable(stream: &Stream, now: u64) -> u128 {
        let total = Self::total_streamed(stream, now).min(stream.deposited);
        total.saturating_sub(stream.withdrawn)
    }

    fn remaining_buffer(stream: &Stream, now: u64) -> u128 {
        let total = Self::total_streamed(stream, now);
        stream.deposited.saturating_sub(total)
    }

    fn settle(stream: &mut Stream, now: u64) {
        if stream.status == StreamStatus::Active {
            let accrued = Self::accrued(stream, now);
            stream.streamed = stream.streamed.saturating_add(accrued).min(stream.deposited);
            stream.last_update = now;
        }
    }

    #[allow(dead_code)]
    fn to_view(stream: &Stream, now: u64) -> StreamView {
        StreamView {
            exists: true,
            id: stream.id,
            sender: stream.sender,
            receiver: stream.receiver,
            flow_rate: stream.flow_rate,
            deposited: stream.deposited,
            withdrawn: stream.withdrawn,
            streamed: Self::total_streamed(stream, now).min(stream.deposited),
            withdrawable: Self::withdrawable(stream, now),
            remaining_buffer: Self::remaining_buffer(stream, now),
            status: stream.status.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

pub struct StreamCoreEthProgram(RefCell<StreamCoreEthState>);

#[program]
impl StreamCoreEthProgram {
    /// Constructor — cannot be named `new` (reserved Solidity keyword).
    /// `admin` is the Mirror address of StreamEscrow.sol (bytes32-padded EVM addr).
    pub fn initialize(admin: [u8; 32], min_buffer_seconds: u64) -> Self {
        Self(RefCell::new(StreamCoreEthState::new(admin, min_buffer_seconds)))
    }

    pub fn stream_service(&self) -> StreamService<'_> {
        StreamService(&self.0)
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

pub struct StreamService<'a>(&'a RefCell<StreamCoreEthState>);

#[service(events = StreamEvent)]
impl<'a> StreamService<'a> {
    // ---- Commands ----

    /// Register a new stream. Token escrow is handled by StreamEscrow.sol on
    /// the Ethereum side — this call only records the stream state.
    /// `caller` = msg.sender as bytes32, `now_secs` = block.timestamp (from Solidity).
    #[export]
    pub fn create_stream(
        &mut self,
        caller: [u8; 32],
        sender: [u8; 32],
        receiver: [u8; 32],
        flow_rate: u128,
        initial_deposit: u128,
        now_secs: u64,
    ) -> StreamId {
        let mut state = self.0.borrow_mut();

        assert!(
            caller == state.admin || caller == sender,
            "Unauthorized: only admin or sender can create a stream"
        );
        assert!(flow_rate > 0, "flow_rate must be > 0");
        assert!(sender != receiver, "sender and receiver must differ");

        let min_deposit = flow_rate.saturating_mul(state.min_buffer_seconds as u128);
        assert!(initial_deposit >= min_deposit, "initial_deposit must cover min buffer");

        let now = now_secs;
        let id = state.next_stream_id;
        state.next_stream_id += 1;

        let stream = Stream {
            id,
            sender,
            receiver,
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

        self.emit_event(StreamEvent::StreamCreated {
            id,
            sender,
            receiver,
            flow_rate,
            deposit: initial_deposit,
        })
        .expect("emit StreamCreated");

        id
    }

    #[export]
    pub fn update_stream(&mut self, caller: [u8; 32], stream_id: StreamId, new_flow_rate: u128, now_secs: u64) {
        let mut state = self.0.borrow_mut();
        let now = now_secs;
        let admin = state.admin;

        let stream = state.streams.get_mut(&stream_id).expect("stream not found");
        assert!(
            caller == admin || caller == stream.sender,
            "Only admin or sender can update stream"
        );
        assert!(stream.status != StreamStatus::Stopped, "Cannot update stopped stream");
        assert!(new_flow_rate > 0, "flow_rate must be > 0");

        StreamCoreEthState::settle(stream, now);
        stream.flow_rate = new_flow_rate;

        self.emit_event(StreamEvent::StreamUpdated { id: stream_id, new_flow_rate })
            .expect("emit StreamUpdated");
    }

    #[export]
    pub fn stop_stream(&mut self, caller: [u8; 32], stream_id: StreamId, now_secs: u64) -> u128 {
        let mut state = self.0.borrow_mut();
        let now = now_secs;
        let admin = state.admin;

        let stream = state.streams.get_mut(&stream_id).expect("stream not found");
        assert!(
            caller == admin || caller == stream.sender,
            "Only admin or sender can stop stream"
        );
        assert!(stream.status != StreamStatus::Stopped, "Stream already stopped");

        StreamCoreEthState::settle(stream, now);
        let unstreamed = stream.deposited.saturating_sub(stream.streamed);
        stream.status = StreamStatus::Stopped;
        stream.flow_rate = 0;
        state.active_count = state.active_count.saturating_sub(1);

        self.emit_event(StreamEvent::StreamStopped { id: stream_id, unstreamed })
            .expect("emit StreamStopped");

        unstreamed
    }

    #[export]
    pub fn pause_stream(&mut self, caller: [u8; 32], stream_id: StreamId, now_secs: u64) {
        let mut state = self.0.borrow_mut();
        let now = now_secs;
        let admin = state.admin;

        let stream = state.streams.get_mut(&stream_id).expect("stream not found");
        assert!(
            caller == admin || caller == stream.sender,
            "Only admin or sender can pause"
        );
        assert!(stream.status == StreamStatus::Active, "Stream is not active");

        StreamCoreEthState::settle(stream, now);
        stream.status = StreamStatus::Paused;
        state.active_count = state.active_count.saturating_sub(1);

        self.emit_event(StreamEvent::StreamPaused { id: stream_id })
            .expect("emit StreamPaused");
    }

    #[export]
    pub fn resume_stream(&mut self, caller: [u8; 32], stream_id: StreamId, now_secs: u64) {
        let mut state = self.0.borrow_mut();
        let now = now_secs;
        let admin = state.admin;

        let stream = state.streams.get_mut(&stream_id).expect("stream not found");
        assert!(
            caller == admin || caller == stream.sender,
            "Only admin or sender can resume"
        );
        assert!(stream.status == StreamStatus::Paused, "Stream is not paused");

        stream.last_update = now;
        stream.status = StreamStatus::Active;
        state.active_count += 1;

        self.emit_event(StreamEvent::StreamResumed { id: stream_id })
            .expect("emit StreamResumed");
    }

    /// Record a deposit from the Solidity side — called after ERC20 is escrowed.
    #[export]
    pub fn record_deposit(&mut self, caller: [u8; 32], stream_id: StreamId, amount: u128) {
        let mut state = self.0.borrow_mut();
        let admin = state.admin;

        let stream = state.streams.get_mut(&stream_id).expect("stream not found");
        assert!(
            caller == admin || caller == stream.sender,
            "Only admin or sender can record deposit"
        );
        assert!(stream.status != StreamStatus::Stopped, "Cannot deposit to stopped stream");
        assert!(amount > 0, "Deposit amount must be > 0");

        let new_deposited = stream.deposited.saturating_add(amount);
        stream.deposited = new_deposited;

        self.emit_event(StreamEvent::DepositRecorded { id: stream_id, amount, new_deposited })
            .expect("emit DepositRecorded");
    }

    /// Record a withdrawal from the Solidity side — called after ERC20 is released.
    #[export]
    pub fn record_withdraw(&mut self, caller: [u8; 32], stream_id: StreamId, amount: u128, now_secs: u64) {
        let mut state = self.0.borrow_mut();
        let now = now_secs;
        let admin = state.admin;

        let stream = state.streams.get_mut(&stream_id).expect("stream not found");
        assert!(
            caller == admin || caller == stream.receiver,
            "Only admin or receiver can record withdraw"
        );

        StreamCoreEthState::settle(stream, now);
        let withdrawable = StreamCoreEthState::withdrawable(stream, now);
        assert!(amount <= withdrawable, "Amount exceeds withdrawable balance");

        stream.withdrawn = stream.withdrawn.saturating_add(amount);

        self.emit_event(StreamEvent::WithdrawRecorded { id: stream_id, amount })
            .expect("emit WithdrawRecorded");
    }

    #[export]
    pub fn liquidate(&mut self, stream_id: StreamId, now_secs: u64) {
        let mut state = self.0.borrow_mut();
        let now = now_secs;
        // Read min_buffer_seconds before taking a mutable borrow on streams
        let min_buffer_seconds = state.min_buffer_seconds;

        let stream = state.streams.get_mut(&stream_id).expect("stream not found");
        assert!(stream.status == StreamStatus::Active, "Stream not active");
        assert!(stream.flow_rate > 0, "Stream has zero flow_rate");

        let remaining = StreamCoreEthState::remaining_buffer(stream, now);
        let min_buffer = stream.flow_rate.saturating_mul(min_buffer_seconds as u128);
        assert!(remaining < min_buffer, "Stream is not eligible for liquidation");

        StreamCoreEthState::settle(stream, now);
        stream.status = StreamStatus::Paused;
        state.active_count = state.active_count.saturating_sub(1);

        self.emit_event(StreamEvent::StreamLiquidated { id: stream_id })
            .expect("emit StreamLiquidated");
    }

    // ---- Queries (all return primitive SolValue types) ----
    //
    // Custom structs are not SolValue on the ethexe Solidity ABI path.
    // Each field is exposed as a separate getter; Sails clients can call any.

    /// True if the stream exists.
    #[export]
    pub fn stream_exists(&self, stream_id: StreamId) -> bool {
        self.0.borrow().streams.contains_key(&stream_id)
    }

    /// Flow rate in token-units per second. Returns 0 if stream not found.
    #[export]
    pub fn get_flow_rate(&self, stream_id: StreamId) -> u128 {
        self.0.borrow().streams.get(&stream_id).map(|s| s.flow_rate).unwrap_or(0)
    }

    /// Total tokens deposited into the stream.
    #[export]
    pub fn get_deposited(&self, stream_id: StreamId) -> u128 {
        self.0.borrow().streams.get(&stream_id).map(|s| s.deposited).unwrap_or(0)
    }

    /// Total tokens already withdrawn by receiver.
    #[export]
    pub fn get_withdrawn(&self, stream_id: StreamId) -> u128 {
        self.0.borrow().streams.get(&stream_id).map(|s| s.withdrawn).unwrap_or(0)
    }

    /// Accrued + settled tokens streamed so far (capped at deposited).
    /// Pass current block.timestamp as `now_secs`.
    #[export]
    pub fn get_streamed(&self, stream_id: StreamId, now_secs: u64) -> u128 {
        let state = self.0.borrow();
        state
            .streams
            .get(&stream_id)
            .map(|s| StreamCoreEthState::total_streamed(s, now_secs).min(s.deposited))
            .unwrap_or(0)
    }

    /// Amount the receiver can currently withdraw.
    #[export]
    pub fn withdrawable_balance(&self, stream_id: StreamId, now_secs: u64) -> u128 {
        let state = self.0.borrow();
        state
            .streams
            .get(&stream_id)
            .map(|s| StreamCoreEthState::withdrawable(s, now_secs))
            .unwrap_or(0)
    }

    /// Remaining deposit buffer before stream is eligible for liquidation.
    #[export]
    pub fn remaining_buffer(&self, stream_id: StreamId, now_secs: u64) -> u128 {
        let state = self.0.borrow();
        state
            .streams
            .get(&stream_id)
            .map(|s| StreamCoreEthState::remaining_buffer(s, now_secs))
            .unwrap_or(0)
    }

    /// Stream sender as bytes32.
    #[export]
    pub fn get_sender(&self, stream_id: StreamId) -> [u8; 32] {
        self.0.borrow().streams.get(&stream_id).map(|s| s.sender).unwrap_or([0u8; 32])
    }

    /// Stream receiver as bytes32.
    #[export]
    pub fn get_receiver(&self, stream_id: StreamId) -> [u8; 32] {
        self.0.borrow().streams.get(&stream_id).map(|s| s.receiver).unwrap_or([0u8; 32])
    }

    /// Status: 0 = Active, 1 = Paused, 2 = Stopped. Returns 2 if not found.
    #[export]
    pub fn get_status(&self, stream_id: StreamId) -> u64 {
        self.0.borrow().streams.get(&stream_id).map(|s| match s.status {
            StreamStatus::Active  => 0u64,
            StreamStatus::Paused  => 1u64,
            StreamStatus::Stopped => 2u64,
        }).unwrap_or(2)
    }

    #[export]
    pub fn get_sender_streams(&self, sender: [u8; 32]) -> Vec<StreamId> {
        let state = self.0.borrow();
        state.sender_streams.get(&sender).cloned().unwrap_or_default()
    }

    #[export]
    pub fn get_receiver_streams(&self, receiver: [u8; 32]) -> Vec<StreamId> {
        let state = self.0.borrow();
        state.receiver_streams.get(&receiver).cloned().unwrap_or_default()
    }

    #[export]
    pub fn total_streams(&self) -> u64 {
        self.0.borrow().streams.len() as u64
    }

    #[export]
    pub fn active_streams(&self) -> u64 {
        self.0.borrow().active_count
    }
}

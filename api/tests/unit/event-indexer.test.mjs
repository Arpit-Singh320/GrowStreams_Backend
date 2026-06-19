// Unit tests for the event-indexer pure mapping logic.
// These exercise the exact transforms that turn a decoded on-chain event
// payload (snake_case fields, as produced by sails-js .toJSON()) into the
// argument object passed to logStreamEvent()/logVaultEvent().
//
// Run with:  node --test tests/unit/event-indexer.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  actorIdToHex,
  bigIntToString,
  buildStreamEventLog,
  buildVaultEventLog,
} from '../../src/services/event-indexer.mjs';

// ─── actorIdToHex ────────────────────────────────────────────

test('actorIdToHex passes through 0x hex strings', () => {
  const hex = '0x' + 'ab'.repeat(32);
  assert.equal(actorIdToHex(hex), hex);
});

test('actorIdToHex encodes a byte array to 0x hex', () => {
  assert.equal(actorIdToHex([0xde, 0xad, 0xbe, 0xef]), '0xdeadbeef');
});

test('actorIdToHex encodes a {value: bytes} wrapper', () => {
  assert.equal(actorIdToHex({ value: [0x01, 0x02] }), '0x0102');
});

test('actorIdToHex returns null for nullish input', () => {
  assert.equal(actorIdToHex(null), null);
  assert.equal(actorIdToHex(undefined), null);
});

// ─── bigIntToString ──────────────────────────────────────────

test('bigIntToString handles bigint, number, and decimal string', () => {
  assert.equal(bigIntToString(123n), '123');
  assert.equal(bigIntToString(456), '456');
  assert.equal(bigIntToString('789'), '789');
});

test('bigIntToString converts hex strings to decimal', () => {
  assert.equal(bigIntToString('0xff'), '255');
  assert.equal(bigIntToString('0x3600000'), String(0x3600000));
});

test('bigIntToString defaults nullish to "0"', () => {
  assert.equal(bigIntToString(null), '0');
  assert.equal(bigIntToString(undefined), '0');
});

// ─── buildStreamEventLog ─────────────────────────────────────

test('StreamCreated maps to a created event with sender/receiver/flow_rate', () => {
  const token = '0x' + '11'.repeat(32);
  const out = buildStreamEventLog('StreamCreated', {
    id: 7n,
    sender: '0x' + 'aa'.repeat(32),
    receiver: '0x' + 'bb'.repeat(32),
    token,
    flow_rate: 1000n,
    start_time: 1700000000n,
    initial_deposit: 3600000n,
  }, { symbol: 'USDC', decimals: 6 });

  assert.equal(out.eventType, 'created');
  assert.equal(out.streamId, '7');
  assert.equal(out.sender, '0x' + 'aa'.repeat(32));
  assert.equal(out.receiver, '0x' + 'bb'.repeat(32));
  assert.equal(out.tokenAddress, token);
  assert.equal(out.tokenSymbol, 'USDC');
  assert.equal(out.flowRate, '1000');
  assert.equal(out.amount, '3600000');
  assert.equal(out.metadata.source, 'on_chain_event');
  assert.equal(out.metadata.startTime, '1700000000');
});

test('Withdrawn maps to a withdraw event and honors caller-supplied tokenAddress', () => {
  // Withdrawn carries no token field — the handler resolves it via GetStream
  // and passes it in through `extra.tokenAddress`.
  const resolvedToken = '0x' + '22'.repeat(32);
  const out = buildStreamEventLog('Withdrawn', {
    id: 3n,
    receiver: '0x' + 'cc'.repeat(32),
    amount: 500n,
    timestamp: 1700000123n,
  }, { symbol: 'USDT', decimals: 6 }, { tokenAddress: resolvedToken });

  assert.equal(out.eventType, 'withdraw');
  assert.equal(out.streamId, '3');
  assert.equal(out.amount, '500');
  assert.equal(out.tokenAddress, resolvedToken);
  assert.equal(out.tokenSymbol, 'USDT');
  assert.equal(out.metadata.timestamp, '1700000123');
});

test('StreamStopped records total_streamed as amount', () => {
  const out = buildStreamEventLog('StreamStopped', {
    id: 9n,
    stopped_at: 1700000999n,
    sender_refund: 42n,
    total_streamed: 1234n,
  });
  assert.equal(out.eventType, 'stopped');
  assert.equal(out.amount, '1234');
  assert.equal(out.metadata.senderRefund, '42');
});

test('buildStreamEventLog returns null for unknown / missing data', () => {
  assert.equal(buildStreamEventLog('NotARealEvent', { id: 1n }), null);
  assert.equal(buildStreamEventLog('StreamCreated', null), null);
});

// ─── buildVaultEventLog (the previously-broken names/fields) ──

test('TokensDeposited (not "Deposited") maps owner->wallet as a deposit', () => {
  const owner = '0x' + 'dd'.repeat(32);
  const token = '0x' + 'ee'.repeat(32);
  const out = buildVaultEventLog('TokensDeposited', {
    owner,
    token,
    amount: 1000000n,      // 1.0 at 6 decimals
    new_balance: 5000000n,
  }, { symbol: 'USDC', decimals: 6 });

  assert.equal(out.eventType, 'deposit');
  assert.equal(out.wallet, owner);           // owner -> wallet
  assert.equal(out.tokenAddress, token);
  assert.equal(out.tokenSymbol, 'USDC');
  assert.equal(out.amount, '1000000');
  assert.equal(out.amountDisplay, '1');       // 1000000 / 10^6
  assert.equal(out.metadata.newBalance, '5000000');
});

test('TokensWithdrawn (not "Withdrawn") maps owner->wallet as a withdraw', () => {
  const owner = '0x' + 'ff'.repeat(32);
  const out = buildVaultEventLog('TokensWithdrawn', {
    owner,
    token: '0x' + 'ab'.repeat(32),
    amount: 2500000n,      // 2.5 at 6 decimals
    remaining: 0n,
  }, { symbol: 'USDT', decimals: 6 });

  assert.equal(out.eventType, 'withdraw');
  assert.equal(out.wallet, owner);
  assert.equal(out.amountDisplay, '2.5');
  assert.equal(out.metadata.remaining, '0');
});

test('the old (wrong) vault event names are NOT handled', () => {
  // Regression guard: prior stub handled 'Deposited'/'Withdrawn' for the vault,
  // which never matched the IDL (TokensDeposited/TokensWithdrawn).
  assert.equal(buildVaultEventLog('Deposited', { owner: '0x00', amount: 1n }), null);
  assert.equal(buildVaultEventLog('Withdrawn', { owner: '0x00', amount: 1n }), null);
});

test('buildVaultEventLog defaults to 18 decimals when token unknown', () => {
  const out = buildVaultEventLog('TokensDeposited', {
    owner: '0x' + '01'.repeat(32),
    token: '0x' + '02'.repeat(32),
    amount: 1000000000000000000n, // 1.0 at 18 decimals
    new_balance: 0n,
  }, null);
  assert.equal(out.tokenSymbol, null);
  assert.equal(out.amountDisplay, '1');
});

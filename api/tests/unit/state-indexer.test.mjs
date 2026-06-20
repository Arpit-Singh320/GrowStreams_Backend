import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStreamStatus,
  actorIdToHex,
  liveStreamed,
  buildStreamStateRow,
} from '../../src/services/state-indexer.mjs';

test('parseStreamStatus handles string, enum-object, and nullish', () => {
  assert.equal(parseStreamStatus('Active'), 'Active');
  assert.equal(parseStreamStatus({ Paused: null }), 'Paused');
  assert.equal(parseStreamStatus(null), 'unknown');
});

test('actorIdToHex passes through 0x and lowercases', () => {
  assert.equal(actorIdToHex('0xABCD'), '0xabcd');
  assert.equal(actorIdToHex(null), null);
});

test('liveStreamed: non-active returns stored (capped at deposited)', () => {
  const v = liveStreamed(
    { streamed: '100', deposited: '200', flowRate: '10', lastUpdate: '0', status: 'Stopped' },
    1000n,
  );
  assert.equal(v, 100n);
});

test('liveStreamed: non-active stored above deposited is capped', () => {
  const v = liveStreamed(
    { streamed: '300', deposited: '200', flowRate: '10', lastUpdate: '0', status: 'Paused' },
    1000n,
  );
  assert.equal(v, 200n);
});

test('liveStreamed: active accrues flow_rate * elapsed', () => {
  // stored 100 + flow 10 * (1000 - 900) = 100 + 1000 = 1100, capped at 5000
  const v = liveStreamed(
    { streamed: '100', deposited: '5000', flowRate: '10', lastUpdate: '900', status: 'Active' },
    1000n,
  );
  assert.equal(v, 1100n);
});

test('liveStreamed: active accrual capped at deposited', () => {
  // stored 0 + flow 10 * 100000 huge -> capped at deposited 50
  const v = liveStreamed(
    { streamed: '0', deposited: '50', flowRate: '10', lastUpdate: '0', status: 'Active' },
    100000n,
  );
  assert.equal(v, 50n);
});

test('liveStreamed: active but now <= last_update returns stored', () => {
  const v = liveStreamed(
    { streamed: '100', deposited: '5000', flowRate: '10', lastUpdate: '2000', status: 'Active' },
    1000n,
  );
  assert.equal(v, 100n);
});

test('buildStreamStateRow maps fields and computes live streamed + ISO timestamps', () => {
  const row = buildStreamStateRow(7, {
    sender: '0xAA',
    receiver: '0xBB',
    token: '0xCC',
    flow_rate: '10',
    deposited: '5000',
    withdrawn: '0',
    streamed: '100',
    start_time: '1781729943',
    last_update: '1781729943',
    status: 'Active',
  }, 1781729943n /* now == last_update -> no accrual */);

  assert.equal(row.stream_id, 7);
  assert.equal(row.sender, '0xaa');
  assert.equal(row.receiver, '0xbb');
  assert.equal(row.status, 'Active');
  assert.equal(row.streamed, '100'); // now == last_update so no accrual
  assert.equal(row.start_time, new Date(1781729943 * 1000).toISOString());
});

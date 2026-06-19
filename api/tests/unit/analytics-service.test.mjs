// Unit tests for the analytics-service pure helpers:
// clampInt (query-param bounding), roundNumber (USD rounding),
// toNumberValue (raw->number), and bucketVolume (24h/7d/30d windowing).
//
// Run with:  node --test tests/unit/analytics-service.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clampInt,
  roundNumber,
  toNumberValue,
  bucketVolume,
} from '../../src/services/analytics-service.mjs';

// ─── clampInt ────────────────────────────────────────────────

test('clampInt returns fallback for non-numeric input', () => {
  assert.equal(clampInt(undefined, 1, 365, 30), 30);
  assert.equal(clampInt('abc', 1, 365, 30), 30);
  assert.equal(clampInt(null, 1, 365, 30), 30);
});

test('clampInt clamps to [min, max]', () => {
  assert.equal(clampInt('0', 1, 365, 30), 1);     // below min
  assert.equal(clampInt('9999', 1, 365, 30), 365); // above max
  assert.equal(clampInt('45', 1, 365, 30), 45);    // in range
});

test('clampInt parses leading integer from strings', () => {
  assert.equal(clampInt('30', 1, 365, 30), 30);
});

// ─── roundNumber ─────────────────────────────────────────────

test('roundNumber rounds to 6 decimals by default', () => {
  assert.equal(roundNumber(1.23456789), 1.234568);
  assert.equal(roundNumber(100), 100);
  assert.equal(roundNumber(0), 0);
});

test('roundNumber respects custom precision', () => {
  assert.equal(roundNumber(1.2345, 2), 1.23);
});

// ─── toNumberValue ───────────────────────────────────────────

test('toNumberValue parses numeric strings, defaults bad input to 0', () => {
  assert.equal(toNumberValue('123.45'), 123.45);
  assert.equal(toNumberValue(''), 0);
  assert.equal(toNumberValue(null), 0);
  assert.equal(toNumberValue('not-a-number'), 0);
});

// ─── bucketVolume ────────────────────────────────────────────

function freshVolume() {
  return { last24hUsd: 0, last7dUsd: 0, last30dUsd: 0 };
}

test('bucketVolume: an event 1h ago counts in all three windows', () => {
  const now = 1_000_000_000_000;
  const windows = {
    last24h: now - 24 * 3600 * 1000,
    last7d: now - 7 * 24 * 3600 * 1000,
    last30d: now - 30 * 24 * 3600 * 1000,
  };
  const v = freshVolume();
  bucketVolume(windows, now - 3600 * 1000, 100, v);
  assert.deepEqual(v, { last24hUsd: 100, last7dUsd: 100, last30dUsd: 100 });
});

test('bucketVolume: an event 3 days ago counts in 7d and 30d only', () => {
  const now = 1_000_000_000_000;
  const windows = {
    last24h: now - 24 * 3600 * 1000,
    last7d: now - 7 * 24 * 3600 * 1000,
    last30d: now - 30 * 24 * 3600 * 1000,
  };
  const v = freshVolume();
  bucketVolume(windows, now - 3 * 24 * 3600 * 1000, 50, v);
  assert.deepEqual(v, { last24hUsd: 0, last7dUsd: 50, last30dUsd: 50 });
});

test('bucketVolume: an event 20 days ago counts in 30d only', () => {
  const now = 1_000_000_000_000;
  const windows = {
    last24h: now - 24 * 3600 * 1000,
    last7d: now - 7 * 24 * 3600 * 1000,
    last30d: now - 30 * 24 * 3600 * 1000,
  };
  const v = freshVolume();
  bucketVolume(windows, now - 20 * 24 * 3600 * 1000, 75, v);
  assert.deepEqual(v, { last24hUsd: 0, last7dUsd: 0, last30dUsd: 75 });
});

test('bucketVolume accumulates multiple events additively', () => {
  const now = 1_000_000_000_000;
  const windows = {
    last24h: now - 24 * 3600 * 1000,
    last7d: now - 7 * 24 * 3600 * 1000,
    last30d: now - 30 * 24 * 3600 * 1000,
  };
  const v = freshVolume();
  bucketVolume(windows, now - 3600 * 1000, 100, v);       // all windows
  bucketVolume(windows, now - 2 * 24 * 3600 * 1000, 30, v); // 7d + 30d
  assert.equal(v.last24hUsd, 100);
  assert.equal(v.last7dUsd, 130);
  assert.equal(v.last30dUsd, 130);
});

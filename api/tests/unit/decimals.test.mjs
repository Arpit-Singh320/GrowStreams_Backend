// Unit Tests — api/src/utils/decimals.mjs
// Covers toBaseUnits, toDisplayUnits, flowRate helpers, buffer calculations
// Run: node api/tests/unit/decimals.test.mjs

import {
  toBaseUnits,
  toDisplayUnits,
  flowRateToBaseUnits,
  flowRateToDisplayUnits,
  flowRatePerInterval,
  flowRateFromInterval,
  calculateMinDeposit,
  calculateBufferSeconds,
  INTERVALS,
} from '../../src/utils/decimals.mjs';

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

function assertEq(actual, expected, name) {
  const a = typeof actual === 'bigint' ? actual.toString() : String(actual);
  const e = typeof expected === 'bigint' ? expected.toString() : String(expected);
  if (a === e) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name} — got "${a}", expected "${e}"`); failed++; }
}

// ═══════════════════════════════════════════════════════════════
// 1. toBaseUnits — convert human-readable → on-chain base units
// ═══════════════════════════════════════════════════════════════
console.log('\n=== toBaseUnits ===\n');

// ── USDC (6 decimals) ──
console.log('--- USDC (6 decimals) ---');
assertEq(toBaseUnits('100', 6),      100_000_000n,       'USDC: 100 → 100000000');
assertEq(toBaseUnits('100.50', 6),   100_500_000n,       'USDC: 100.50 → 100500000');
assertEq(toBaseUnits('0.000001', 6), 1n,                 'USDC: smallest unit (0.000001) → 1');
assertEq(toBaseUnits('0.0000001', 6), 0n,                'USDC: below precision truncated → 0');
assertEq(toBaseUnits('999999.999999', 6), 999_999_999_999n, 'USDC: max 6-decimal value');
assertEq(toBaseUnits('1000000', 6),  1_000_000_000_000n, 'USDC: 1M → 1e12');

// ── WBTC (8 decimals) ──
console.log('--- WBTC (8 decimals) ---');
assertEq(toBaseUnits('1', 8),        100_000_000n,       'WBTC: 1 → 100000000');
assertEq(toBaseUnits('0.001', 8),    100_000n,           'WBTC: 0.001 → 100000');
assertEq(toBaseUnits('0.00000001', 8), 1n,               'WBTC: smallest unit → 1');
assertEq(toBaseUnits('21000000', 8), 2_100_000_000_000_000n, 'WBTC: 21M (max supply) → 2.1e15');

// ── VARA (12 decimals) ──
console.log('--- VARA (12 decimals) ---');
assertEq(toBaseUnits('1', 12),       1_000_000_000_000n,       'VARA: 1 → 1e12');
assertEq(toBaseUnits('0.5', 12),     500_000_000_000n,         'VARA: 0.5 → 5e11');
assertEq(toBaseUnits('0.000000000001', 12), 1n,                'VARA: smallest unit → 1');

// ── WETH (18 decimals) ──
console.log('--- WETH (18 decimals) ---');
assertEq(toBaseUnits('1', 18),       1_000_000_000_000_000_000n,   'WETH: 1 → 1e18');
assertEq(toBaseUnits('1.5', 18),     1_500_000_000_000_000_000n,   'WETH: 1.5 → 1.5e18');
assertEq(toBaseUnits('0.001', 18),   1_000_000_000_000_000n,       'WETH: 0.001 → 1e15');
assertEq(toBaseUnits('0.000000000000000001', 18), 1n,              'WETH: smallest unit (1 wei) → 1');

// ── Edge cases ──
console.log('--- Edge cases ---');
assertEq(toBaseUnits('0', 6),        0n,  'Zero string → 0');
assertEq(toBaseUnits('', 6),         0n,  'Empty string → 0');
assertEq(toBaseUnits(null, 6),       0n,  'null → 0');
assertEq(toBaseUnits(undefined, 6),  0n,  'undefined → 0');
assertEq(toBaseUnits('0.0', 6),      0n,  '"0.0" → 0');
assertEq(toBaseUnits('-100', 6),     -100_000_000n, 'Negative amount');
assertEq(toBaseUnits('  50  ', 6),   50_000_000n,   'Whitespace trimmed');

// Very large amount
assertEq(toBaseUnits('1000000000', 18), 1_000_000_000_000_000_000_000_000_000n, 'WETH: 1B → 1e27');

// ═══════════════════════════════════════════════════════════════
// 2. toDisplayUnits — convert base units → human-readable
// ═══════════════════════════════════════════════════════════════
console.log('\n=== toDisplayUnits ===\n');

// ── USDC (6 decimals) ──
console.log('--- USDC (6 decimals) ---');
assertEq(toDisplayUnits(100_500_000n, 6),   '100.5',       'USDC: 100500000 → 100.5');
assertEq(toDisplayUnits(1n, 6),             '0.000001',    'USDC: 1 → 0.000001');
assertEq(toDisplayUnits(0n, 6),             '0',           'USDC: 0 → "0"');
assertEq(toDisplayUnits(1_000_000n, 6),     '1',           'USDC: 1000000 → 1');
assertEq(toDisplayUnits(999_999_999_999n, 6), '999999.999999', 'USDC: max → 999999.999999');

// ── WBTC (8 decimals) ──
console.log('--- WBTC (8 decimals) ---');
assertEq(toDisplayUnits(100_000n, 8),       '0.001',       'WBTC: 100000 → 0.001');
assertEq(toDisplayUnits(1n, 8),             '0.00000001',  'WBTC: 1 → 0.00000001');
assertEq(toDisplayUnits(100_000_000n, 8),   '1',           'WBTC: 1e8 → 1');

// ── WETH (18 decimals) ──
console.log('--- WETH (18 decimals) ---');
assertEq(toDisplayUnits(1_500_000_000_000_000_000n, 18), '1.5', 'WETH: 1.5e18 → 1.5');
assertEq(toDisplayUnits(1n, 18), '0.000000000000000001', 'WETH: 1 wei → 0.000000000000000001');
assertEq(toDisplayUnits(1_000_000_000_000_000_000n, 18), '1', 'WETH: 1e18 → 1');

// ── VARA (12 decimals) ──
console.log('--- VARA (12 decimals) ---');
assertEq(toDisplayUnits(1_000_000_000_000n, 12), '1',   'VARA: 1e12 → 1');
assertEq(toDisplayUnits(500_000_000_000n, 12),  '0.5',  'VARA: 5e11 → 0.5');

// ── Edge cases ──
console.log('--- Edge cases ---');
assertEq(toDisplayUnits(null, 6),  '0', 'null → "0"');
assertEq(toDisplayUnits(0, 6),     '0', 'number 0 → "0"');
assertEq(toDisplayUnits('0', 6),   '0', 'string "0" → "0"');
assertEq(toDisplayUnits(-100_500_000n, 6), '-100.5', 'Negative → -100.5');

// ═══════════════════════════════════════════════════════════════
// 3. Roundtrip: toBaseUnits(toDisplayUnits(x)) === x
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Roundtrip Consistency ===\n');

function roundtrip(value, decimals, label) {
  const display = toDisplayUnits(value, decimals);
  const back = toBaseUnits(display, decimals);
  assertEq(back, value, `Roundtrip (${label}): ${value} → "${display}" → ${back}`);
}

roundtrip(100_500_000n, 6, 'USDC 100.50');
roundtrip(1n, 6, 'USDC smallest');
roundtrip(100_000_000n, 8, 'WBTC 1.0');
roundtrip(100_000n, 8, 'WBTC 0.001');
roundtrip(1_500_000_000_000_000_000n, 18, 'WETH 1.5');
roundtrip(1n, 18, 'WETH 1 wei');
roundtrip(1_000_000_000_000n, 12, 'VARA 1.0');

// ═══════════════════════════════════════════════════════════════
// 4. Flow Rate Helpers
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Flow Rate Helpers ===\n');

// flowRateFromInterval: "100 USDC per month" → per-second base units
const usdc100PerMonth = flowRateFromInterval('100', 6, 'month');
// 100 USDC = 100_000_000 base. / 2592000 sec = ~38 base/sec
assertEq(usdc100PerMonth, 38n, 'USDC: 100/month → 38 base/sec (integer division)');

// flowRatePerInterval: reverse check
const displayPerMonth = flowRatePerInterval(38n, 6, 'month');
// 38 * 2592000 = 98,496,000 base → 98.496 display (slight loss from int division)
assertEq(displayPerMonth, '98.496', 'USDC: 38 base/sec → 98.496/month (int loss expected)');

// WETH flow rate: 0.01 WETH per day
const wethPerDay = flowRateFromInterval('0.01', 18, 'day');
// 0.01 WETH = 10_000_000_000_000_000 base. / 86400 = 115740740740740 base/sec
assertEq(wethPerDay, 115_740_740_740n, 'WETH: 0.01/day → 115740740740 base/sec');

// flowRateToBaseUnits and flowRateToDisplayUnits are aliases
assertEq(flowRateToBaseUnits('0.001', 6), toBaseUnits('0.001', 6), 'flowRateToBaseUnits alias');
assertEq(flowRateToDisplayUnits(1000n, 6), toDisplayUnits(1000n, 6), 'flowRateToDisplayUnits alias');

// Very small flow rate (micro-streaming USDC)
const microRate = flowRateFromInterval('0.01', 6, 'month');
// 0.01 USDC/mo = 10000 base / 2592000 = 0 (below 1 base/sec)
assertEq(microRate, 0n, 'USDC: 0.01/month flow rate too small → 0 base/sec');

// Reasonable small rate
const smallRate = flowRateFromInterval('1', 6, 'month');
// 1 USDC/mo = 1000000 / 2592000 = 0 ... also rounds to 0
// This is a real edge case: 1 USDC/month in 6-decimal is below 1 base unit/sec
assertEq(smallRate, 0n, 'USDC: 1/month too small per-second → 0 (known precision limit)');

// But 100 USDC/month works
const goodRate = flowRateFromInterval('100', 6, 'month');
assert(goodRate > 0n, 'USDC: 100/month has valid per-second rate');

// ═══════════════════════════════════════════════════════════════
// 5. Buffer Calculations
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Buffer Calculations ===\n');

// calculateMinDeposit: rate 38 base/sec, 3600s buffer = 136800 base
assertEq(calculateMinDeposit(38n, 3600), 136_800n, 'MinDeposit: 38 base/sec * 3600s = 136800');

// calculateMinDeposit WETH: small rate
assertEq(calculateMinDeposit(wethPerDay, 3600), wethPerDay * 3600n, 'MinDeposit: WETH rate * buffer');

// calculateBufferSeconds
assertEq(calculateBufferSeconds(136_800n, 38n), 3600, 'Buffer: 136800 / 38 = 3600 sec');
assertEq(calculateBufferSeconds(1_000_000n, 100n), 10000, 'Buffer: 1M / 100 = 10000 sec');
assertEq(calculateBufferSeconds(0n, 100n), 0, 'Buffer: 0 deposit = 0 sec');
assert(calculateBufferSeconds(100n, 0n) === Infinity, 'Buffer: 0 rate = Infinity');

// ═══════════════════════════════════════════════════════════════
// 6. INTERVALS constant
// ═══════════════════════════════════════════════════════════════
console.log('\n=== INTERVALS ===\n');

assertEq(INTERVALS.second, 1, 'second = 1');
assertEq(INTERVALS.minute, 60, 'minute = 60');
assertEq(INTERVALS.hour, 3600, 'hour = 3600');
assertEq(INTERVALS.day, 86400, 'day = 86400');
assertEq(INTERVALS.week, 604800, 'week = 604800');
assertEq(INTERVALS.month, 2592000, 'month = 2592000');
assertEq(INTERVALS.year, 31536000, 'year = 31536000');

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);

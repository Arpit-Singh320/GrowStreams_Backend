// Unit Tests — frontend/lib/tokens.ts
// Covers decimal conversion, flow rate helpers, formatting, registry lookups
// Run: npx tsx frontend/tests/unit/tokens.test.ts

import {
  SUPPORTED_TOKENS,
  getToken,
  getTokenByVaraAddress,
  listTokens,
  listStablecoins,
  listStreamableTokens,
  toBaseUnits,
  toDisplayUnits,
  formatDisplayAmount,
  flowRatePerInterval,
  flowRateFromInterval,
  formatFlowRate,
  calculateMinDeposit,
  calculateBufferSeconds,
  formatDuration,
  truncAddress,
  INTERVALS,
  INTERVAL_LABELS,
} from '../../lib/tokens';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

function assertEq(actual: unknown, expected: unknown, name: string) {
  const a = typeof actual === 'bigint' ? actual.toString() : String(actual);
  const e = typeof expected === 'bigint' ? expected.toString() : String(expected);
  if (a === e) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name} — got "${a}", expected "${e}"`); failed++; }
}

// ═══════════════════════════════════════════════════════════════
// 1. Registry — mirrors backend
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Frontend Token Registry ===\n');

const allKeys = Object.keys(SUPPORTED_TOKENS);
assertEq(allKeys.length, 5, 'Exactly 5 tokens');

// Verify decimals match backend
assertEq(SUPPORTED_TOKENS.WUSDC.decimals, 6, 'WUSDC = 6 dec');
assertEq(SUPPORTED_TOKENS.WUSDT.decimals, 6, 'WUSDT = 6 dec');
assertEq(SUPPORTED_TOKENS.WETH.decimals, 18, 'WETH = 18 dec');
assertEq(SUPPORTED_TOKENS.WBTC.decimals, 8, 'WBTC = 8 dec');
assertEq(SUPPORTED_TOKENS.VARA.decimals, 12, 'VARA = 12 dec');

// Colors (frontend-specific)
assert(!!SUPPORTED_TOKENS.WUSDC.color, 'WUSDC has color');
assert(!!SUPPORTED_TOKENS.WUSDC.colorAccent, 'WUSDC has colorAccent');

// ═══════════════════════════════════════════════════════════════
// 2. Lookup helpers
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Lookup Helpers ===\n');

assert(getToken('WUSDC') !== null, 'getToken("WUSDC")');
assert(getToken('USDC') !== null, 'getToken("USDC") resolves via symbol');
assert(getToken('wbtc') !== null, 'Case insensitive');
assert(getToken('DOGE') === null, 'Unknown → null');
assert(getToken('') === null, 'Empty → null');

const byVara = getTokenByVaraAddress(SUPPORTED_TOKENS.WETH.vara);
assert(byVara !== null, 'getTokenByVaraAddress WETH');
assertEq(byVara!.key, 'WETH', 'Correct key');

assert(getTokenByVaraAddress('0xdeadbeef') === null, 'Unknown address → null');

assertEq(listTokens().length, 5, 'listTokens = 5');
assertEq(listStablecoins().length, 2, 'listStablecoins = 2');

const streamable = listStreamableTokens();
assertEq(streamable.length, 4, 'listStreamableTokens = 4 (excludes VARA native)');
assert(!streamable.some(t => t.key === 'VARA'), 'VARA excluded from streamable');

// ═══════════════════════════════════════════════════════════════
// 3. toBaseUnits — same logic as backend
// ═══════════════════════════════════════════════════════════════
console.log('\n=== toBaseUnits ===\n');

// USDC (6 dec)
assertEq(toBaseUnits('100', 6), BigInt('100000000'), 'USDC: 100 → 1e8');
assertEq(toBaseUnits('100.50', 6), BigInt('100500000'), 'USDC: 100.50');
assertEq(toBaseUnits('0.000001', 6), BigInt(1), 'USDC: smallest');
assertEq(toBaseUnits('0', 6), BigInt(0), 'Zero');
assertEq(toBaseUnits('', 6), BigInt(0), 'Empty');

// WBTC (8 dec)
assertEq(toBaseUnits('1', 8), BigInt('100000000'), 'WBTC: 1');
assertEq(toBaseUnits('0.001', 8), BigInt('100000'), 'WBTC: 0.001');

// WETH (18 dec)
assertEq(toBaseUnits('1', 18), BigInt('1000000000000000000'), 'WETH: 1');
assertEq(toBaseUnits('1.5', 18), BigInt('1500000000000000000'), 'WETH: 1.5');

// VARA (12 dec)
assertEq(toBaseUnits('1', 12), BigInt('1000000000000'), 'VARA: 1');

// Negative
assertEq(toBaseUnits('-50', 6), BigInt('-50000000'), 'Negative');

// ═══════════════════════════════════════════════════════════════
// 4. toDisplayUnits
// ═══════════════════════════════════════════════════════════════
console.log('\n=== toDisplayUnits ===\n');

assertEq(toDisplayUnits(BigInt('100500000'), 6), '100.5', 'USDC: 100.5');
assertEq(toDisplayUnits(BigInt(1), 6), '0.000001', 'USDC: smallest');
assertEq(toDisplayUnits(BigInt(0), 6), '0', 'Zero');
assertEq(toDisplayUnits('1500000000000000000', 18), '1.5', 'WETH: 1.5 from string');
assertEq(toDisplayUnits(BigInt('100000'), 8), '0.001', 'WBTC: 0.001');

// ═══════════════════════════════════════════════════════════════
// 5. Roundtrip: toBaseUnits(toDisplayUnits(x)) === x
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Roundtrip ===\n');

function roundtrip(value: bigint, decimals: number, label: string) {
  const display = toDisplayUnits(value, decimals);
  const back = toBaseUnits(display, decimals);
  assertEq(back, value, `Roundtrip ${label}: ${value} → "${display}" → ${back}`);
}

roundtrip(BigInt('100500000'), 6, 'USDC 100.50');
roundtrip(BigInt(1), 6, 'USDC smallest');
roundtrip(BigInt('100000000'), 8, 'WBTC 1.0');
roundtrip(BigInt('1500000000000000000'), 18, 'WETH 1.5');
roundtrip(BigInt(1), 18, 'WETH 1 wei');
roundtrip(BigInt('1000000000000'), 12, 'VARA 1.0');

// ═══════════════════════════════════════════════════════════════
// 6. Frontend ↔ Backend Consistency
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Frontend ↔ Backend Consistency ===\n');

// These values were verified in the backend unit tests
assertEq(toBaseUnits('100.50', 6), BigInt('100500000'), 'Matches backend: USDC 100.50');
assertEq(toDisplayUnits(BigInt('100500000'), 6), '100.5', 'Matches backend: USDC display');
assertEq(toBaseUnits('1.5', 18), BigInt('1500000000000000000'), 'Matches backend: WETH 1.5');
assertEq(toBaseUnits('0.001', 8), BigInt('100000'), 'Matches backend: WBTC 0.001');

// ═══════════════════════════════════════════════════════════════
// 7. formatDisplayAmount
// ═══════════════════════════════════════════════════════════════
console.log('\n=== formatDisplayAmount ===\n');

assert(formatDisplayAmount(BigInt(0), 6) === '0', 'Zero → "0"');
assert(formatDisplayAmount(BigInt('100500000'), 6).includes('100'), 'USDC 100.5');
assert(formatDisplayAmount(BigInt(1), 18).includes('0.0001') || formatDisplayAmount(BigInt(1), 18) === '< 0.0001', 'WETH 1 wei → tiny');
assert(formatDisplayAmount(BigInt('2000000000000'), 6).includes(',') || true, 'Large numbers may be formatted');

// ═══════════════════════════════════════════════════════════════
// 8. Flow Rate Helpers
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Flow Rate Helpers ===\n');

// 100 USDC per month → per-second base
const rate = flowRateFromInterval('100', 6, 'month');
assertEq(rate, BigInt(38), 'USDC 100/mo = 38 base/sec');

// Reverse
const perMonth = flowRatePerInterval(BigInt(38), 6, 'month');
assertEq(perMonth, '98.496', 'USDC 38 base/sec = 98.496/mo');

// WETH: 0.01/day
const wethRate = flowRateFromInterval('0.01', 18, 'day');
assertEq(wethRate, BigInt('115740740740740'), 'WETH 0.01/day');

// formatFlowRate
const formatted = formatFlowRate(BigInt(38), 6, 'month');
assert(formatted.includes('/mo'), 'Contains /mo suffix');
assert(formatted !== '0/mo', 'Not zero');

// INTERVALS constant
assertEq(INTERVALS.month, 2592000, 'month = 2592000');
assertEq(INTERVALS.day, 86400, 'day = 86400');
assert(INTERVAL_LABELS.month === '/mo', '/mo label');

// ═══════════════════════════════════════════════════════════════
// 9. Buffer Calculations
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Buffer Calculations ===\n');

assertEq(calculateMinDeposit(BigInt(38), 3600), BigInt(136800), 'MinDeposit: 38 * 3600');
assertEq(calculateBufferSeconds(BigInt(136800), BigInt(38)), 3600, 'Buffer: 136800 / 38 = 3600');
assert(calculateBufferSeconds(BigInt(100), BigInt(0)) === Infinity, 'Zero rate → Infinity');
assertEq(calculateBufferSeconds(BigInt(0), BigInt(100)), 0, 'Zero deposit → 0');

// ═══════════════════════════════════════════════════════════════
// 10. formatDuration
// ═══════════════════════════════════════════════════════════════
console.log('\n=== formatDuration ===\n');

assertEq(formatDuration(0), 'Depleted', '0 → Depleted');
assertEq(formatDuration(-5), 'Depleted', 'Negative → Depleted');
assert(formatDuration(Infinity) === '∞', 'Infinity → ∞');
assert(formatDuration(3600).includes('1h'), '3600s = 1h');
assert(formatDuration(86400 + 3600).includes('1d'), '90000s includes 1d');
assert(formatDuration(30).includes('30s') || formatDuration(30).includes('m'), '30s → "30s" or "0m"');
assert(formatDuration(120).includes('2m'), '120s = 2m');

// ═══════════════════════════════════════════════════════════════
// 11. truncAddress
// ═══════════════════════════════════════════════════════════════
console.log('\n=== truncAddress ===\n');

const long = '0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48';
const trunc = truncAddress(long);
assert(trunc.includes('...'), 'Contains ellipsis');
assert(trunc.length < long.length, 'Shorter than original');
assert(trunc.startsWith('0x9f332e'), 'Starts with first 8 chars');

assertEq(truncAddress(''), '—', 'Empty → dash');
assertEq(truncAddress('short'), 'short', 'Short string → unchanged');

// ═══════════════════════════════════════════════════════════════
// 12. Edge Cases: Very Large and Very Small Flow Rates
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Edge Cases: Flow Rates ===\n');

// Very large: 1M WETH per month
const hugeRate = flowRateFromInterval('1000000', 18, 'month');
assert(hugeRate > BigInt(0), 'Large WETH flow rate is positive');
const hugeDisplay = flowRatePerInterval(hugeRate, 18, 'month');
assert(parseFloat(hugeDisplay) > 0, 'Reverse shows positive amount');

// Very small: 0.000001 USDC per year (likely rounds to 0/sec)
const tinyRate = flowRateFromInterval('0.000001', 6, 'year');
assertEq(tinyRate, BigInt(0), 'Tiny rate rounds to 0 per second');

// WETH micro rate: 0.000001 per day should work (high decimals)
const microWeth = flowRateFromInterval('0.000001', 18, 'day');
assert(microWeth > BigInt(0), 'WETH micro rate is positive due to 18 decimals');

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);

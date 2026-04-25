// Unit Tests — api/src/services/bridge-service.mjs (pure functions only, no DB)
// Covers: getSupportedRoutes, getRouteForToken, estimateBridgeFee, getBridgeInfo
// Run: node api/tests/unit/bridge-service.test.mjs

import {
  getSupportedRoutes,
  getRouteForToken,
  estimateBridgeFee,
  getBridgeInfo,
} from '../../src/services/bridge-service.mjs';

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

function assertEq(actual, expected, name) {
  const a = String(actual);
  const e = String(expected);
  if (a === e) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name} — got "${a}", expected "${e}"`); failed++; }
}

// ═══════════════════════════════════════════════════════════════
// 1. getSupportedRoutes
// ═══════════════════════════════════════════════════════════════
console.log('\n=== getSupportedRoutes ===\n');

const routes = getSupportedRoutes();
assertEq(routes.length, 4, '4 bridgeable tokens (WUSDC, WUSDT, WETH, WBTC)');

const routeTokens = routes.map(r => r.token).sort();
assert(routeTokens.includes('WUSDC'), 'WUSDC is bridgeable');
assert(routeTokens.includes('WUSDT'), 'WUSDT is bridgeable');
assert(routeTokens.includes('WETH'), 'WETH is bridgeable');
assert(routeTokens.includes('WBTC'), 'WBTC is bridgeable');

// VARA should NOT be in routes (native, no ETH address)
assert(!routeTokens.includes('VARA'), 'VARA is NOT bridgeable');

// Each route has required fields
for (const route of routes) {
  assert(route.token, `${route.token} has token key`);
  assert(route.symbol, `${route.token} has symbol`);
  assert(route.decimals > 0, `${route.token} has decimals`);
  assert(route.source && route.source.chain === 'ethereum', `${route.token} source is ethereum`);
  assert(route.destination && route.destination.chain === 'vara', `${route.token} destination is vara`);
  assert(route.source.address, `${route.token} has ETH address`);
  assert(route.destination.address, `${route.token} has Vara address`);
  assert(route.bidirectional === true, `${route.token} is bidirectional`);
}

// ═══════════════════════════════════════════════════════════════
// 2. getRouteForToken
// ═══════════════════════════════════════════════════════════════
console.log('\n=== getRouteForToken ===\n');

const usdcRoute = getRouteForToken('WUSDC');
assert(usdcRoute !== null, 'WUSDC route found');
assertEq(usdcRoute.token, 'WUSDC', 'Route token key');
assertEq(usdcRoute.symbol, 'USDC', 'Route symbol');
assertEq(usdcRoute.decimals, 6, 'Route decimals');

// By display symbol
const bySymbol = getRouteForToken('USDC');
assert(bySymbol !== null, 'USDC (display symbol) route found');
assertEq(bySymbol.token, 'WUSDC', 'Resolved to WUSDC');

// WETH route
const wethRoute = getRouteForToken('WETH');
assert(wethRoute !== null, 'WETH route found');
assertEq(wethRoute.decimals, 18, 'WETH decimals = 18');

// Non-bridgeable token
assert(getRouteForToken('VARA') === null, 'VARA has no bridge route');

// Non-existent token
assert(getRouteForToken('DOGE') === null, 'DOGE has no bridge route');
assert(getRouteForToken('') === null, 'Empty string → null');

// ═══════════════════════════════════════════════════════════════
// 3. estimateBridgeFee
// ═══════════════════════════════════════════════════════════════
console.log('\n=== estimateBridgeFee ===\n');

// ── USDC: 1000 USDC bridge ──
console.log('--- USDC (6 decimals) ---');
const usdc1000 = estimateBridgeFee('WUSDC', '1000');
assertEq(usdc1000.token, 'USDC', 'Token symbol');
assertEq(usdc1000.amount, '1000', 'Input amount preserved');
assertEq(usdc1000.amountRaw, '1000000000', 'Amount in base units (1000 * 1e6)');
// Fee: 1000000000 * 10 / 10000 = 1000000 base = 1 USDC
assertEq(usdc1000.feeRaw, '1000000', 'Fee raw = 1000000 (1 USDC)');
assertEq(usdc1000.fee, '1', 'Fee display = 1');
assertEq(usdc1000.feePercent, '0.10%', 'Fee percent = 0.10%');
// Net: 1000000000 - 1000000 = 999000000 = 999 USDC
assertEq(usdc1000.netAmountRaw, '999000000', 'Net raw = 999000000');
assertEq(usdc1000.netAmount, '999', 'Net display = 999');
assertEq(usdc1000.direction, 'ethToVara', 'Default direction');
assertEq(usdc1000.estimatedTimeMinutes, 15, 'ETH→Vara time = 15 min');

// ── WBTC: 0.5 BTC bridge ──
console.log('--- WBTC (8 decimals) ---');
const wbtc = estimateBridgeFee('WBTC', '0.5');
assertEq(wbtc.amountRaw, '50000000', '0.5 BTC = 50000000 base');
// Fee: 50000000 * 10 / 10000 = 50000 base
assertEq(wbtc.feeRaw, '50000', 'Fee = 50000 base');
assertEq(wbtc.fee, '0.0005', 'Fee display = 0.0005 BTC');
assertEq(wbtc.netAmountRaw, '49950000', 'Net = 49950000 base');

// ── WETH: 10 ETH bridge ──
console.log('--- WETH (18 decimals) ---');
const weth10 = estimateBridgeFee('WETH', '10');
assertEq(weth10.amountRaw, '10000000000000000000', '10 ETH in base units');
// Fee: 10e18 * 10 / 10000 = 10000000000000000 = 0.01 ETH
assertEq(weth10.feeRaw, '10000000000000000', 'Fee = 0.01 ETH in base');
assertEq(weth10.fee, '0.01', 'Fee display = 0.01 ETH');
assertEq(weth10.netAmount, '9.99', 'Net = 9.99 ETH');

// ── Direction: varaToEth takes 5 extra minutes ──
console.log('--- Direction effects ---');
const varaToEth = estimateBridgeFee('WUSDC', '100', 'varaToEth');
assertEq(varaToEth.direction, 'varaToEth', 'Direction set');
assertEq(varaToEth.estimatedTimeMinutes, 20, 'Vara→ETH time = 20 min (15+5)');

// ── Edge cases ──
console.log('--- Edge cases ---');

// Zero amount
const zero = estimateBridgeFee('WUSDC', '0');
assertEq(zero.feeRaw, '0', 'Zero amount → zero fee');
assertEq(zero.netAmountRaw, '0', 'Zero amount → zero net');

// Very small amount (fee rounds to 0 due to integer division)
const tiny = estimateBridgeFee('WUSDC', '0.000001');
// 1 base * 10 / 10000 = 0 (integer division)
assertEq(tiny.feeRaw, '0', 'Smallest USDC → zero fee (int division)');
assertEq(tiny.netAmountRaw, '1', 'Smallest USDC → 1 base net');

// Very large amount
const large = estimateBridgeFee('WETH', '1000000');
assert(BigInt(large.feeRaw) > 0n, 'Large amount has positive fee');
assert(BigInt(large.netAmountRaw) < BigInt(large.amountRaw), 'Net < gross');

// Error: non-bridgeable token
try {
  estimateBridgeFee('VARA', '100');
  assert(false, 'VARA should throw');
} catch (err) {
  assert(err.message.includes('not bridgeable'), 'VARA throws "not bridgeable"');
}

// Error: unknown token
try {
  estimateBridgeFee('DOGE', '100');
  assert(false, 'DOGE should throw');
} catch (err) {
  assert(err.message.includes('Unknown token'), 'DOGE throws "Unknown token"');
}

// ═══════════════════════════════════════════════════════════════
// 4. getBridgeInfo
// ═══════════════════════════════════════════════════════════════
console.log('\n=== getBridgeInfo ===\n');

const info = getBridgeInfo();
assert(info.supported === true, 'Bridge is supported');
assertEq(info.version, '1.0.0', 'Version 1.0.0');
assertEq(info.routeCount, 4, '4 routes');
assert(info.chains.ethereum, 'Has ethereum chain info');
assert(info.chains.vara, 'Has vara chain info');
assertEq(info.chains.ethereum.chainId, 17000, 'ETH chain = Holesky (17000)');
assertEq(info.chains.ethereum.blockTime, 12, 'ETH blockTime = 12s');
assertEq(info.chains.vara.blockTime, 3, 'Vara blockTime = 3s');

// Fees
assertEq(info.fees.percentBps, 10, 'Fee = 10 bps');
assertEq(info.fees.percentDisplay, '0.10%', 'Fee display = 0.10%');
assertEq(info.fees.minBps, 5, 'Min fee = 5 bps');
assertEq(info.fees.maxBps, 50, 'Max fee = 50 bps');

// Timing
assertEq(info.timing.estimatedMinutes, 15, 'Estimated time = 15 min');
assertEq(info.timing.minConfirmations, 12, 'Min confirmations = 12');

// Faucets and guides
assert(info.faucets.vara, 'Has Vara faucet link');
assert(info.faucets.holesky, 'Has Holesky faucet link');
assert(info.guides.bridging, 'Has bridging guide');

// Routes embedded in info
assertEq(info.routes.length, 4, '4 routes in info object');

// ═══════════════════════════════════════════════════════════════
// 5. Fee Precision Across Token Decimals
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Fee Precision Matrix ===\n');

const testAmounts = ['0.01', '1', '100', '10000', '1000000'];
const bridgeableTokens = ['WUSDC', 'WUSDT', 'WETH', 'WBTC'];

for (const token of bridgeableTokens) {
  for (const amount of testAmounts) {
    const est = estimateBridgeFee(token, amount);
    const grossBig = BigInt(est.amountRaw);
    const feeBig = BigInt(est.feeRaw);
    const netBig = BigInt(est.netAmountRaw);

    // Invariant: gross = fee + net
    const sum = feeBig + netBig;
    assert(sum === grossBig, `${token} ${amount}: fee + net = gross (${feeBig} + ${netBig} = ${sum} vs ${grossBig})`);

    // Fee should be <= 0.10% of gross (rounding down)
    assert(feeBig <= grossBig, `${token} ${amount}: fee <= gross`);
    assert(netBig >= 0n, `${token} ${amount}: net >= 0`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);

// Unit Tests — api/src/config/tokens.mjs
// Covers token registry lookup, resolution, listing, and cross-reference integrity
// Run: node api/tests/unit/tokens.test.mjs

import {
  SUPPORTED_TOKENS,
  getToken,
  getTokenByVaraAddress,
  getTokenByEthAddress,
  listTokens,
  listStablecoins,
  resolveVaraAddress,
} from '../../src/config/tokens.mjs';

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

function assertEq(actual, expected, name) {
  if (actual === expected) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name} — got "${actual}", expected "${expected}"`); failed++; }
}

// ═══════════════════════════════════════════════════════════════
// 1. Registry Integrity
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Registry Integrity ===\n');

const allKeys = Object.keys(SUPPORTED_TOKENS);
assertEq(allKeys.length, 5, 'Exactly 5 tokens in registry');
assert(allKeys.includes('WUSDC'), 'Contains WUSDC');
assert(allKeys.includes('WUSDT'), 'Contains WUSDT');
assert(allKeys.includes('WETH'), 'Contains WETH');
assert(allKeys.includes('WBTC'), 'Contains WBTC');
assert(allKeys.includes('VARA'), 'Contains VARA');

// Verify decimal values
console.log('--- Token Decimals ---');
assertEq(SUPPORTED_TOKENS.WUSDC.decimals, 6, 'WUSDC decimals = 6');
assertEq(SUPPORTED_TOKENS.WUSDT.decimals, 6, 'WUSDT decimals = 6');
assertEq(SUPPORTED_TOKENS.WETH.decimals, 18, 'WETH decimals = 18');
assertEq(SUPPORTED_TOKENS.WBTC.decimals, 8, 'WBTC decimals = 8');
assertEq(SUPPORTED_TOKENS.VARA.decimals, 12, 'VARA decimals = 12');

// Verify categories
console.log('--- Token Categories ---');
assert(SUPPORTED_TOKENS.WUSDC.isStablecoin, 'WUSDC is stablecoin');
assert(SUPPORTED_TOKENS.WUSDT.isStablecoin, 'WUSDT is stablecoin');
assert(!SUPPORTED_TOKENS.WETH.isStablecoin, 'WETH is not stablecoin');
assert(!SUPPORTED_TOKENS.WBTC.isStablecoin, 'WBTC is not stablecoin');
assert(!SUPPORTED_TOKENS.VARA.isStablecoin, 'VARA is not stablecoin');

assertEq(SUPPORTED_TOKENS.VARA.category, 'native', 'VARA category = native');
assertEq(SUPPORTED_TOKENS.WETH.category, 'volatile', 'WETH category = volatile');
assertEq(SUPPORTED_TOKENS.WUSDC.category, 'stablecoin', 'WUSDC category = stablecoin');

// Verify addresses
console.log('--- Token Addresses ---');
assert(SUPPORTED_TOKENS.WUSDC.vara.startsWith('0x'), 'WUSDC has Vara address');
assert(SUPPORTED_TOKENS.WUSDC.eth.startsWith('0x'), 'WUSDC has ETH address');
assertEq(SUPPORTED_TOKENS.VARA.vara, 'native', 'VARA vara = "native"');
assertEq(SUPPORTED_TOKENS.VARA.eth, null, 'VARA eth = null');

// All non-native tokens have both addresses
for (const key of ['WUSDC', 'WUSDT', 'WETH', 'WBTC']) {
  assert(SUPPORTED_TOKENS[key].vara && SUPPORTED_TOKENS[key].vara.startsWith('0x'), `${key} has Vara address`);
  assert(SUPPORTED_TOKENS[key].eth && SUPPORTED_TOKENS[key].eth.startsWith('0x'), `${key} has ETH address`);
}

// Vara addresses are unique
const varaAddrs = Object.values(SUPPORTED_TOKENS).map(t => t.vara).filter(a => a !== 'native');
assertEq(new Set(varaAddrs).size, varaAddrs.length, 'All Vara addresses are unique');

// ETH addresses are unique (excluding null)
const ethAddrs = Object.values(SUPPORTED_TOKENS).map(t => t.eth).filter(Boolean);
assertEq(new Set(ethAddrs.map(a => a.toLowerCase())).size, ethAddrs.length, 'All ETH addresses are unique');

// ═══════════════════════════════════════════════════════════════
// 2. getToken — lookup by symbol or key
// ═══════════════════════════════════════════════════════════════
console.log('\n=== getToken ===\n');

// By key
const wusdc = getToken('WUSDC');
assert(wusdc !== null, 'getToken("WUSDC") found');
assertEq(wusdc.key, 'WUSDC', 'getToken("WUSDC").key');
assertEq(wusdc.symbol, 'USDC', 'getToken("WUSDC").symbol');

// By display symbol
const usdc = getToken('USDC');
assert(usdc !== null, 'getToken("USDC") found (matches by symbol)');
assertEq(usdc.key, 'WUSDC', 'getToken("USDC").key = WUSDC');

// Case insensitive
const lower = getToken('wbtc');
assert(lower !== null, 'getToken("wbtc") case insensitive');
assertEq(lower.key, 'WBTC', 'getToken("wbtc").key = WBTC');

const mixed = getToken('Weth');
assert(mixed !== null, 'getToken("Weth") case insensitive');
assertEq(mixed.decimals, 18, 'getToken("Weth").decimals = 18');

// Native token
const vara = getToken('VARA');
assert(vara !== null, 'getToken("VARA") found');
assertEq(vara.vara, 'native', 'VARA is native');

// Not found
assert(getToken('DOGE') === null, 'getToken("DOGE") → null');
assert(getToken('') === null, 'getToken("") → null');
assert(getToken(null) === null, 'getToken(null) → null');
assert(getToken(undefined) === null, 'getToken(undefined) → null');

// ═══════════════════════════════════════════════════════════════
// 3. getTokenByVaraAddress
// ═══════════════════════════════════════════════════════════════
console.log('\n=== getTokenByVaraAddress ===\n');

const byVara = getTokenByVaraAddress(SUPPORTED_TOKENS.WUSDC.vara);
assert(byVara !== null, 'Found WUSDC by Vara address');
assertEq(byVara.key, 'WUSDC', 'Correct key');

// Case insensitive
const byVaraLower = getTokenByVaraAddress(SUPPORTED_TOKENS.WETH.vara.toLowerCase());
assert(byVaraLower !== null, 'Found WETH by lowercase Vara address');
assertEq(byVaraLower.key, 'WETH', 'Correct key');

// Not found
assert(getTokenByVaraAddress('0xdeadbeef') === null, 'Unknown Vara address → null');
assert(getTokenByVaraAddress(null) === null, 'null → null');
assert(getTokenByVaraAddress('') === null, 'empty → null');

// ═══════════════════════════════════════════════════════════════
// 4. getTokenByEthAddress
// ═══════════════════════════════════════════════════════════════
console.log('\n=== getTokenByEthAddress ===\n');

const byEth = getTokenByEthAddress(SUPPORTED_TOKENS.WUSDC.eth);
assert(byEth !== null, 'Found WUSDC by ETH address');
assertEq(byEth.key, 'WUSDC', 'Correct key');

const byEthLower = getTokenByEthAddress(SUPPORTED_TOKENS.WBTC.eth.toLowerCase());
assert(byEthLower !== null, 'Found WBTC by lowercase ETH address');

assert(getTokenByEthAddress('0xdeadbeef') === null, 'Unknown ETH address → null');
assert(getTokenByEthAddress(null) === null, 'null → null');

// ═══════════════════════════════════════════════════════════════
// 5. listTokens / listStablecoins
// ═══════════════════════════════════════════════════════════════
console.log('\n=== listTokens / listStablecoins ===\n');

const all = listTokens();
assertEq(all.length, 5, 'listTokens returns 5');
assert(all.every(t => t.key && t.symbol && t.decimals != null), 'All tokens have key, symbol, decimals');

const stables = listStablecoins();
assertEq(stables.length, 2, 'listStablecoins returns 2');
assert(stables.every(t => t.isStablecoin), 'All stablecoins are stablecoins');
assert(stables.some(t => t.key === 'WUSDC'), 'WUSDC in stablecoins');
assert(stables.some(t => t.key === 'WUSDT'), 'WUSDT in stablecoins');

// ═══════════════════════════════════════════════════════════════
// 6. resolveVaraAddress
// ═══════════════════════════════════════════════════════════════
console.log('\n=== resolveVaraAddress ===\n');

// By symbol
assertEq(resolveVaraAddress('WUSDC'), SUPPORTED_TOKENS.WUSDC.vara, 'resolveVaraAddress("WUSDC")');
assertEq(resolveVaraAddress('USDC'), SUPPORTED_TOKENS.WUSDC.vara, 'resolveVaraAddress("USDC") maps to WUSDC');
assertEq(resolveVaraAddress('VARA'), 'native', 'resolveVaraAddress("VARA") = "native"');

// By raw address — pass-through if known
const varaAddr = SUPPORTED_TOKENS.WETH.vara;
assertEq(resolveVaraAddress(varaAddr), varaAddr, 'resolveVaraAddress(known hex) → same address');

// Unknown raw address — pass-through
const unknownAddr = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
assertEq(resolveVaraAddress(unknownAddr), unknownAddr, 'resolveVaraAddress(unknown hex) → pass-through');

// Not found
assertEq(resolveVaraAddress('DOGE'), null, 'resolveVaraAddress("DOGE") → null');

// ═══════════════════════════════════════════════════════════════
// 7. Cross-reference: Frontend ↔ Backend Decimals
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Cross-reference Checks ===\n');

// These are the expected decimals that the frontend must match
const expectedDecimals = { WUSDC: 6, WUSDT: 6, WETH: 18, WBTC: 8, VARA: 12 };
for (const [key, dec] of Object.entries(expectedDecimals)) {
  assertEq(SUPPORTED_TOKENS[key].decimals, dec, `${key} decimals match expected (${dec})`);
}

// minBuffer should be 3600 for all tokens
for (const [key, tok] of Object.entries(SUPPORTED_TOKENS)) {
  assertEq(tok.minBuffer, 3600, `${key} minBuffer = 3600`);
}

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);

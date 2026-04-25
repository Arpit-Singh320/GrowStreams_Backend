// Decimal normalization utilities for multi-token support
// Handles conversion between human-readable amounts and on-chain base units

/**
 * Convert a human-readable amount string to on-chain base units (BigInt).
 * Examples:
 *   toBaseUnits("100.50", 6)  → 100500000n      (USDC)
 *   toBaseUnits("1.5", 18)    → 1500000000000000000n  (WETH)
 *   toBaseUnits("0.001", 8)   → 100000n          (WBTC)
 */
export function toBaseUnits(amount, decimals) {
  if (amount == null) return 0n;
  const str = String(amount).trim();
  if (str === '' || str === '0') return 0n;

  const negative = str.startsWith('-');
  const abs = negative ? str.slice(1) : str;

  const [intPart, fracPart = ''] = abs.split('.');

  // Pad or truncate fractional part to match decimals
  const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  const combined = (intPart || '0') + paddedFrac;

  // Remove leading zeros but keep at least one digit
  const cleaned = combined.replace(/^0+/, '') || '0';
  const result = BigInt(cleaned);

  return negative ? -result : result;
}

/**
 * Convert on-chain base units (BigInt or string) to a human-readable string.
 * Examples:
 *   toDisplayUnits(100500000n, 6)  → "100.5"         (USDC)
 *   toDisplayUnits("1500000000000000000", 18)  → "1.5" (WETH)
 *   toDisplayUnits(100000n, 8)     → "0.001"          (WBTC)
 */
export function toDisplayUnits(baseUnits, decimals) {
  if (baseUnits == null) return '0';
  const val = BigInt(baseUnits);
  if (val === 0n) return '0';

  const negative = val < 0n;
  const abs = negative ? -val : val;
  const str = abs.toString().padStart(decimals + 1, '0');

  const intPart = str.slice(0, str.length - decimals) || '0';
  const fracPart = str.slice(str.length - decimals);

  // Trim trailing zeros from fractional part
  const trimmedFrac = fracPart.replace(/0+$/, '');
  const result = trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart;

  return negative ? `-${result}` : result;
}

/**
 * Convert a flow rate from human-readable per-second to base units per-second.
 * The flowRate input is in token units per second (e.g., "0.001" USDC/sec).
 */
export function flowRateToBaseUnits(flowRatePerSecond, decimals) {
  return toBaseUnits(flowRatePerSecond, decimals);
}

/**
 * Convert a base-unit flow rate to human-readable per-second.
 */
export function flowRateToDisplayUnits(baseFlowRate, decimals) {
  return toDisplayUnits(baseFlowRate, decimals);
}

/**
 * Convert a flow rate between time intervals.
 * Useful for showing "X USDC per month" from a per-second rate.
 */
export const INTERVALS = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,  // 30 days
  year: 31536000,  // 365 days
};

/**
 * Convert a per-second flow rate to a per-interval rate (human-readable).
 * @param {bigint|string} baseFlowRatePerSecond - flow rate in base units per second
 * @param {number} decimals - token decimals
 * @param {string} interval - one of 'second', 'minute', 'hour', 'day', 'week', 'month', 'year'
 * @returns {string} human-readable amount per interval
 */
export function flowRatePerInterval(baseFlowRatePerSecond, decimals, interval = 'month') {
  const multiplier = BigInt(INTERVALS[interval] || 1);
  const perInterval = BigInt(baseFlowRatePerSecond) * multiplier;
  return toDisplayUnits(perInterval, decimals);
}

/**
 * Convert a human-readable per-interval flow rate to a base-unit per-second rate.
 * @param {string} amountPerInterval - e.g., "100" (100 USDC per month)
 * @param {number} decimals - token decimals
 * @param {string} interval - one of the INTERVALS keys
 * @returns {bigint} base units per second
 */
export function flowRateFromInterval(amountPerInterval, decimals, interval = 'month') {
  const baseTotal = toBaseUnits(amountPerInterval, decimals);
  const divisor = BigInt(INTERVALS[interval] || 1);
  return baseTotal / divisor;
}

/**
 * Calculate minimum deposit (buffer) for a given flow rate.
 * @param {bigint|string} baseFlowRatePerSecond
 * @param {number} minBufferSeconds - minimum seconds of streaming to cover
 * @returns {bigint} minimum deposit in base units
 */
export function calculateMinDeposit(baseFlowRatePerSecond, minBufferSeconds = 3600) {
  return BigInt(baseFlowRatePerSecond) * BigInt(minBufferSeconds);
}

/**
 * Calculate remaining buffer time in seconds.
 * @param {bigint|string} remainingDeposit - remaining deposit in base units
 * @param {bigint|string} baseFlowRatePerSecond
 * @returns {number} seconds remaining
 */
export function calculateBufferSeconds(remainingDeposit, baseFlowRatePerSecond) {
  const rate = BigInt(baseFlowRatePerSecond);
  if (rate === 0n) return Infinity;
  return Number(BigInt(remainingDeposit) / rate);
}

// ---------------------------------------------------------------------------
// Decimal conversion utilities for multi-token support
// ---------------------------------------------------------------------------

/**
 * Convert a human-readable amount string to on-chain base units (BigInt).
 * e.g. toBaseUnits("100.50", 6) → 100500000n  (USDC)
 *      toBaseUnits("1.5", 18)   → 1500000000000000000n (WETH)
 */
export function toBaseUnits(amount, decimals) {
  if (typeof amount === 'bigint') return amount;
  if (typeof amount === 'number') amount = amount.toString();

  const str = amount.trim();
  if (!str || str === '0') return 0n;

  const negative = str.startsWith('-');
  const abs = negative ? str.slice(1) : str;

  const [intPart, fracPart = ''] = abs.split('.');
  const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  const combined = (intPart || '0') + paddedFrac;

  const result = BigInt(combined);
  return negative ? -result : result;
}

/**
 * Convert on-chain base units (BigInt or string) to a human-readable string.
 * e.g. toDisplayUnits(100500000n, 6)             → "100.5"
 *      toDisplayUnits("1500000000000000000", 18) → "1.5"
 */
export function toDisplayUnits(baseUnits, decimals) {
  let value = typeof baseUnits === 'bigint' ? baseUnits : BigInt(baseUnits || '0');

  const negative = value < 0n;
  if (negative) value = -value;

  const str = value.toString().padStart(decimals + 1, '0');
  const intPart = str.slice(0, str.length - decimals) || '0';
  const fracPart = str.slice(str.length - decimals);

  // Trim trailing zeros from fractional part
  const trimmedFrac = fracPart.replace(/0+$/, '');

  const result = trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart;
  return negative ? `-${result}` : result;
}

/**
 * Format a display amount with token symbol.
 * e.g. formatTokenAmount("100.5", "USDC") → "100.5 USDC"
 */
export function formatTokenAmount(displayAmount, symbol) {
  return `${displayAmount} ${symbol}`;
}

/**
 * Convert a per-second flow rate to a human-friendly rate per time unit.
 * Returns { perSecond, perMinute, perHour, perDay, perMonth } as display strings.
 */
export function flowRateBreakdown(perSecondBaseUnits, decimals) {
  const ps = typeof perSecondBaseUnits === 'bigint' ? perSecondBaseUnits : BigInt(perSecondBaseUnits || '0');

  return {
    perSecond: toDisplayUnits(ps, decimals),
    perMinute: toDisplayUnits(ps * 60n, decimals),
    perHour:   toDisplayUnits(ps * 3600n, decimals),
    perDay:    toDisplayUnits(ps * 86400n, decimals),
    perMonth:  toDisplayUnits(ps * 2592000n, decimals), // 30 days
  };
}

/**
 * Convert a human-readable rate (e.g. "100 per month") to per-second base units.
 * interval: 'second' | 'minute' | 'hour' | 'day' | 'month'
 */
export function toPerSecondRate(amount, decimals, interval = 'month') {
  const base = toBaseUnits(amount, decimals);
  const divisors = {
    second: 1n,
    minute: 60n,
    hour:   3600n,
    day:    86400n,
    month:  2592000n, // 30 days
  };
  const divisor = divisors[interval];
  if (!divisor) throw new Error(`Invalid interval: ${interval}`);
  return base / divisor;
}

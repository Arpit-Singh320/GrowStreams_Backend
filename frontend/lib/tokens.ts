// Frontend token registry — mirrors api/src/config/tokens.mjs
// Provides token metadata, decimal conversion, and flow rate utilities

export interface TokenConfig {
  key: string;
  symbol: string;
  name: string;
  decimals: number;
  vara: string;
  eth: string | null;
  icon: string;
  category: 'stablecoin' | 'volatile' | 'native' | 'utility';
  isStablecoin: boolean;
  minBuffer: number;
  color: string;         // Tailwind color class for UI
  colorAccent: string;   // For backgrounds/rings
  comingSoon?: boolean;
}

export const SUPPORTED_TOKENS: Record<string, TokenConfig> = {
  WUSDC: {
    key: 'WUSDC',
    symbol: 'wUSDC',
    name: 'USD Coin',
    decimals: 6,
    vara: '0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48',
    eth: '0x263898d2f6f8E153F1e4DD4CAEF86C93784fCf33',
    icon: '/tokens/usdc.svg',
    category: 'stablecoin',
    isStablecoin: true,
    minBuffer: 3600,
    color: 'text-blue-400',
    colorAccent: 'blue',
  },
  WUSDT: {
    key: 'WUSDT',
    symbol: 'wUSDT',
    name: 'Tether USD',
    decimals: 6,
    vara: '0x464511231a1afe9108a689ed3dbbb047ca308d6f5dfb86453e4df5612a2d668a',
    eth: '0x7728A33EBEBCfa852cf7f7Fc377BfC87C24a701A',
    icon: '/tokens/usdt.svg',
    category: 'stablecoin',
    isStablecoin: true,
    minBuffer: 3600,
    color: 'text-green-400',
    colorAccent: 'green',
  },
  WETH: {
    key: 'WETH',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    vara: '0xba764e2836b28806be10fe6f674d89d1e0c86898d25728f776588f03bddc6f58',
    eth: '0xE0decAa66aED871ac9eb924443D1Bf333Fdb062E',
    icon: '/tokens/weth.svg',
    category: 'volatile',
    isStablecoin: false,
    minBuffer: 3600,
    color: 'text-purple-400',
    colorAccent: 'purple',
  },
  WBTC: {
    key: 'WBTC',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    vara: '0xc1ec06d99efcffd863f9c2ad2bc76f656aff861acf06f438046c64e5b41e3fd9',
    eth: '0xa56a332d34b2db33ebc41dc0194afd28cb20d19b',
    icon: '/tokens/wbtc.svg',
    category: 'volatile',
    isStablecoin: false,
    minBuffer: 3600,
    color: 'text-orange-400',
    colorAccent: 'orange',
  },
  GROW: {
    key: 'GROW',
    symbol: 'GROW',
    name: 'GrowStreams Token',
    decimals: 12,
    vara: '0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163',
    eth: null,
    icon: '/tokens/grow.svg',
    category: 'utility',
    isStablecoin: false,
    minBuffer: 3600,
    color: 'text-cyan-400',
    colorAccent: 'cyan',
    comingSoon: true,
  },
  WTVARA: {
    key: 'WTVARA',
    symbol: 'wVARA',
    name: 'Wrapped VARA',
    decimals: 12,
    vara: '0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d',
    eth: '0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464',
    icon: '/tokens/vara.svg',
    category: 'native',
    isStablecoin: false,
    minBuffer: 3600,
    color: 'text-emerald-400',
    colorAccent: 'emerald',
  },
  VARA: {
    key: 'VARA',
    symbol: 'VARA',
    name: 'Vara',
    decimals: 12,
    vara: 'native',
    eth: null,
    icon: '/tokens/vara.svg',
    category: 'native',
    isStablecoin: false,
    minBuffer: 3600,
    color: 'text-emerald-400',
    colorAccent: 'emerald',
  },
};

// ─── Lookup helpers ──────────────────────────────────────────

export function getToken(symbolOrKey: string): TokenConfig | null {
  if (!symbolOrKey) return null;
  const upper = symbolOrKey.toUpperCase();
  if (SUPPORTED_TOKENS[upper]) return SUPPORTED_TOKENS[upper];
  for (const tok of Object.values(SUPPORTED_TOKENS)) {
    if (tok.symbol.toUpperCase() === upper) return tok;
  }
  return null;
}

export function getTokenByVaraAddress(varaAddress: string): TokenConfig | null {
  if (!varaAddress) return null;
  const lower = varaAddress.toLowerCase();
  for (const tok of Object.values(SUPPORTED_TOKENS)) {
    if (tok.vara.toLowerCase() === lower) return tok;
  }
  return null;
}

export function listTokens(): TokenConfig[] {
  return Object.values(SUPPORTED_TOKENS);
}

export function listStablecoins(): TokenConfig[] {
  return listTokens().filter(t => t.isStablecoin);
}

export function listStreamableTokens(): TokenConfig[] {
  return listTokens().filter(t => !t.comingSoon && t.key !== 'VARA');
}

// ─── Decimal conversion ──────────────────────────────────────

export function toBaseUnits(amount: string | number, decimals: number): bigint {
  const str = String(amount).trim();
  if (!str || str === '0') return BigInt(0);

  const negative = str.startsWith('-');
  const abs = negative ? str.slice(1) : str;
  const [intPart, fracPart = ''] = abs.split('.');
  const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  const combined = (intPart || '0') + paddedFrac;
  const cleaned = combined.replace(/^0+/, '') || '0';
  const result = BigInt(cleaned);
  return negative ? -result : result;
}

export function toDisplayUnits(baseUnits: string | bigint | number, decimals: number): string {
  if (baseUnits == null) return '0';
  const val = BigInt(baseUnits);
  if (val === BigInt(0)) return '0';

  const negative = val < BigInt(0);
  const abs = negative ? -val : val;
  const str = abs.toString().padStart(decimals + 1, '0');
  const intPart = str.slice(0, str.length - decimals) || '0';
  const fracPart = str.slice(str.length - decimals);
  const trimmedFrac = fracPart.replace(/0+$/, '');
  const result = trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart;
  return negative ? `-${result}` : result;
}

export function formatDisplayAmount(baseUnits: string | bigint | number, decimals: number, maxFrac = 6): string {
  const display = toDisplayUnits(baseUnits, decimals);
  const num = parseFloat(display);
  if (isNaN(num) || num === 0) return '0';
  if (Math.abs(num) >= 0.0001) {
    const frac = Math.abs(num) >= 1_000_000 ? 2 : Math.abs(num) >= 1 ? Math.min(maxFrac, 4) : Math.min(maxFrac, 6);
    return fmtNumber(num, frac);
  }
  return '< 0.0001';
}

/** Format a display-unit number string with proper decimal formatting */
export function fmtDisplay(displayValue: string | number, maxFrac = 4): string {
  const num = typeof displayValue === 'string' ? parseFloat(displayValue) : displayValue;
  if (isNaN(num) || num === 0) return '0';
  const frac = Math.abs(num) >= 1_000_000 ? 2 : Math.abs(num) >= 1 ? maxFrac : 6;
  return fmtNumber(num, frac);
}

/** Format number with dot thousand separators and comma decimal separator */
function fmtNumber(num: number, maxFrac: number): string {
  const parts = num.toFixed(maxFrac).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fracPart = parts[1] ? parts[1].replace(/0+$/, '') : '';
  return fracPart ? `${intPart},${fracPart}` : intPart;
}

// ─── Flow rate helpers ───────────────────────────────────────

export const INTERVALS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,  // 30 days
  year: 31536000,  // 365 days
};

export const INTERVAL_LABELS: Record<string, string> = {
  second: '/sec',
  minute: '/min',
  hour: '/hr',
  day: '/day',
  week: '/wk',
  month: '/mo',
  year: '/yr',
};

export function flowRatePerInterval(
  baseFlowRatePerSecond: string | bigint,
  decimals: number,
  interval: string = 'month',
): string {
  const multiplier = BigInt(INTERVALS[interval] || 1);
  const perInterval = BigInt(baseFlowRatePerSecond) * multiplier;
  return toDisplayUnits(perInterval, decimals);
}

export function flowRateFromInterval(
  amountPerInterval: string | number,
  decimals: number,
  interval: string = 'month',
): bigint {
  const baseTotal = toBaseUnits(amountPerInterval, decimals);
  const divisor = BigInt(INTERVALS[interval] || 1);
  return baseTotal / divisor;
}

export function formatFlowRate(
  baseFlowRatePerSecond: string | bigint,
  decimals: number,
  interval: string = 'month',
): string {
  const display = flowRatePerInterval(baseFlowRatePerSecond, decimals, interval);
  const num = parseFloat(display);
  if (isNaN(num) || num === 0) return `0${INTERVAL_LABELS[interval] || ''}`;
  const suffix = INTERVAL_LABELS[interval] || '';
  if (num >= 1000) return `${fmtNumber(num, 2)}${suffix}`;
  if (num >= 1) return `${fmtNumber(num, 4)}${suffix}`;
  if (num >= 0.0001) return `${fmtNumber(num, 6)}${suffix}`;
  return `< 0.0001${suffix}`;
}

export function calculateMinDeposit(baseFlowRatePerSecond: string | bigint, minBufferSeconds = 3600): bigint {
  return BigInt(baseFlowRatePerSecond) * BigInt(minBufferSeconds);
}

export function calculateBufferSeconds(remainingDeposit: string | bigint, baseFlowRatePerSecond: string | bigint): number {
  const rate = BigInt(baseFlowRatePerSecond);
  if (rate === BigInt(0)) return Infinity;
  return Number(BigInt(remainingDeposit) / rate);
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'Depleted';
  if (!isFinite(seconds)) return '\u221e';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

export function truncAddress(addr: string): string {
  if (!addr || addr.length < 16) return addr || '\u2014';
  return addr.slice(0, 8) + '...' + addr.slice(-6);
}

// ---------------------------------------------------------------------------
// Supported token registry for GrowStreams V3
// ---------------------------------------------------------------------------

// Vara ActorId requires 32-byte (64-char) hex with 0x prefix.
// ETH addresses are standard 20-byte (40-char) hex with 0x prefix.

export const SUPPORTED_TOKENS = {
  WUSDC: {
    symbol: 'WUSDC',
    displaySymbol: 'USDC',
    name: 'Wrapped USD Coin',
    decimals: 6,
    vara: '0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48',
    eth: '0x263898d2f6f8E153F1e4DD4CAEF86C93784fCf33',
    icon: '/tokens/usdc.svg',
    category: 'stablecoin',
    coingeckoId: 'usd-coin',
  },
  WUSDT: {
    symbol: 'WUSDT',
    displaySymbol: 'USDT',
    name: 'Wrapped Tether USD',
    decimals: 6,
    vara: '0x464511231a1afe9108a689ed3dbbb047ca308d6f5dfb86453e4df5612a2d668a',
    eth: '0x7728A33EBEBCfa852cf7f7Fc377BfC87C24a701A',
    icon: '/tokens/usdt.svg',
    category: 'stablecoin',
    coingeckoId: 'tether',
  },
  WETH: {
    symbol: 'WETH',
    displaySymbol: 'ETH',
    name: 'Wrapped Ether',
    decimals: 18,
    vara: '0xba764e2836b28806be10fe6f674d89d1e0c86898d25728f776588f03bddc6f58',
    eth: '0xE0decAa66aED871ac9eb924443D1Bf333Fdb062E',
    icon: '/tokens/eth.svg',
    category: 'crypto',
    coingeckoId: 'ethereum',
  },
  WBTC: {
    symbol: 'WBTC',
    displaySymbol: 'BTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    vara: '0xc1ec06d99efcffd863f9c2ad2bc76f656aff861acf06f438046c64e5b41e3fd9',
    eth: '0xa56a332d34b2db33ebc41dc0194afd28cb20d19b',
    icon: '/tokens/btc.svg',
    category: 'crypto',
    coingeckoId: 'bitcoin',
  },
  VARA: {
    symbol: 'VARA',
    displaySymbol: 'VARA',
    name: 'Vara Network',
    decimals: 12,
    vara: '0x0000000000000000000000000000000000000000000000000000000000000000',
    eth: null,
    icon: '/tokens/vara.svg',
    category: 'native',
    coingeckoId: 'vara-network',
  },
};

// Lookup helpers
const _byVara = new Map();
const _byEth = new Map();
const _bySymbol = new Map();

for (const [key, token] of Object.entries(SUPPORTED_TOKENS)) {
  _byVara.set(token.vara.toLowerCase(), token);
  if (token.eth) _byEth.set(token.eth.toLowerCase(), token);
  _bySymbol.set(token.symbol.toUpperCase(), token);
  _bySymbol.set(token.displaySymbol.toUpperCase(), token);
}

export function getTokenBySymbol(symbol) {
  return _bySymbol.get(symbol.toUpperCase()) || null;
}

export function getTokenByVaraAddress(varaAddress) {
  return _byVara.get(varaAddress.toLowerCase()) || null;
}

export function getTokenByEthAddress(ethAddress) {
  return _byEth.get(ethAddress.toLowerCase()) || null;
}

export function resolveTokenAddress(symbolOrAddress) {
  // If it looks like a 0x address, return as-is
  if (symbolOrAddress.startsWith('0x') && symbolOrAddress.length >= 42) {
    return symbolOrAddress;
  }
  // Otherwise treat as symbol and resolve to Vara address
  const token = getTokenBySymbol(symbolOrAddress);
  if (!token) return null;
  return token.vara;
}

export function getAllTokens() {
  return Object.values(SUPPORTED_TOKENS);
}

export function getStablecoins() {
  return getAllTokens().filter(t => t.category === 'stablecoin');
}

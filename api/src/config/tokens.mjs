// Token Registry — all supported tokens with full metadata
// Vara addresses are VFT contract ActorIds on Vara testnet
// ETH addresses are ERC-20 contract addresses on Ethereum testnet (Holesky/Sepolia)

export const SUPPORTED_TOKENS = {
  WUSDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    vara: '0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48',
    eth: '0x263898d2f6f8E153F1e4DD4CAEF86C93784fCf33',
    icon: '/tokens/usdc.svg',
    category: 'stablecoin',
    isStablecoin: true,
    minBuffer: 3600, // seconds of flow required as buffer
  },
  WUSDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    vara: '0x464511231a1afe9108a689ed3dbbb047ca308d6f5dfb86453e4df5612a2d668a',
    eth: '0x7728A33EBEBCfa852cf7f7Fc377BfC87C24a701A',
    icon: '/tokens/usdt.svg',
    category: 'stablecoin',
    isStablecoin: true,
    minBuffer: 3600,
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    vara: '0xba764e2836b28806be10fe6f674d89d1e0c86898d25728f776588f03bddc6f58',
    eth: '0xE0decAa66aED871ac9eb924443D1Bf333Fdb062E',
    icon: '/tokens/weth.svg',
    category: 'volatile',
    isStablecoin: false,
    minBuffer: 3600,
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    vara: '0xc1ec06d99efcffd863f9c2ad2bc76f656aff861acf06f438046c64e5b41e3fd9',
    eth: '0xa56a332d34b2db33ebc41dc0194afd28cb20d19b',
    icon: '/tokens/wbtc.svg',
    category: 'volatile',
    isStablecoin: false,
    minBuffer: 3600,
  },
  GROW: {
    symbol: 'GROW',
    name: 'GrowStreams Token',
    decimals: 18,
    vara: '0x8c3cc925e34285243619fcb07fcd6622a9148426354c144819bf52b93de885bf',
    eth: null,
    icon: '/tokens/grow.svg',
    category: 'utility',
    isStablecoin: false,
    minBuffer: 3600,
  },
  VARA: {
    symbol: 'VARA',
    name: 'Vara',
    decimals: 12,
    vara: 'native',
    eth: null,
    icon: '/tokens/vara.svg',
    category: 'native',
    isStablecoin: false,
    minBuffer: 3600,
  },
};

// Lookup helpers

/** Get token config by symbol (case-insensitive, accepts WUSDC or USDC) */
export function getToken(symbolOrKey) {
  if (!symbolOrKey) return null;
  const upper = symbolOrKey.toUpperCase();
  // Direct key match (WUSDC, WUSDT, WETH, WBTC, VARA)
  if (SUPPORTED_TOKENS[upper]) return { key: upper, ...SUPPORTED_TOKENS[upper] };
  // Match by display symbol (USDC → WUSDC, USDT → WUSDT)
  for (const [key, tok] of Object.entries(SUPPORTED_TOKENS)) {
    if (tok.symbol.toUpperCase() === upper) return { key, ...tok };
  }
  return null;
}

/** Get token config by Vara contract address */
export function getTokenByVaraAddress(varaAddress) {
  if (!varaAddress) return null;
  const lower = varaAddress.toLowerCase();
  for (const [key, tok] of Object.entries(SUPPORTED_TOKENS)) {
    if (tok.vara && tok.vara.toLowerCase() === lower) return { key, ...tok };
  }
  return null;
}

/** Get token config by ETH contract address */
export function getTokenByEthAddress(ethAddress) {
  if (!ethAddress) return null;
  const lower = ethAddress.toLowerCase();
  for (const [key, tok] of Object.entries(SUPPORTED_TOKENS)) {
    if (tok.eth && tok.eth.toLowerCase() === lower) return { key, ...tok };
  }
  return null;
}

/** List all tokens as array */
export function listTokens() {
  return Object.entries(SUPPORTED_TOKENS).map(([key, tok]) => ({ key, ...tok }));
}

/** List only stablecoins */
export function listStablecoins() {
  return listTokens().filter(t => t.isStablecoin);
}

/** Resolve a token identifier (symbol, key, or vara address) to its Vara ActorId */
export function resolveVaraAddress(tokenIdentifier) {
  // If it looks like a hex address, try direct lookup
  if (tokenIdentifier && tokenIdentifier.startsWith('0x') && tokenIdentifier.length > 20) {
    const byAddr = getTokenByVaraAddress(tokenIdentifier);
    if (byAddr) return byAddr.vara;
    // Already a raw address — pass through
    return tokenIdentifier;
  }
  const tok = getToken(tokenIdentifier);
  if (!tok) return null;
  return tok.vara;
}

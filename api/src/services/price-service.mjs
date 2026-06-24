// Price Service - Real-time token pricing from external APIs
// Integrates with CoinGecko for token price data

// CoinGecko API configuration
const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY; // Optional: for higher rate limits

// Token ID mappings for CoinGecko.
// Wrapped/bridged variants map to the same underlying asset id as their base
// token so they get real market prices instead of silently falling back to a
// hardcoded constant (e.g. wVARA must price the same as VARA).
const COINGECKO_TOKEN_IDS = {
  'WETH': 'ethereum',
  'WBTC': 'bitcoin',
  'ETH': 'ethereum',
  'BTC': 'bitcoin',
  'USDC': 'usd-coin',
  'WUSDC': 'usd-coin',
  'USDT': 'tether',
  'WUSDT': 'tether',
  'VARA': 'vara-network',
  'WVARA': 'vara-network', // wrapped VARA — same underlying asset
  'WTVARA': 'vara-network', // internal key for wVARA
  'GVARA': 'vara-network', // grow VARA super token — same underlying asset as VARA
  'GROW': null, // Custom token — no public market yet; reported as unpriced
};

// Fallback prices for tokens with no public market (in USD).
// These are explicit placeholders: any price served from here is tagged
// source:'fallback_constant' so the UI/consumers never mistake it for a live
// market price.
const FALLBACK_PRICES = {
  'GROW': 0.01, // Placeholder — no market; update when GROW lists or a DEX TWAP is wired
};

// Price cache with TTL (15 minutes)
const priceCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Return the CoinGecko asset id for a token symbol, or null if it has no public
 * market mapping. Used by the DeFiLlama adapter endpoint to key balances as
 * `coingecko:<id>`.
 * @param {string} tokenSymbol
 * @returns {string|null}
 */
export function getCoingeckoId(tokenSymbol) {
  if (!tokenSymbol) return null;
  return COINGECKO_TOKEN_IDS[tokenSymbol.toUpperCase()] || null;
}

/**
 * Get real-time price for a token from CoinGecko
 * @param {string} tokenSymbol - Token symbol (e.g., 'ETH', 'BTC')
 * @returns {Promise<number>} Price in USD
 */
export async function getTokenPrice(tokenSymbol) {
  const upperSymbol = tokenSymbol.toUpperCase();

  // Check cache first
  const cached = priceCache.get(upperSymbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.price;
  }

  // Check if we have a CoinGecko mapping
  const coinId = COINGECKO_TOKEN_IDS[upperSymbol];

  if (coinId) {
    try {
      const headers = {};
      if (COINGECKO_API_KEY) {
        headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
      }

      const response = await fetch(
        `${COINGECKO_API_BASE}/simple/price?ids=${coinId}&vs_currencies=usd`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const price = data[coinId]?.usd;

      if (price) {
        // Cache the result
        priceCache.set(upperSymbol, {
          price,
          timestamp: Date.now(),
          source: 'coingecko'
        });
        return price;
      }
    } catch (error) {
      console.warn(`[price-service] Failed to fetch price for ${tokenSymbol}:`, error.message);
    }
  }

  // Fallback to hardcoded prices for custom tokens
  const fallbackPrice = FALLBACK_PRICES[upperSymbol];
  if (fallbackPrice) {
    console.log(`[price-service] Using fallback price for ${tokenSymbol}: $${fallbackPrice}`);
    return fallbackPrice;
  }

  // If no price available, return null
  console.warn(`[price-service] No price available for ${tokenSymbol}`);
  return null;
}

/**
 * Get prices for multiple tokens in a single batch request
 * @param {string[]} tokenSymbols - Array of token symbols
 * @returns {Promise<Object>} Map of symbol to price
 */
export async function getBatchPrices(tokenSymbols) {
  const detailed = await getBatchPricesDetailed(tokenSymbols);
  // Backwards-compatible plain map: symbol -> price number. Keys are stored in
  // both the original casing and uppercase so callers using either resolve.
  const prices = {};
  for (const [symbol, info] of Object.entries(detailed)) {
    if (info.price != null) {
      prices[symbol] = info.price;
      prices[symbol.toUpperCase()] = info.price;
    }
  }
  return prices;
}

/**
 * Like getBatchPrices but returns, per original-cased symbol, an object
 * { price, source } where source is 'coingecko' | 'fallback_constant' | 'unpriced'.
 * This lets callers report truthfully whether a price is a live market quote or
 * a placeholder constant.
 * @param {string[]} tokenSymbols
 * @returns {Promise<Record<string, {price: number|null, source: string}>>}
 */
export async function getBatchPricesDetailed(tokenSymbols) {
  const result = {};
  const coinIds = new Set();
  const symbolToCoinId = {}; // original-cased symbol -> coinId

  for (const symbol of tokenSymbols) {
    const upperSymbol = symbol.toUpperCase();
    const coinId = COINGECKO_TOKEN_IDS[upperSymbol];

    // Check cache first — use fresh entry without making an API call.
    const cached = priceCache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      result[symbol] = { price: cached.price, source: cached.source };
      continue;
    }

    if (coinId) {
      coinIds.add(coinId);
      symbolToCoinId[symbol] = coinId;
      // Pre-populate with stale cache so a failed API call still returns something.
      result[symbol] = cached
        ? { price: cached.price, source: cached.source }
        : { price: null, source: 'unpriced' };
    } else {
      const fallbackPrice = FALLBACK_PRICES[upperSymbol];
      result[symbol] = fallbackPrice != null
        ? { price: fallbackPrice, source: 'fallback_constant' }
        : { price: null, source: 'unpriced' };
    }
  }

  if (coinIds.size > 0) {
    try {
      const headers = {};
      if (COINGECKO_API_KEY) {
        headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
      }

      const response = await fetch(
        `${COINGECKO_API_BASE}/simple/price?ids=${[...coinIds].join(',')}&vs_currencies=usd`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        for (const [symbol, coinId] of Object.entries(symbolToCoinId)) {
          const price = data[coinId]?.usd;
          if (price != null) {
            result[symbol] = { price, source: 'coingecko' };
            priceCache.set(symbol.toUpperCase(), { price, timestamp: Date.now(), source: 'coingecko' });
          }
        }
      } else {
        console.warn(`[price-service] CoinGecko batch returned ${response.status}`);
      }
    } catch (error) {
      console.warn(`[price-service] Batch price fetch failed:`, error.message);
    }
  }

  return result;
}

/**
 * Clear the price cache (useful for testing or force refresh)
 */
export function clearPriceCache() {
  priceCache.clear();
}

/**
 * Get cache statistics
 */
export function getPriceCacheStats() {
  return {
    size: priceCache.size,
    entries: Array.from(priceCache.entries()).map(([symbol, data]) => ({
      symbol,
      price: data.price,
      age: Date.now() - data.timestamp,
      source: data.source
    }))
  };
}

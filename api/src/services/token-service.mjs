// ---------------------------------------------------------------------------
// Token service — VFT balance queries, approval helpers, price lookups
// ---------------------------------------------------------------------------

import { query, encodePayload } from '../sails-client.mjs';
import {
  SUPPORTED_TOKENS,
  getTokenBySymbol,
  getTokenByVaraAddress,
  getAllTokens,
} from '../config/tokens.mjs';
import { toDisplayUnits } from '../utils/decimals.mjs';

// We use a lightweight in-memory price cache (refreshed every 5 min)
let priceCache = {};
let priceCacheTime = 0;
const PRICE_CACHE_TTL = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// VFT on-chain queries via sails-client
// ---------------------------------------------------------------------------

/**
 * Query a VFT token contract for the balance of `owner`.
 * VFT standard method: BalanceOf(owner) → u128
 */
export async function getVFTBalance(tokenSymbol, ownerActorId) {
  const token = getTokenBySymbol(tokenSymbol);
  if (!token) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (token.category === 'native') {
    // For native VARA, we'd need to query via GearApi — skip for now
    return { raw: '0', display: '0', symbol: token.displaySymbol, decimals: token.decimals };
  }

  try {
    // VFT contracts expose VftService.BalanceOf
    // We need to query the VFT contract directly. Since it's a separate program,
    // we construct the query manually using the token's Vara address.
    const result = await query('growToken', 'BalanceOf', ownerActorId);
    const raw = typeof result === 'bigint' ? result.toString() : String(result || '0');
    return {
      raw,
      display: toDisplayUnits(raw, token.decimals),
      symbol: token.displaySymbol,
      decimals: token.decimals,
    };
  } catch (err) {
    console.warn(`[token-service] Failed to query VFT balance for ${tokenSymbol}: ${err.message}`);
    return { raw: '0', display: '0', symbol: token.displaySymbol, decimals: token.decimals };
  }
}

/**
 * Get vault balance for a specific owner + token.
 */
export async function getVaultBalance(ownerActorId, tokenSymbol) {
  const token = getTokenBySymbol(tokenSymbol);
  if (!token) throw new Error(`Unknown token: ${tokenSymbol}`);

  try {
    const result = await query('tokenVault', 'GetBalance', ownerActorId, token.vara);
    const raw = result || {};
    return {
      token: token.symbol,
      displaySymbol: token.displaySymbol,
      owner: ownerActorId,
      totalDeposited: toDisplayUnits(raw.totalDeposited ?? raw.total_deposited ?? 0, token.decimals),
      totalAllocated: toDisplayUnits(raw.totalAllocated ?? raw.total_allocated ?? 0, token.decimals),
      available: toDisplayUnits(raw.available ?? raw.Available ?? 0, token.decimals),
      rawTotalDeposited: String(raw.totalDeposited ?? raw.total_deposited ?? 0),
      rawTotalAllocated: String(raw.totalAllocated ?? raw.total_allocated ?? 0),
      rawAvailable: String(raw.available ?? raw.Available ?? 0),
      decimals: token.decimals,
    };
  } catch (err) {
    console.warn(`[token-service] Failed to query vault balance for ${tokenSymbol}: ${err.message}`);
    return {
      token: token.symbol,
      displaySymbol: token.displaySymbol,
      owner: ownerActorId,
      totalDeposited: '0',
      totalAllocated: '0',
      available: '0',
      rawTotalDeposited: '0',
      rawTotalAllocated: '0',
      rawAvailable: '0',
      decimals: token.decimals,
    };
  }
}

/**
 * Get vault balances for ALL supported tokens for a given owner.
 */
export async function getAllVaultBalances(ownerActorId) {
  const tokens = getAllTokens();
  const balances = [];

  for (const token of tokens) {
    try {
      const bal = await getVaultBalance(ownerActorId, token.symbol);
      balances.push(bal);
    } catch {
      balances.push({
        token: token.symbol,
        displaySymbol: token.displaySymbol,
        owner: ownerActorId,
        totalDeposited: '0',
        totalAllocated: '0',
        available: '0',
        rawTotalDeposited: '0',
        rawTotalAllocated: '0',
        rawAvailable: '0',
        decimals: token.decimals,
      });
    }
  }

  return balances;
}

/**
 * Generate an approval payload for a VFT token.
 * VFT standard method: Approve(spender, amount)
 */
export function generateApprovalPayload(tokenSymbol, spenderActorId, rawAmount) {
  const token = getTokenBySymbol(tokenSymbol);
  if (!token) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (token.category === 'native') throw new Error('Cannot approve native VARA');

  // Encode VftService.Approve(spender, amount)
  // This needs to be sent to the VFT contract (token.vara) directly
  return {
    programId: token.vara,
    service: 'VftService',
    method: 'Approve',
    args: [spenderActorId, rawAmount],
  };
}

// ---------------------------------------------------------------------------
// Price data (optional, for display purposes)
// ---------------------------------------------------------------------------

export async function fetchPrices() {
  if (Date.now() - priceCacheTime < PRICE_CACHE_TTL && Object.keys(priceCache).length > 0) {
    return priceCache;
  }

  try {
    const ids = getAllTokens()
      .filter(t => t.coingeckoId)
      .map(t => t.coingeckoId)
      .join(',');

    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (resp.ok) {
      const data = await resp.json();
      const prices = {};
      for (const token of getAllTokens()) {
        const priceData = data[token.coingeckoId];
        prices[token.symbol] = priceData?.usd ?? null;
      }
      priceCache = prices;
      priceCacheTime = Date.now();
    }
  } catch (err) {
    console.warn(`[token-service] Price fetch failed: ${err.message}`);
  }

  return priceCache;
}

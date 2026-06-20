/*
 * GrowStreams — streaming VOLUME adapter for DeFiLlama (dimension-adapters repo)
 * Chain: Vara Network (Gear Protocol, Substrate-based)
 *
 * ── Architecture (intentional) ──────────────────────────────────────────────
 * The GrowStreams backend is the SOURCE OF TRUTH for streaming volume: it reads
 * StreamCore contract state with the chain-native Sails/Gear stack and returns a
 * normalized, token-keyed result. This adapter is a thin PRESENTATION layer that
 * fetches that result and maps it into DeFiLlama's dimension schema.
 *
 * Why not decode on-chain here: StreamCore returns `Option<Stream>` structs.
 * Hand-rolling SCALE decoding for nested Gear types in the adapter proved
 * fragile (it mis-parsed non-existent streams as real). Per DeFiLlama's
 * dimensions guidance, adapters may collect data via endpoint calls; doing the
 * decode server-side with the trusted stack is the reliable, reviewable path.
 *
 * Volume model: GrowStreams streaming is continuous, so the backend returns the
 * CUMULATIVE value streamed to date (sum of each stream's live `streamed`
 * amount), keyed by CoinGecko asset id (gVARA/wVARA priced as VARA). We report
 * it as `totalVolume`; DeFiLlama derives daily volume from the change in that
 * cumulative figure between runs. Values are token amounts (raw, decimal-
 * adjusted) — NOT pre-converted USD — so DeFiLlama prices them.
 */

const axios = require("axios");

const GROWSTREAMS_API =
  "https://growstreams-api-v3-production.up.railway.app/api/analytics";

// Earliest date GrowStreams streaming was live on Vara mainnet (adapter start).
const START_TIMESTAMP = 1747094400; // 2025-05-13 (mainnet contract deploy)

async function fetch() {
  // The backend computes volume from authoritative on-chain StreamCore state.
  // Response shape:
  //   { totalVolume: { "coingecko:vara-network": "<tokenUnits>" }, ... }
  const { data } = await axios.get(`${GROWSTREAMS_API}/defillama-volume`);
  const totalVolume = (data && data.totalVolume) || {};

  // Report cumulative streamed value as both daily and total volume keyed by
  // coin. Token amounts only (no USD) — DeFiLlama handles pricing.
  return {
    dailyVolume: totalVolume,
    totalVolume,
  };
}

module.exports = {
  version: 1, // current-snapshot source (backend reads live chain state, not arbitrary ranges)
  methodology:
    "Streaming volume is the cumulative value streamed through the GrowStreams protocol on Vara, " +
    "computed server-side from authoritative StreamCore contract state (sum of each stream's live " +
    "`streamed` amount, settled + accrued) using the chain-native Sails/Gear stack. The StreamCore " +
    "contract emits no events, so the backend reconstructs volume from on-chain state and exposes it " +
    "token-keyed (gVARA/wVARA as VARA); this adapter transports that normalized result into DeFiLlama. " +
    "Daily volume is derived from the change in cumulative streamed value between runs.",
  vara: {
    fetch,
    start: START_TIMESTAMP,
    runAtCurrTime: true,
  },
};

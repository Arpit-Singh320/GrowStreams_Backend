# GrowStreams — DeFiLlama adapters (staging)

This folder stages two GrowStreams adapters for DeFiLlama:

| Adapter | Dir | Target repo | Approach |
|---------|-----|-------------|----------|
| **TVL** | `growstreams/` | [DefiLlama-Adapters](https://github.com/DefiLlama/DefiLlama-Adapters) | Direct on-chain read (axios + raw RPC) |
| **Volume** | `growstreams-volume/` | [dimension-adapters](https://github.com/DefiLlama/dimension-adapters) | Backend endpoint (chain decoded server-side) |

## Why two different approaches
- **TVL** = a simple `BalanceOf(vault) -> u128` read. Hand-rolled SCALE decoding
  of a trailing u128 is trivial and reliable, so the TVL adapter reads the chain
  directly (the standard expected by the TVL repo).
- **Volume** = requires reading `GetStream(id) -> Option<Stream>`, a nested Gear
  struct. Hand-rolling SCALE for nested types in the adapter proved fragile (it
  mis-parsed non-existent streams as real). DeFiLlama's dimensions guidance
  allows adapters to collect data via endpoint calls, so the volume adapter is a
  thin wrapper over the backend, which decodes StreamCore state with the trusted
  chain-native Sails/Gear stack. Backend = source of truth; adapter = transport.

## TVL adapter (`growstreams/index.js`)
Reports the TVL of the GrowStreams TokenVault on **Vara mainnet**, denominated in
VARA. Reads on-chain balances directly from the Vara RPC
(`gear_calculateReplyForHandle`) — no project API, no `@polkadot/api`, only
`axios` + `bignumber.js` (both already DeFiLlama-standard deps).

## TVL methodology
GrowStreams streams value using two VARA wrappers:
- **gVARA** — native super-token wrapper (the streaming token), `SuperTokenService`
- **wVARA** — Ethereum-bridged wrapped VARA, `Vft`

Both are economically VARA. The adapter reads each wrapper's `BalanceOf(vault)`
and sums them, reported under `coingecko:vara-network`. Native idle VARA is
intentionally excluded so TVL reflects streamed/wrapped value only.

## How the on-chain read works (no polkadot.js)
1. Build a Sails query payload: `[compact-len + serviceName][compact-len + "BalanceOf"][32-byte vault actor_id]`.
2. POST `gear_calculateReplyForHandle` to `https://rpc.vara.network` with a zero
   origin (read-only), the vault as the account argument.
3. Decode the reply: the trailing 16 bytes are the `u128` balance, little-endian.

Verified locally against mainnet:
```
gVARA: 0 VARA
wVARA: 189.801937500022 VARA
=> { "coingecko:vara-network": "189.801937500022" }
```

## Volume adapter (`growstreams-volume/index.js`)
Reports cumulative streaming volume on Vara, denominated in VARA. Thin wrapper:
calls the backend `GET /api/analytics/defillama-volume`, which computes volume
from authoritative StreamCore state (sum of each stream's live `streamed` amount,
settled + accrued) using the Sails/Gear stack. Returns `dailyVolume`/`totalVolume`
keyed by `coingecko:vara-network` — token amounts only, NOT USD (DeFiLlama prices
them). `version: 1` (current-snapshot source — the backend reads live chain state,
not arbitrary historical ranges); DeFiLlama derives daily volume from the change
in cumulative volume between runs.

Verified against the backend endpoint:
```
{ "dailyVolume": { "coingecko:vara-network": "60" },
  "totalVolume": { "coingecko:vara-network": "60" } }
```

> Dependency: the volume adapter needs the backend `/api/analytics/defillama-volume`
> endpoint deployed to production (`growstreams-api-v3-production.up.railway.app`).
> It exists in the codebase but must be deployed before the adapter returns data.

## To submit
**TVL** (when TVL is meaningful — DeFiLlama won't show dust):
1. Fork DefiLlama-Adapters, copy `growstreams/` to `projects/growstreams/`.
2. `node test.js projects/growstreams/index.js` — confirm non-zero balances.
3. Open PR with the metadata below; enable "Allow edits by maintainers".
4. Do NOT edit `pnpm-lock.yaml` or add npm deps.

**Volume** (after the backend endpoint is deployed to production):
1. Fork dimension-adapters, copy `growstreams-volume/` to `dexs/growstreams/`
   (or the appropriate dimension category).
2. Test per the dimension-adapters repo instructions.
3. Open PR; methodology is in the adapter's `methodology` field.

## PR metadata (new listing)
- **Name:** GrowStreams
- **Chain:** Vara
- **Website:** https://growstreams.xyz
- **Twitter:** (fill in)
- **Audit links:** (fill in if any)
- **Logo:** (high-res, rounded)
- **Category:** Payments (streaming) — confirm against defillama.com/categories
- **Coingecko ID:** vara-network (for the locked asset)
- **Token address & ticker:** GROW `0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163` (utility; not counted in TVL)
- **Oracle:** CoinGecko (vara-network price); balances are read on-chain
- **methodology:** see above / the `methodology` field in index.js
- **Short description:** Token streaming protocol on Vara Network — stream VARA via gVARA/wVARA wrappers.
- **Treasury addresses:** TokenVault `0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef`

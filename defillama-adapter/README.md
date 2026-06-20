# GrowStreams — DeFiLlama TVL adapter (staging)

This folder stages the GrowStreams TVL adapter for submission to
[DefiLlama/DefiLlama-Adapters](https://github.com/DefiLlama/DefiLlama-Adapters).

## What it does
`growstreams/index.js` reports the TVL of the GrowStreams TokenVault on **Vara
mainnet**, denominated in VARA. It reads on-chain balances directly from the
Vara RPC (`gear_calculateReplyForHandle`) — no project API, no `@polkadot/api`,
only `axios` + `bignumber.js` (both already DeFiLlama-standard deps).

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

## To submit (when TVL is meaningful)
1. Fork DefiLlama-Adapters, copy `growstreams/` to `projects/growstreams/`.
2. `node test.js projects/growstreams/index.js` — confirm non-zero balances.
3. Open PR with the metadata below; enable "Allow edits by maintainers".
4. Do NOT edit `pnpm-lock.yaml` or add npm deps.

> Note: hold the PR until real deposits push TVL above DeFiLlama's display
> threshold — the directory does not show dust. Volume is a SEPARATE adapter in
> the `dimension-adapters` repo and depends on the backend event indexer (Task C).

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

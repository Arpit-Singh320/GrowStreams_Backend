// gVARA super-token routes — wrap wVARA ↔ gVARA
// Uses the same super-token IDL/contract but with the gvaraToken instance

import { Router } from 'express';
import { query, command, encodePayload } from '../sails-client.mjs';
import { toDisplayUnits, toBaseUnits } from '../utils/decimals.mjs';
import { toActorId } from '../utils/actor-id.mjs';

const router = Router();
const C = 'gvaraToken'; // sails-client key for gVARA super-token instance

const GVARA_DECIMALS = 12;

function toBigIntStr(v) {
  if (v == null) return '0';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object' && v !== null) {
    if (typeof v.toBigInt === 'function') return v.toBigInt().toString();
    if (typeof v.toJSON === 'function') return String(v.toJSON());
    if (typeof v.toString === 'function') return v.toString();
  }
  return String(v);
}

// GET /api/gvara/meta
router.get('/meta', async (req, res, next) => {
  try {
    const result = await query(C, 'GetMeta');
    const r = result || {};
    res.json({
      name: r.name || 'GrowStreams VARA',
      symbol: r.symbol || 'gVARA',
      decimals: r.decimals ?? GVARA_DECIMALS,
      underlying_token: r.underlying_token ?? null,
      total_supply: toBigIntStr(r.total_supply),
      total_supply_display: toDisplayUnits(toBigIntStr(r.total_supply), GVARA_DECIMALS),
    });
  } catch (err) { next(err); }
});

// GET /api/gvara/balance/:account
router.get('/balance/:account', async (req, res, next) => {
  try {
    const accountHex = toActorId(req.params.account);
    const [bal, staticBal, flowRate] = await Promise.all([
      query(C, 'BalanceOf', accountHex),
      query(C, 'StaticBalanceOf', accountHex),
      query(C, 'NetFlowRate', accountHex),
    ]);
    const balance = toBigIntStr(bal);
    const static_balance = toBigIntStr(staticBal);
    const net_flow_rate = toBigIntStr(flowRate);
    res.json({
      account: req.params.account,
      balance,
      balance_display: toDisplayUnits(balance, GVARA_DECIMALS),
      static_balance,
      static_balance_display: toDisplayUnits(static_balance, GVARA_DECIMALS),
      net_flow_rate,
    });
  } catch (err) { next(err); }
});

// POST /api/gvara/wrap-native
// Wrap native VARA → gVARA (1:1). Send VARA value with the tx.
// Body: { amount (human-readable VARA), mode? }
// The `value` field in the response must be attached as the VARA value when signing.
router.post('/wrap-native', async (req, res, next) => {
  try {
    const { amount, amountRaw, mode } = req.body;
    if (!amount && !amountRaw) return res.status(400).json({ error: 'Missing: amount or amountRaw' });

    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : toBaseUnits(amount, GVARA_DECIMALS);

    // WrapNative takes no arguments — VARA value is attached to the message
    const payload = encodePayload(C, 'WrapNative');
    if (mode === 'payload') {
      return res.json({ payload, value: baseAmount.toString() });
    }

    const { result, blockHash } = await command(C, 'WrapNative');
    res.status(201).json({ wrapped: baseAmount.toString(), blockHash });
  } catch (err) { next(err); }
});

// POST /api/gvara/unwrap-native
// Unwrap gVARA → native VARA. Burns gVARA and returns VARA.
// Body: { amount (human-readable gVARA), mode? }
router.post('/unwrap-native', async (req, res, next) => {
  try {
    const { amount, amountRaw, mode } = req.body;
    if (!amount && !amountRaw) return res.status(400).json({ error: 'Missing: amount or amountRaw' });

    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : toBaseUnits(amount, GVARA_DECIMALS);

    const payload = encodePayload(C, 'UnwrapNative', baseAmount);
    if (mode === 'payload') {
      return res.json({ payload });
    }

    const { result, blockHash } = await command(C, 'UnwrapNative', baseAmount);
    res.json({ unwrapped: baseAmount.toString(), blockHash });
  } catch (err) { next(err); }
});

export default router;

import { Router } from 'express';
import { query, command, encodePayload } from '../sails-client.mjs';
import { toDisplayUnits, toBaseUnits } from '../utils/decimals.mjs';
import { toActorId } from '../utils/actor-id.mjs';

const router = Router();
const C = 'wvara';
const DECIMALS = 12;

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

// GET /api/wvara/meta
router.get('/meta', async (req, res, next) => {
  try {
    const meta = await query(C, 'GetMeta');
    res.json({
      name: String(meta.name),
      symbol: String(meta.symbol),
      decimals: Number(meta.decimals),
      totalSupply: toBigIntStr(meta.total_supply ?? meta.totalSupply),
      totalSupplyDisplay: toDisplayUnits(toBigIntStr(meta.total_supply ?? meta.totalSupply), DECIMALS),
    });
  } catch (err) { next(err); }
});

// GET /api/wvara/balance/:address
router.get('/balance/:address', async (req, res, next) => {
  try {
    const addrHex = toActorId(req.params.address);
    const raw = await query(C, 'BalanceOf', addrHex);
    const balance = toBigIntStr(raw);
    res.json({
      address: req.params.address,
      balance,
      balanceDisplay: toDisplayUnits(balance, DECIMALS),
    });
  } catch (err) { next(err); }
});

// GET /api/wvara/allowance/:owner/:spender
router.get('/allowance/:owner/:spender', async (req, res, next) => {
  try {
    const ownerHex = toActorId(req.params.owner);
    const spenderHex = toActorId(req.params.spender);
    const raw = await query(C, 'Allowance', ownerHex, spenderHex);
    res.json({ allowance: toBigIntStr(raw) });
  } catch (err) { next(err); }
});

// POST /api/wvara/wrap
// Body: { amount: "10.5" } or { amountRaw: "10500000000000" } or { mode: "payload" }
// NOTE: The actual VARA value must be attached to the on-chain tx — payload mode returns
//       the encoded call bytes; the frontend attaches the VARA value when signing.
router.post('/wrap', async (req, res, next) => {
  try {
    const { amount, amountRaw, mode } = req.body;
    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : amount ? toBaseUnits(amount, DECIMALS) : null;

    if (mode === 'payload') {
      return res.json({
        payload: encodePayload(C, 'Wrap'),
        value: baseAmount ? baseAmount.toString() : '0',
        note: 'Attach the VARA value equal to the amount you want to wrap when signing the transaction',
      });
    }

    if (!baseAmount || baseAmount <= 0n) {
      return res.status(400).json({ error: 'Missing: amount or amountRaw' });
    }

    const { result, blockHash } = await command(C, 'Wrap');
    res.status(201).json({
      wrapped: baseAmount.toString(),
      wrappedDisplay: toDisplayUnits(baseAmount, DECIMALS),
      blockHash,
    });
  } catch (err) { next(err); }
});

// POST /api/wvara/unwrap
// Body: { amount: "10.5" } or { amountRaw: "10500000000000" } or { mode: "payload" }
router.post('/unwrap', async (req, res, next) => {
  try {
    const { amount, amountRaw, mode } = req.body;
    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : amount ? toBaseUnits(amount, DECIMALS) : null;

    if (!baseAmount || baseAmount <= 0n) {
      return res.status(400).json({ error: 'Missing: amount or amountRaw' });
    }

    if (mode === 'payload') {
      return res.json({
        payload: encodePayload(C, 'Unwrap', baseAmount),
        note: 'Sign and send to burn wVARA and receive native VARA back',
      });
    }

    const { result, blockHash } = await command(C, 'Unwrap', baseAmount);
    res.json({
      unwrapped: baseAmount.toString(),
      unwrappedDisplay: toDisplayUnits(baseAmount, DECIMALS),
      blockHash,
    });
  } catch (err) { next(err); }
});

// POST /api/wvara/approve
// Body: { spender, amount } or { mode: "payload" }
router.post('/approve', async (req, res, next) => {
  try {
    const { spender, amount, amountRaw, mode } = req.body;
    if (!spender || (!amount && !amountRaw)) {
      return res.status(400).json({ error: 'Missing: spender, amount' });
    }
    const spenderHex = toActorId(spender);
    const baseAmount = amountRaw ? BigInt(amountRaw) : toBaseUnits(amount, DECIMALS);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Approve', spenderHex, baseAmount) });
    }

    const { result, blockHash } = await command(C, 'Approve', spenderHex, baseAmount);
    res.json({ spender, amount: baseAmount.toString(), blockHash });
  } catch (err) { next(err); }
});

// POST /api/wvara/transfer
// Body: { to, amount } or { mode: "payload" }
router.post('/transfer', async (req, res, next) => {
  try {
    const { to, amount, amountRaw, mode } = req.body;
    if (!to || (!amount && !amountRaw)) {
      return res.status(400).json({ error: 'Missing: to, amount' });
    }
    const toHex = toActorId(to);
    const baseAmount = amountRaw ? BigInt(amountRaw) : toBaseUnits(amount, DECIMALS);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Transfer', toHex, baseAmount) });
    }

    const { result, blockHash } = await command(C, 'Transfer', toHex, baseAmount);
    res.json({ to, amount: baseAmount.toString(), blockHash });
  } catch (err) { next(err); }
});

export default router;

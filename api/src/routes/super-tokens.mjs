import { Router } from 'express';
import { query, command, encodePayload } from '../sails-client.mjs';
import { toDisplayUnits, toBaseUnits } from '../utils/decimals.mjs';
import { toActorId } from '../utils/actor-id.mjs';

const router = Router();

const C = 'superToken';

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

function serializeDeep(obj, seen = new WeakSet()) {
  if (obj == null) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (typeof obj === 'object') {
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);
    if (typeof obj.toJSON === 'function') {
      const json = obj.toJSON();
      if (json !== obj) return serializeDeep(json, seen);
    }
    if (Array.isArray(obj)) return obj.map(v => serializeDeep(v, seen));
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = serializeDeep(v, seen);
    return out;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// GET /api/super-tokens/meta
// Returns token name, symbol, decimals, underlying, admin, total_supply etc.
// ---------------------------------------------------------------------------
router.get('/meta', async (req, res, next) => {
  try {
    const result = await query(C, 'GetMeta');
    res.json(serializeDeep(result));
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/super-tokens/paused
// ---------------------------------------------------------------------------
router.get('/paused', async (req, res, next) => {
  try {
    const result = await query(C, 'IsPaused');
    res.json({ paused: result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/super-tokens/supply
// ---------------------------------------------------------------------------
router.get('/supply', async (req, res, next) => {
  try {
    const result = await query(C, 'TotalSupply');
    res.json({ total_supply: toBigIntStr(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/super-tokens/balance/:account
// Returns real-time balance (accounts for live flow accrual).
// ---------------------------------------------------------------------------
router.get('/balance/:account', async (req, res, next) => {
  try {
    const accountHex = toActorId(req.params.account);
    const [realtimeBal, staticBal, flowRate, accountState] = await Promise.all([
      query(C, 'BalanceOf', accountHex),
      query(C, 'StaticBalanceOf', accountHex),
      query(C, 'NetFlowRate', accountHex),
      query(C, 'GetAccountState', accountHex),
    ]);

    const decimals = req.query.decimals ? parseInt(req.query.decimals, 10) : null;

    const response = {
      account: req.params.account,
      balance: toBigIntStr(realtimeBal),
      static_balance: toBigIntStr(staticBal),
      net_flow_rate: toBigIntStr(flowRate),
      flow_updated_at: toBigIntStr(accountState?.flow_updated_at ?? 0),
    };

    if (decimals != null) {
      response.balance_display = toDisplayUnits(response.balance, decimals);
      response.static_balance_display = toDisplayUnits(response.static_balance, decimals);
      // Flow rate per month (30d) for human display
      const ratePerMonth = BigInt(response.net_flow_rate) * 2592000n;
      response.flow_rate_per_month_display = toDisplayUnits(
        ratePerMonth < 0n ? (-ratePerMonth).toString() : ratePerMonth.toString(),
        decimals
      );
      response.flow_rate_direction = BigInt(response.net_flow_rate) >= 0n ? 'incoming' : 'outgoing';
    }

    res.json(response);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/super-tokens/flow-controller/:account
// ---------------------------------------------------------------------------
router.get('/flow-controller/:account', async (req, res, next) => {
  try {
    const accountHex = toActorId(req.params.account);
    const result = await query(C, 'IsFlowController', accountHex);
    res.json({ account: req.params.account, is_flow_controller: result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/super-tokens/allowance/:owner/:spender
// ---------------------------------------------------------------------------
router.get('/allowance/:owner/:spender', async (req, res, next) => {
  try {
    const ownerHex = toActorId(req.params.owner);
    const spenderHex = toActorId(req.params.spender);
    const result = await query(C, 'Allowance', ownerHex, spenderHex);
    res.json({ owner: req.params.owner, spender: req.params.spender, allowance: toBigIntStr(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/wrap
// Body: { amount, amountRaw?, mode? }
// Wrap underlying VFT → Super Token.
// ---------------------------------------------------------------------------
router.post('/wrap', async (req, res, next) => {
  try {
    const { amount, amountRaw, decimals, mode } = req.body;
    if (!amount && !amountRaw) return res.status(400).json({ error: 'Missing: amount or amountRaw' });

    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : decimals != null
        ? toBaseUnits(amount, parseInt(decimals, 10))
        : BigInt(amount);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Wrap', baseAmount) });
    }

    const { result, blockHash } = await command(C, 'Wrap', baseAmount);
    res.status(201).json({ wrapped: baseAmount.toString(), blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/unwrap
// Body: { amount, amountRaw?, decimals?, mode? }
// ---------------------------------------------------------------------------
router.post('/unwrap', async (req, res, next) => {
  try {
    const { amount, amountRaw, decimals, mode } = req.body;
    if (!amount && !amountRaw) return res.status(400).json({ error: 'Missing: amount or amountRaw' });

    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : decimals != null
        ? toBaseUnits(amount, parseInt(decimals, 10))
        : BigInt(amount);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Unwrap', baseAmount) });
    }

    const { result, blockHash } = await command(C, 'Unwrap', baseAmount);
    res.json({ unwrapped: baseAmount.toString(), blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/wrap-native
// Native VARA → gVARA. Pass value in body for payload mode.
// ---------------------------------------------------------------------------
router.post('/wrap-native', async (req, res, next) => {
  try {
    const { mode } = req.body;
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'WrapNative') });
    }
    const { result, blockHash } = await command(C, 'WrapNative');
    res.status(201).json({ blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/unwrap-native
// Body: { amount, mode? }
// ---------------------------------------------------------------------------
router.post('/unwrap-native', async (req, res, next) => {
  try {
    const { amount, mode } = req.body;
    if (!amount) return res.status(400).json({ error: 'Missing: amount' });
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'UnwrapNative', BigInt(amount)) });
    }
    const { result, blockHash } = await command(C, 'UnwrapNative', BigInt(amount));
    res.json({ unwrapped: amount, blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/transfer
// Body: { to, amount, amountRaw?, decimals?, mode? }
// ---------------------------------------------------------------------------
router.post('/transfer', async (req, res, next) => {
  try {
    const { to, amount, amountRaw, decimals, mode } = req.body;
    if (!to || (!amount && !amountRaw)) return res.status(400).json({ error: 'Missing: to, amount' });

    const toHex = toActorId(to);
    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : decimals != null
        ? toBaseUnits(amount, parseInt(decimals, 10))
        : BigInt(amount);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Transfer', toHex, baseAmount) });
    }

    const { result, blockHash } = await command(C, 'Transfer', toHex, baseAmount);
    res.json({ to, amount: baseAmount.toString(), blockHash, success: result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/approve
// Body: { spender, amount, amountRaw?, decimals?, mode? }
// ---------------------------------------------------------------------------
router.post('/approve', async (req, res, next) => {
  try {
    const { spender, amount, amountRaw, decimals, mode } = req.body;
    if (!spender || (!amount && !amountRaw)) return res.status(400).json({ error: 'Missing: spender, amount' });

    const spenderHex = toActorId(spender);
    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : decimals != null
        ? toBaseUnits(amount, parseInt(decimals, 10))
        : BigInt(amount);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Approve', spenderHex, baseAmount) });
    }

    const { result, blockHash } = await command(C, 'Approve', spenderHex, baseAmount);
    res.json({ spender, amount: baseAmount.toString(), blockHash, success: result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/update-flow
// Body: { sender, receiver, delta, is_increase, deltaRaw?, decimals?, mode? }
// Called by stream-core integration or admin tooling.
// ---------------------------------------------------------------------------
router.post('/update-flow', async (req, res, next) => {
  try {
    const { sender, receiver, delta, deltaRaw, decimals, is_increase, mode } = req.body;
    if (!sender || !receiver || (!delta && !deltaRaw)) {
      return res.status(400).json({ error: 'Missing: sender, receiver, delta' });
    }

    const senderHex = toActorId(sender);
    const receiverHex = toActorId(receiver);
    const baseDelta = deltaRaw
      ? BigInt(deltaRaw)
      : decimals != null
        ? toBaseUnits(delta, parseInt(decimals, 10))
        : BigInt(delta);
    const increase = is_increase !== false && is_increase !== 'false';

    if (mode === 'payload') {
      return res.json({
        payload: encodePayload(C, 'UpdateFlow', senderHex, receiverHex, baseDelta, increase),
      });
    }

    const { result, blockHash } = await command(C, 'UpdateFlow', senderHex, receiverHex, baseDelta, increase);
    res.json({ sender, receiver, delta: baseDelta.toString(), is_increase: increase, blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/settle
// Body: { account, mode? }
// Manually materialise accrued flow into static_balance.
// ---------------------------------------------------------------------------
router.post('/settle', async (req, res, next) => {
  try {
    const { account, mode } = req.body;
    if (!account) return res.status(400).json({ error: 'Missing: account' });
    const accountHex = toActorId(account);
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'SettleAccount', accountHex) });
    }
    const { blockHash } = await command(C, 'SettleAccount', accountHex);
    res.json({ account, settled: true, blockHash });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/mint  (Pure token mode — admin only)
// Body: { to, amount, amountRaw?, decimals?, mode? }
// ---------------------------------------------------------------------------
router.post('/mint', async (req, res, next) => {
  try {
    const { to, amount, amountRaw, decimals, mode } = req.body;
    if (!to || (!amount && !amountRaw)) return res.status(400).json({ error: 'Missing: to, amount' });

    const toHex = toActorId(to);
    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : decimals != null
        ? toBaseUnits(amount, parseInt(decimals, 10))
        : BigInt(amount);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Mint', toHex, baseAmount) });
    }

    const { result, blockHash } = await command(C, 'Mint', toHex, baseAmount);
    res.status(201).json({ to, minted: baseAmount.toString(), blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/burn
// Body: { amount, amountRaw?, decimals?, mode? }
// ---------------------------------------------------------------------------
router.post('/burn', async (req, res, next) => {
  try {
    const { amount, amountRaw, decimals, mode } = req.body;
    if (!amount && !amountRaw) return res.status(400).json({ error: 'Missing: amount' });

    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : decimals != null
        ? toBaseUnits(amount, parseInt(decimals, 10))
        : BigInt(amount);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Burn', baseAmount) });
    }

    const { result, blockHash } = await command(C, 'Burn', baseAmount);
    res.json({ burned: baseAmount.toString(), blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/add-flow-controller  (admin)
// Body: { controller, mode? }
// ---------------------------------------------------------------------------
router.post('/add-flow-controller', async (req, res, next) => {
  try {
    const { controller, mode } = req.body;
    if (!controller) return res.status(400).json({ error: 'Missing: controller' });
    const hex = toActorId(controller);
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'AddFlowController', hex) });
    }
    const { result, blockHash } = await command(C, 'AddFlowController', hex);
    res.json({ controller, blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/remove-flow-controller  (admin)
// Body: { controller, mode? }
// ---------------------------------------------------------------------------
router.post('/remove-flow-controller', async (req, res, next) => {
  try {
    const { controller, mode } = req.body;
    if (!controller) return res.status(400).json({ error: 'Missing: controller' });
    const hex = toActorId(controller);
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'RemoveFlowController', hex) });
    }
    const { result, blockHash } = await command(C, 'RemoveFlowController', hex);
    res.json({ controller, blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/super-tokens/pause  (admin)
// POST /api/super-tokens/unpause  (admin)
// ---------------------------------------------------------------------------
router.post('/pause', async (req, res, next) => {
  try {
    if (req.body?.mode === 'payload') return res.json({ payload: encodePayload(C, 'Pause') });
    const { result, blockHash } = await command(C, 'Pause');
    res.json({ paused: true, blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

router.post('/unpause', async (req, res, next) => {
  try {
    if (req.body?.mode === 'payload') return res.json({ payload: encodePayload(C, 'Unpause') });
    const { result, blockHash } = await command(C, 'Unpause');
    res.json({ paused: false, blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

export default router;

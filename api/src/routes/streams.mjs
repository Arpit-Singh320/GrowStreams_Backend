import { Router } from 'express';
import { query, command, encodePayload } from '../sails-client.mjs';
import { getTokenBySymbol, getTokenByVaraAddress, resolveTokenAddress } from '../config/tokens.mjs';
import { toBaseUnits, toDisplayUnits, flowRateBreakdown, toPerSecondRate } from '../utils/decimals.mjs';

const router = Router();
const C = 'streamCore';

function toBigIntStr(v) {
  if (v == null) return '0';
  return typeof v === 'bigint' ? v.toString() : String(v);
}

// Normalize a hex address (e.g. 20-byte Ethereum) to a 32-byte 0x-prefixed hex string
// required by Vara/Gear actor_id ([u8;32]).
function toActorId(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return '0x' + clean.padStart(64, '0');
}

function serializeDeep(obj) {
  if (obj == null) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeDeep);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = serializeDeep(v);
    }
    return out;
  }
  return obj;
}

router.get('/config', async (req, res, next) => {
  try {
    const result = await query(C, 'GetConfig');
    res.json(serializeDeep(result));
  } catch (err) { next(err); }
});

router.get('/total', async (req, res, next) => {
  try {
    const result = await query(C, 'TotalStreams');
    res.json({ total: toBigIntStr(result) });
  } catch (err) { next(err); }
});

router.get('/active', async (req, res, next) => {
  try {
    const result = await query(C, 'ActiveStreams');
    res.json({ active: toBigIntStr(result) });
  } catch (err) { next(err); }
});

router.get('/sender/:address', async (req, res, next) => {
  try {
    const result = await query(C, 'GetSenderStreams', toActorId(req.params.address));
    res.json({ sender: req.params.address, streamIds: (result || []).map(toBigIntStr) });
  } catch (err) { next(err); }
});

router.get('/receiver/:address', async (req, res, next) => {
  try {
    const result = await query(C, 'GetReceiverStreams', toActorId(req.params.address));
    res.json({ receiver: req.params.address, streamIds: (result || []).map(toBigIntStr) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const result = await query(C, 'GetStream', id);
    if (!result) return res.status(404).json({ error: 'Stream not found' });

    const serialized = serializeDeep(result);

    // Enrich with token metadata if available
    const tokenAddr = serialized.token || serialized.Token;
    const tokenMeta = tokenAddr ? getTokenByVaraAddress(tokenAddr) : null;

    if (tokenMeta) {
      serialized.tokenMeta = {
        symbol: tokenMeta.symbol,
        displaySymbol: tokenMeta.displaySymbol,
        name: tokenMeta.name,
        decimals: tokenMeta.decimals,
        icon: tokenMeta.icon,
      };
      const d = tokenMeta.decimals;
      serialized.display = {
        deposited: toDisplayUnits(serialized.deposited || '0', d),
        withdrawn: toDisplayUnits(serialized.withdrawn || '0', d),
        streamed: toDisplayUnits(serialized.streamed || '0', d),
        flowRate: flowRateBreakdown(serialized.flow_rate || serialized.flowRate || '0', d),
      };
    }

    res.json(serialized);
  } catch (err) { next(err); }
});

router.get('/:id/balance', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const result = await query(C, 'GetWithdrawableBalance', id);
    const raw = toBigIntStr(result);

    // Try to enrich with display amount
    let display = null;
    try {
      const stream = await query(C, 'GetStream', id);
      const tokenAddr = stream?.token || stream?.Token;
      const tokenMeta = tokenAddr ? getTokenByVaraAddress(typeof tokenAddr === 'object' ? tokenAddr.toString() : tokenAddr) : null;
      if (tokenMeta) {
        display = { amount: toDisplayUnits(raw, tokenMeta.decimals), symbol: tokenMeta.displaySymbol };
      }
    } catch { /* enrichment is best-effort */ }

    res.json({ streamId: Number(id), withdrawable: raw, display });
  } catch (err) { next(err); }
});

router.get('/:id/buffer', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const result = await query(C, 'GetRemainingBuffer', id);
    const raw = toBigIntStr(result);

    let display = null;
    try {
      const stream = await query(C, 'GetStream', id);
      const tokenAddr = stream?.token || stream?.Token;
      const tokenMeta = tokenAddr ? getTokenByVaraAddress(typeof tokenAddr === 'object' ? tokenAddr.toString() : tokenAddr) : null;
      if (tokenMeta) {
        display = { amount: toDisplayUnits(raw, tokenMeta.decimals), symbol: tokenMeta.displaySymbol };
      }
    } catch { /* enrichment is best-effort */ }

    res.json({ streamId: Number(id), remainingBuffer: raw, display });
  } catch (err) { next(err); }
});

// POST /api/streams/create — create stream with symbol + human-readable amounts
router.post('/create', async (req, res, next) => {
  try {
    const { receiver, symbol, token: tokenSymbol, amount, flowRate, interval, initialDeposit, deposit, mode } = req.body;
    const effectiveSymbol = symbol || tokenSymbol;
    const effectiveDeposit = initialDeposit || deposit;
    const hasHumanReadable = effectiveSymbol && amount && interval && effectiveDeposit;
    const hasRaw = effectiveSymbol && flowRate && effectiveDeposit;

    if (!receiver) {
      return res.status(400).json({ error: 'Missing required field: receiver' });
    }
    if (!hasHumanReadable && !hasRaw) {
      return res.status(400).json({
        error: 'Missing fields. Provide: receiver, symbol, amount, interval, initialDeposit (human-readable) OR receiver, token/symbol, flowRate, initialDeposit (raw)',
      });
    }

    const tokenInfo = getTokenBySymbol(effectiveSymbol);
    if (!tokenInfo) return res.status(404).json({ error: `Unknown token: ${effectiveSymbol}` });

    let perSecondRate;
    if (hasHumanReadable) {
      perSecondRate = toPerSecondRate(amount, tokenInfo.decimals, interval);
      if (perSecondRate <= 0n) {
        return res.status(400).json({ error: 'Flow rate too low — results in 0 per second' });
      }
    } else {
      perSecondRate = BigInt(flowRate);
    }

    const rawDeposit = hasHumanReadable
      ? toBaseUnits(effectiveDeposit, tokenInfo.decimals)
      : BigInt(effectiveDeposit);
    const tokenAddr = toActorId(tokenInfo.vara);
    const receiverAddr = toActorId(receiver);

    if (mode === 'payload') {
      const payload = encodePayload(C, 'CreateStream', receiverAddr, tokenAddr, perSecondRate, rawDeposit);
      return res.json({
        payload,
        token: tokenInfo.symbol,
        flowRatePerSecond: perSecondRate.toString(),
        flowRateBreakdown: flowRateBreakdown(perSecondRate, tokenInfo.decimals),
        rawDeposit: rawDeposit.toString(),
        displayDeposit: effectiveDeposit,
      });
    }

    const { result, blockHash } = await command(C, 'CreateStream', receiverAddr, tokenAddr, perSecondRate, rawDeposit);
    res.status(201).json({
      streamId: typeof result === 'bigint' ? result.toString() : result,
      token: tokenInfo.symbol,
      flowRatePerSecond: perSecondRate.toString(),
      flowRateBreakdown: flowRateBreakdown(perSecondRate, tokenInfo.decimals),
      rawDeposit: rawDeposit.toString(),
      displayDeposit: effectiveDeposit,
      blockHash,
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { receiver, token, flowRate, initialDeposit, mode } = req.body;
    if (!receiver || !token || !flowRate || !initialDeposit) {
      return res.status(400).json({ error: 'Missing: receiver, token, flowRate, initialDeposit' });
    }
    if (mode === 'payload') {
      const payload = encodePayload(C, 'CreateStream', toActorId(receiver), toActorId(token), BigInt(flowRate), BigInt(initialDeposit));
      return res.json({ payload });
    }
    const { result, blockHash } = await command(C, 'CreateStream', toActorId(receiver), toActorId(token), BigInt(flowRate), BigInt(initialDeposit));
    res.status(201).json({ result, blockHash });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const { flowRate, mode } = req.body;
    if (!flowRate) return res.status(400).json({ error: 'Missing: flowRate' });
    if (mode === 'payload') {
      const payload = encodePayload(C, 'UpdateStream', id, BigInt(flowRate));
      return res.json({ payload });
    }
    const { result, blockHash } = await command(C, 'UpdateStream', id, BigInt(flowRate));
    res.json({ streamId: Number(id), blockHash });
  } catch (err) { next(err); }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    if (req.body?.mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'PauseStream', id) });
    }
    const { result, blockHash } = await command(C, 'PauseStream', id);
    res.json({ streamId: Number(id), status: 'paused', blockHash });
  } catch (err) { next(err); }
});

router.post('/:id/resume', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    if (req.body?.mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'ResumeStream', id) });
    }
    const { result, blockHash } = await command(C, 'ResumeStream', id);
    res.json({ streamId: Number(id), status: 'active', blockHash });
  } catch (err) { next(err); }
});

router.post('/:id/deposit', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const { amount, mode } = req.body;
    if (!amount) return res.status(400).json({ error: 'Missing: amount' });
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Deposit', id, BigInt(amount)) });
    }
    const { result, blockHash } = await command(C, 'Deposit', id, BigInt(amount));
    res.json({ streamId: Number(id), deposited: amount, blockHash });
  } catch (err) { next(err); }
});

router.post('/:id/withdraw', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    if (req.body?.mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Withdraw', id) });
    }
    const { result, blockHash } = await command(C, 'Withdraw', id);
    res.json({ streamId: Number(id), withdrawn: toBigIntStr(result), blockHash });
  } catch (err) { next(err); }
});

router.post('/:id/stop', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    if (req.body?.mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'StopStream', id) });
    }
    const { result, blockHash } = await command(C, 'StopStream', id);
    res.json({ streamId: Number(id), status: 'stopped', blockHash });
  } catch (err) { next(err); }
});

router.post('/:id/liquidate', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    if (req.body?.mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Liquidate', id) });
    }
    const { result, blockHash } = await command(C, 'Liquidate', id);
    res.json({ streamId: Number(id), status: 'liquidated', blockHash });
  } catch (err) { next(err); }
});

export default router;

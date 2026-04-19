import { Router } from 'express';
import { query, command, encodePayload } from '../sails-client.mjs';
import { getToken, getTokenByVaraAddress, resolveVaraAddress } from '../config/tokens.mjs';
import { toBaseUnits, toDisplayUnits, flowRateFromInterval, flowRatePerInterval } from '../utils/decimals.mjs';
import { logStreamEvent, getStreamHistory, getStreamEvents, getStreamStats } from '../services/stream-history.mjs';
import { validateWalletParam } from '../middleware/validate-wallet.mjs';
import { toActorId } from '../utils/actor-id.mjs';

const router = Router();
router.param('wallet', (req, res, next) => validateWalletParam(req, res, next));
const C = 'streamCore';

function toBigIntStr(v) {
  if (v == null) return '0';
  return typeof v === 'bigint' ? v.toString() : String(v);
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

router.get('/history/:wallet', async (req, res, next) => {
  try {
    const { limit, offset, eventType, token } = req.query;
    const result = await getStreamHistory(req.params.wallet, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      eventType: eventType || undefined,
      token: token || undefined,
    });
    res.json({ wallet: req.params.wallet, ...result });
  } catch (err) { next(err); }
});

router.get('/stats/:wallet', async (req, res, next) => {
  try {
    const result = await getStreamStats(req.params.wallet);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/events/:streamId', async (req, res, next) => {
  try {
    const events = await getStreamEvents(req.params.streamId);
    res.json({ streamId: req.params.streamId, events, count: events.length });
  } catch (err) { next(err); }
});

router.get('/sender/:address', async (req, res, next) => {
  try {
    const addrHex = toActorId(req.params.address);
    const result = await query(C, 'GetSenderStreams', addrHex);
    res.json({ sender: req.params.address, streamIds: (result || []).map(toBigIntStr) });
  } catch (err) { next(err); }
});

router.get('/receiver/:address', async (req, res, next) => {
  try {
    const addrHex = toActorId(req.params.address);
    const result = await query(C, 'GetReceiverStreams', addrHex);
    res.json({ receiver: req.params.address, streamIds: (result || []).map(toBigIntStr) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const result = await query(C, 'GetStream', id);
    if (!result) return res.status(404).json({ error: 'Stream not found' });

    const serialized = serializeDeep(result);

    // Enrich with token metadata if we recognise the token address
    const tokenAddr = result.token || result.Token || serialized.token;
    const tokMeta = tokenAddr ? getTokenByVaraAddress(tokenAddr) : null;
    if (tokMeta) {
      serialized.tokenMeta = {
        key: tokMeta.key,
        symbol: tokMeta.symbol,
        name: tokMeta.name,
        decimals: tokMeta.decimals,
        icon: tokMeta.icon,
        category: tokMeta.category,
        isStablecoin: tokMeta.isStablecoin,
      };
      // Add human-readable amounts
      const flowRateRaw = result.flow_rate ?? result.flowRate ?? result.FlowRate;
      const depositRaw = result.deposit ?? result.Deposit ?? result.initial_deposit ?? result.initialDeposit;
      if (flowRateRaw != null) {
        serialized.flowRateDisplay = toDisplayUnits(flowRateRaw.toString(), tokMeta.decimals);
        serialized.flowRatePerMonth = flowRatePerInterval(flowRateRaw.toString(), tokMeta.decimals, 'month');
      }
      if (depositRaw != null) {
        serialized.depositDisplay = toDisplayUnits(depositRaw.toString(), tokMeta.decimals);
      }
    }

    res.json(serialized);
  } catch (err) { next(err); }
});

router.get('/:id/balance', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const result = await query(C, 'GetWithdrawableBalance', id);
    res.json({ streamId: Number(id), withdrawable: toBigIntStr(result) });
  } catch (err) { next(err); }
});

router.get('/:id/buffer', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const result = await query(C, 'GetRemainingBuffer', id);
    res.json({ streamId: Number(id), remainingBuffer: toBigIntStr(result) });
  } catch (err) { next(err); }
});

async function createStreamHandler(req, res, next) {
  try {
    const { receiver, token, flowRate, initialDeposit, mode, flowRateInterval } = req.body;
    if (!receiver || !token || !flowRate || !initialDeposit) {
      return res.status(400).json({ error: 'Missing: receiver, token, flowRate, initialDeposit' });
    }

    // Resolve token symbol to Vara address (supports both symbol and raw address)
    const varaAddress = resolveVaraAddress(token);
    if (!varaAddress) return res.status(400).json({ error: `Unknown token: ${token}` });

    const tokMeta = getToken(token) || getTokenByVaraAddress(varaAddress);

    let flowRateBase, depositBase;
    if (tokMeta) {
      // If a known token, accept human-readable amounts and convert
      if (flowRateInterval) {
        // e.g. flowRate: "100", flowRateInterval: "month" → per-second base units
        flowRateBase = flowRateFromInterval(flowRate, tokMeta.decimals, flowRateInterval);
      } else {
        // flowRate is already per-second in human-readable units
        flowRateBase = toBaseUnits(flowRate, tokMeta.decimals);
      }
      depositBase = toBaseUnits(initialDeposit, tokMeta.decimals);
    } else {
      // Unknown token — treat amounts as raw base units
      flowRateBase = BigInt(flowRate);
      depositBase = BigInt(initialDeposit);
    }

    const receiverHex = toActorId(receiver);

    if (mode === 'payload') {
      const payload = encodePayload(C, 'CreateStream', receiverHex, varaAddress, flowRateBase, depositBase);
      return res.json({
        payload,
        resolved: {
          token: tokMeta?.symbol || token,
          varaAddress,
          flowRateBaseUnits: flowRateBase.toString(),
          depositBaseUnits: depositBase.toString(),
        },
      });
    }
    let { result, blockHash } = await command(C, 'CreateStream', receiverHex, varaAddress, flowRateBase, depositBase);

    // If result is null (decode warning), try to find the new stream ID via sender query
    if (result == null && req.body.sender) {
      const senderHex = toActorId(req.body.sender);
      const streams = await query(C, 'GetSenderStreams', senderHex);
      if (streams && streams.length > 0) {
        result = streams[streams.length - 1]; // Assume newest
      }
    }

    // Log event (non-blocking)
    logStreamEvent({
      streamId: result != null ? String(result) : 'unknown',
      eventType: 'created',
      sender: req.body.sender || null,
      receiver,
      tokenAddress: varaAddress,
      tokenSymbol: tokMeta?.symbol || token,
      flowRate: flowRateBase.toString(),
      amount: depositBase.toString(),
      blockHash,
      metadata: { flowRateInterval: flowRateInterval || 'second' },
    });

    res.status(201).json({
      result: result != null ? String(result) : null,
      blockHash,
      resolved: {
        token: tokMeta?.symbol || token,
        varaAddress,
        flowRateBaseUnits: flowRateBase.toString(),
        depositBaseUnits: depositBase.toString(),
      },
    });
  } catch (err) { next(err); }
}

router.post('/', createStreamHandler);
router.post('/create', createStreamHandler);

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
    logStreamEvent({ streamId: String(id), eventType: 'updated', flowRate: String(flowRate), blockHash });
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
    logStreamEvent({ streamId: String(id), eventType: 'paused', blockHash });
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
    logStreamEvent({ streamId: String(id), eventType: 'resumed', blockHash });
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
    logStreamEvent({ streamId: String(id), eventType: 'deposit', amount: String(amount), blockHash });
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
    logStreamEvent({ streamId: String(id), eventType: 'withdraw', amount: toBigIntStr(result), blockHash });
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
    logStreamEvent({ streamId: String(id), eventType: 'stopped', blockHash });
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
    logStreamEvent({ streamId: String(id), eventType: 'liquidated', blockHash });
    res.json({ streamId: Number(id), status: 'liquidated', blockHash });
  } catch (err) { next(err); }
});

export default router;

import { Router } from 'express';
import { query, command, encodePayload } from '../sails-client.mjs';
import { getToken, getTokenByVaraAddress, resolveVaraAddress, listTokens } from '../config/tokens.mjs';
import { toBaseUnits, toDisplayUnits } from '../utils/decimals.mjs';
import { logVaultEvent, getVaultHistory } from '../services/stream-history.mjs';
import { validateWalletParam } from '../middleware/validate-wallet.mjs';

const router = Router();
router.param('wallet', (req, res, next) => validateWalletParam(req, res, next));
const C = 'tokenVault';

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

function serializeVaultBalance(raw) {
  if (!raw) return { owner: '', token: '', total_deposited: '0', total_allocated: '0', available: '0' };
  return {
    owner: raw.owner || raw.Owner || '',
    token: raw.token || raw.Token || '',
    total_deposited: toBigIntStr(raw.total_deposited ?? raw.totalDeposited ?? raw.TotalDeposited ?? 0),
    total_allocated: toBigIntStr(raw.total_allocated ?? raw.totalAllocated ?? raw.TotalAllocated ?? 0),
    available: toBigIntStr(raw.available ?? raw.Available ?? 0),
  };
}

router.get('/config', async (req, res, next) => {
  try {
    const result = await query(C, 'GetConfig');
    res.json(serializeDeep(result));
  } catch (err) { next(err); }
});

router.get('/paused', async (req, res, next) => {
  try {
    const result = await query(C, 'IsPaused');
    res.json({ paused: result });
  } catch (err) { next(err); }
});

router.get('/history/:wallet', async (req, res, next) => {
  try {
    const { limit, offset, eventType, token } = req.query;
    const result = await getVaultHistory(req.params.wallet, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      eventType: eventType || undefined,
      token: token || undefined,
    });
    res.json({ wallet: req.params.wallet, ...result });
  } catch (err) { next(err); }
});

router.get('/balance/:owner/:token', async (req, res, next) => {
  try {
    // Accept token symbol or raw address
    const varaAddr = resolveVaraAddress(req.params.token) || req.params.token;
    const result = await query(C, 'GetBalance', req.params.owner, varaAddr);
    const bal = serializeVaultBalance(result);

    // Enrich with token metadata and human-readable amounts
    const tokMeta = getTokenByVaraAddress(varaAddr) || getToken(req.params.token);
    if (tokMeta) {
      bal.tokenMeta = {
        key: tokMeta.key,
        symbol: tokMeta.symbol,
        name: tokMeta.name,
        decimals: tokMeta.decimals,
        icon: tokMeta.icon,
      };
      bal.total_deposited_display = toDisplayUnits(bal.total_deposited, tokMeta.decimals);
      bal.total_allocated_display = toDisplayUnits(bal.total_allocated, tokMeta.decimals);
      bal.available_display = toDisplayUnits(bal.available, tokMeta.decimals);
    }

    res.json(bal);
  } catch (err) { next(err); }
});

router.get('/balances/:wallet', async (req, res, next) => {
  try {
    const wallet = req.params.wallet;
    const tokens = listTokens().filter(t => t.vara !== 'native');
    const balances = [];

    for (const tok of tokens) {
      try {
        const result = await query(C, 'GetBalance', wallet, tok.vara);
        const bal = serializeVaultBalance(result);
        balances.push({
          key: tok.key,
          symbol: tok.symbol,
          name: tok.name,
          decimals: tok.decimals,
          icon: tok.icon,
          category: tok.category,
          isStablecoin: tok.isStablecoin,
          total_deposited: bal.total_deposited,
          total_allocated: bal.total_allocated,
          available: bal.available,
          total_deposited_display: toDisplayUnits(bal.total_deposited, tok.decimals),
          total_allocated_display: toDisplayUnits(bal.total_allocated, tok.decimals),
          available_display: toDisplayUnits(bal.available, tok.decimals),
        });
      } catch (err) {
        balances.push({
          key: tok.key,
          symbol: tok.symbol,
          name: tok.name,
          decimals: tok.decimals,
          icon: tok.icon,
          total_deposited: '0',
          total_allocated: '0',
          available: '0',
          total_deposited_display: '0',
          total_allocated_display: '0',
          available_display: '0',
          error: err.message,
        });
      }
    }

    res.json({ wallet, balances });
  } catch (err) { next(err); }
});

router.get('/allocation/:streamId', async (req, res, next) => {
  try {
    const id = BigInt(req.params.streamId);
    const result = await query(C, 'GetStreamAllocation', id);
    res.json({ streamId: Number(id), allocated: toBigIntStr(result) });
  } catch (err) { next(err); }
});

router.post('/deposit', async (req, res, next) => {
  try {
    const { token, amount, amountRaw, mode } = req.body;
    if (!token || (!amount && !amountRaw)) return res.status(400).json({ error: 'Missing: token, amount (or amountRaw)' });

    const varaAddr = resolveVaraAddress(token) || token;
    const tokMeta = getToken(token) || getTokenByVaraAddress(varaAddr);

    // Convert human-readable amount to base units if token is known
    let baseAmount;
    if (amountRaw) {
      baseAmount = BigInt(amountRaw);
    } else if (tokMeta) {
      baseAmount = toBaseUnits(amount, tokMeta.decimals);
    } else {
      baseAmount = BigInt(amount);
    }

    if (mode === 'payload') {
      return res.json({
        payload: encodePayload(C, 'DepositTokens', varaAddr, baseAmount),
        resolved: {
          token: tokMeta?.symbol || token,
          varaAddress: varaAddr,
          baseUnits: baseAmount.toString(),
          display: tokMeta ? toDisplayUnits(baseAmount, tokMeta.decimals) : amount,
        },
      });
    }
    const { result, blockHash } = await command(C, 'DepositTokens', varaAddr, baseAmount);

    logVaultEvent({
      wallet: req.body.wallet || 'unknown',
      eventType: 'deposit',
      tokenAddress: varaAddr,
      tokenSymbol: tokMeta?.symbol || token,
      amount: baseAmount.toString(),
      amountDisplay: tokMeta ? toDisplayUnits(baseAmount, tokMeta.decimals) : amount,
      blockHash,
    });

    res.status(201).json({
      token: tokMeta?.symbol || token,
      varaAddress: varaAddr,
      amount: tokMeta ? toDisplayUnits(baseAmount, tokMeta.decimals) : amount,
      amountRaw: baseAmount.toString(),
      blockHash,
    });
  } catch (err) { next(err); }
});

router.post('/withdraw', async (req, res, next) => {
  try {
    const { token, amount, amountRaw, mode } = req.body;
    if (!token || (!amount && !amountRaw)) return res.status(400).json({ error: 'Missing: token, amount (or amountRaw)' });

    const varaAddr = resolveVaraAddress(token) || token;
    const tokMeta = getToken(token) || getTokenByVaraAddress(varaAddr);

    let baseAmount;
    if (amountRaw) {
      baseAmount = BigInt(amountRaw);
    } else if (tokMeta) {
      baseAmount = toBaseUnits(amount, tokMeta.decimals);
    } else {
      baseAmount = BigInt(amount);
    }

    if (mode === 'payload') {
      return res.json({
        payload: encodePayload(C, 'WithdrawTokens', varaAddr, baseAmount),
        resolved: {
          token: tokMeta?.symbol || token,
          varaAddress: varaAddr,
          baseUnits: baseAmount.toString(),
          display: tokMeta ? toDisplayUnits(baseAmount, tokMeta.decimals) : amount,
        },
      });
    }
    const { result, blockHash } = await command(C, 'WithdrawTokens', varaAddr, baseAmount);

    logVaultEvent({
      wallet: req.body.wallet || 'unknown',
      eventType: 'withdraw',
      tokenAddress: varaAddr,
      tokenSymbol: tokMeta?.symbol || token,
      amount: baseAmount.toString(),
      amountDisplay: tokMeta ? toDisplayUnits(baseAmount, tokMeta.decimals) : amount,
      blockHash,
    });

    res.json({
      token: tokMeta?.symbol || token,
      varaAddress: varaAddr,
      amount: tokMeta ? toDisplayUnits(baseAmount, tokMeta.decimals) : amount,
      amountRaw: baseAmount.toString(),
      blockHash,
    });
  } catch (err) { next(err); }
});

router.post('/allocate', async (req, res, next) => {
  try {
    const { owner, token, amount, streamId, mode } = req.body;
    if (!owner || !token || !amount || !streamId) {
      return res.status(400).json({ error: 'Missing: owner, token, amount, streamId' });
    }
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'AllocateToStream', owner, token, BigInt(amount), BigInt(streamId)) });
    }
    const { result, blockHash } = await command(C, 'AllocateToStream', owner, token, BigInt(amount), BigInt(streamId));
    logVaultEvent({ wallet: owner, eventType: 'allocate', tokenAddress: token, amount: String(amount), streamId: String(streamId), blockHash });
    res.json({ streamId, amount, blockHash });
  } catch (err) { next(err); }
});

router.post('/release', async (req, res, next) => {
  try {
    const { owner, token, amount, streamId, mode } = req.body;
    if (!owner || !token || !amount || !streamId) {
      return res.status(400).json({ error: 'Missing: owner, token, amount, streamId' });
    }
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'ReleaseFromStream', owner, token, BigInt(amount), BigInt(streamId)) });
    }
    const { result, blockHash } = await command(C, 'ReleaseFromStream', owner, token, BigInt(amount), BigInt(streamId));
    logVaultEvent({ wallet: owner, eventType: 'release', tokenAddress: token, amount: String(amount), streamId: String(streamId), blockHash });
    res.json({ streamId, amount, blockHash });
  } catch (err) { next(err); }
});

router.post('/transfer', async (req, res, next) => {
  try {
    const { token, receiver, amount, streamId, mode } = req.body;
    if (!token || !receiver || !amount || !streamId) {
      return res.status(400).json({ error: 'Missing: token, receiver, amount, streamId' });
    }
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'TransferToReceiver', token, receiver, BigInt(amount), BigInt(streamId)) });
    }
    const { result, blockHash } = await command(C, 'TransferToReceiver', token, receiver, BigInt(amount), BigInt(streamId));
    logVaultEvent({ wallet: receiver, eventType: 'transfer', tokenAddress: token, amount: String(amount), streamId: String(streamId), blockHash });
    res.json({ streamId, receiver, amount, blockHash });
  } catch (err) { next(err); }
});

router.post('/deposit-native', async (req, res, next) => {
  try {
    const { amount, mode } = req.body;
    if (!amount) return res.status(400).json({ error: 'Missing: amount' });
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'DepositNative'), value: amount });
    }
    const { result, blockHash } = await command(C, 'DepositNative');
    logVaultEvent({ wallet: req.body.wallet || 'unknown', eventType: 'deposit_native', amount: String(amount), blockHash });
    res.status(201).json({ amount, blockHash });
  } catch (err) { next(err); }
});

router.post('/withdraw-native', async (req, res, next) => {
  try {
    const { amount, mode } = req.body;
    if (!amount) return res.status(400).json({ error: 'Missing: amount' });
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'WithdrawNative', BigInt(amount)) });
    }
    const { result, blockHash } = await command(C, 'WithdrawNative', BigInt(amount));
    logVaultEvent({ wallet: req.body.wallet || 'unknown', eventType: 'withdraw_native', amount: String(amount), blockHash });
    res.json({ amount, blockHash });
  } catch (err) { next(err); }
});

router.post('/pause', async (req, res, next) => {
  try {
    if (req.body?.mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'EmergencyPause') });
    }
    const { result, blockHash } = await command(C, 'EmergencyPause');
    res.json({ paused: true, blockHash });
  } catch (err) { next(err); }
});

router.post('/unpause', async (req, res, next) => {
  try {
    if (req.body?.mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'EmergencyUnpause') });
    }
    const { result, blockHash } = await command(C, 'EmergencyUnpause');
    res.json({ paused: false, blockHash });
  } catch (err) { next(err); }
});

router.post('/set-stream-core', async (req, res, next) => {
  try {
    const { streamCore, mode } = req.body;
    if (!streamCore) return res.status(400).json({ error: 'Missing: streamCore' });
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'SetStreamCore', streamCore) });
    }
    const { result, blockHash } = await command(C, 'SetStreamCore', streamCore);
    res.json({ streamCore, blockHash });
  } catch (err) { next(err); }
});

export default router;

import { Router } from 'express';
import { query, command, encodePayload } from '../sails-client.mjs';
import { checkAccountSolvency, checkStreamsSolvency, scanAtRiskStreams } from '../services/solvency.mjs';
import { toActorId } from '../utils/actor-id.mjs';

const router = Router();
const LM = 'liquidationManager';
const SUPER_TOKEN_KEY = 'superToken';

function toBigIntStr(v) {
  if (v == null) return '0';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object' && v !== null) {
    if (typeof v.toBigInt === 'function') return v.toBigInt().toString();
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
    if (Array.isArray(obj)) return obj.map(v => serializeDeep(v, seen));
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = serializeDeep(v, seen);
    return out;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// GET /api/solvency/config
// ---------------------------------------------------------------------------
router.get('/config', async (req, res, next) => {
  try {
    const result = await query(LM, 'GetConfig');
    res.json(serializeDeep(result));
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/solvency/account/:account
// Real-time solvency for any account against the default super token.
// Query params: ?superToken=<key>  (default: 'superToken')
// ---------------------------------------------------------------------------
router.get('/account/:account', async (req, res, next) => {
  try {
    const superTokenKey = req.query.superToken || SUPER_TOKEN_KEY;
    const result = await checkAccountSolvency(req.params.account, superTokenKey);
    res.json({ account: req.params.account, ...result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/solvency/stream/:streamId
// Solvency for the sender of a specific stream.
// ---------------------------------------------------------------------------
router.get('/stream/:streamId', async (req, res, next) => {
  try {
    const superTokenKey = req.query.superToken || SUPER_TOKEN_KEY;
    const results = await checkStreamsSolvency(
      [BigInt(req.params.streamId)],
      superTokenKey,
    );
    if (!results.length || results[0].error) {
      return res.status(404).json({ error: results[0]?.error || 'Stream not found' });
    }
    res.json(results[0]);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/solvency/at-risk
// Scan ALL streams and return critical/insolvent ones. Used by keeper UI.
// ---------------------------------------------------------------------------
router.get('/at-risk', async (req, res, next) => {
  try {
    const superTokenKey = req.query.superToken || SUPER_TOKEN_KEY;
    const criticalThresholdSecs = req.query.threshold
      ? parseInt(req.query.threshold, 10)
      : 3600;
    const results = await scanAtRiskStreams(superTokenKey, { criticalThresholdSecs });
    res.json({
      count: results.length,
      streams: results,
      scanned_at: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/solvency/liquidation/:streamId
// Fetch on-chain liquidation record for a stream.
// ---------------------------------------------------------------------------
router.get('/liquidation/:streamId', async (req, res, next) => {
  try {
    const streamId = BigInt(req.params.streamId);
    const result = await query(LM, 'GetLiquidation', streamId);
    if (!result) return res.status(404).json({ error: 'No liquidation record found' });
    res.json(serializeDeep(result));
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/solvency/total-liquidations
// ---------------------------------------------------------------------------
router.get('/total-liquidations', async (req, res, next) => {
  try {
    const result = await query(LM, 'TotalLiquidations');
    res.json({ total_liquidations: toBigIntStr(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/solvency/liquidate
// Body: { stream_id, sender, super_token, mode? }
// Manually trigger liquidation for a specific stream.
// ---------------------------------------------------------------------------
router.post('/liquidate', async (req, res, next) => {
  try {
    const { stream_id, sender, super_token, mode } = req.body;
    if (!stream_id || !sender || !super_token) {
      return res.status(400).json({ error: 'Missing: stream_id, sender, super_token' });
    }
    const streamIdBI = BigInt(stream_id);
    const senderHex = toActorId(sender);
    const superTokenHex = toActorId(super_token);

    if (mode === 'payload') {
      return res.json({
        payload: encodePayload(LM, 'LiquidateStream', streamIdBI, senderHex, superTokenHex),
      });
    }
    const { result, blockHash } = await command(LM, 'LiquidateStream', streamIdBI, senderHex, superTokenHex);
    res.json({ stream_id, liquidated: true, blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/solvency/top-up
// Body: { sender, super_token, amount, mode? }
// Anyone can top up a sender's super token balance as a sentinel.
// ---------------------------------------------------------------------------
router.post('/top-up', async (req, res, next) => {
  try {
    const { sender, super_token, amount, mode } = req.body;
    if (!sender || !super_token || !amount) {
      return res.status(400).json({ error: 'Missing: sender, super_token, amount' });
    }
    const senderHex = toActorId(sender);
    const superTokenHex = toActorId(super_token);
    const amountBI = BigInt(amount);

    if (mode === 'payload') {
      return res.json({
        payload: encodePayload(LM, 'TopUp', senderHex, superTokenHex, amountBI),
      });
    }
    const { result, blockHash } = await command(LM, 'TopUp', senderHex, superTokenHex, amountBI);
    res.json({ sender, super_token, amount, blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/solvency/admin/set-stream-core
// Body: { stream_core, mode? }
// ---------------------------------------------------------------------------
router.post('/admin/set-stream-core', async (req, res, next) => {
  try {
    const { stream_core, mode } = req.body;
    if (!stream_core) return res.status(400).json({ error: 'Missing: stream_core' });
    const hex = toActorId(stream_core);
    if (mode === 'payload') return res.json({ payload: encodePayload(LM, 'SetStreamCore', hex) });
    const { blockHash } = await command(LM, 'SetStreamCore', hex);
    res.json({ stream_core, blockHash });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/solvency/admin/set-threshold
// Body: { seconds, mode? }
// ---------------------------------------------------------------------------
router.post('/admin/set-threshold', async (req, res, next) => {
  try {
    const { seconds, mode } = req.body;
    if (!seconds) return res.status(400).json({ error: 'Missing: seconds' });
    const secs = BigInt(seconds);
    if (mode === 'payload') return res.json({ payload: encodePayload(LM, 'SetCriticalThreshold', secs) });
    const { blockHash } = await command(LM, 'SetCriticalThreshold', secs);
    res.json({ critical_threshold_seconds: Number(secs), blockHash });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/solvency/admin/set-reward
// Body: { reward, mode? }
// ---------------------------------------------------------------------------
router.post('/admin/set-reward', async (req, res, next) => {
  try {
    const { reward, mode } = req.body;
    if (reward == null) return res.status(400).json({ error: 'Missing: reward' });
    const rewardBI = BigInt(reward);
    if (mode === 'payload') return res.json({ payload: encodePayload(LM, 'SetLiquidationReward', rewardBI) });
    const { blockHash } = await command(LM, 'SetLiquidationReward', rewardBI);
    res.json({ liquidation_reward: reward, blockHash });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/solvency/admin/pause  |  POST /api/solvency/admin/unpause
// ---------------------------------------------------------------------------
router.post('/admin/pause', async (req, res, next) => {
  try {
    if (req.body?.mode === 'payload') return res.json({ payload: encodePayload(LM, 'Pause') });
    const { blockHash } = await command(LM, 'Pause');
    res.json({ paused: true, blockHash });
  } catch (err) { next(err); }
});

router.post('/admin/unpause', async (req, res, next) => {
  try {
    if (req.body?.mode === 'payload') return res.json({ payload: encodePayload(LM, 'Unpause') });
    const { blockHash } = await command(LM, 'Unpause');
    res.json({ paused: false, blockHash });
  } catch (err) { next(err); }
});

export default router;

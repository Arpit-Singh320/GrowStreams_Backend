import { Router } from 'express';
import { query, command, encodePayload } from '../sails-client.mjs';
import { toBaseUnits, toDisplayUnits } from '../utils/decimals.mjs';
import { toActorId } from '../utils/actor-id.mjs';

const router = Router();
const C = 'distributionPool';

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
// GET /api/distribution-pools/config
// ---------------------------------------------------------------------------
router.get('/config', async (req, res, next) => {
  try {
    const result = await query(C, 'GetConfig');
    res.json(serializeDeep(result));
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/distribution-pools/total
// ---------------------------------------------------------------------------
router.get('/total', async (req, res, next) => {
  try {
    const result = await query(C, 'TotalPools');
    res.json({ total_pools: toBigIntStr(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/distribution-pools/by-admin/:admin
// Returns all pool IDs owned by an admin.
// ---------------------------------------------------------------------------
router.get('/by-admin/:admin', async (req, res, next) => {
  try {
    const adminHex = toActorId(req.params.admin);
    const result = await query(C, 'GetAdminPools', adminHex);
    res.json({ admin: req.params.admin, pool_ids: (result || []).map(toBigIntStr) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/distribution-pools/:poolId
// Returns the full pool state.
// ---------------------------------------------------------------------------
router.get('/:poolId', async (req, res, next) => {
  try {
    const poolId = BigInt(req.params.poolId);
    const result = await query(C, 'GetPool', poolId);
    if (!result) return res.status(404).json({ error: 'Pool not found' });
    res.json(serializeDeep(result));
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/distribution-pools/:poolId/member/:member
// Returns member state (units, snapshot, total_claimed).
// ---------------------------------------------------------------------------
router.get('/:poolId/member/:member', async (req, res, next) => {
  try {
    const poolId = BigInt(req.params.poolId);
    const memberHex = toActorId(req.params.member);
    const [memberState, claimable] = await Promise.all([
      query(C, 'GetMemberState', poolId, memberHex),
      query(C, 'GetClaimable', poolId, memberHex),
    ]);
    res.json({
      pool_id: Number(poolId),
      member: req.params.member,
      ...serializeDeep(memberState),
      claimable: toBigIntStr(claimable),
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/distribution-pools/:poolId/claimable
// Returns claimable preview for all members (up to 100).
// ---------------------------------------------------------------------------
router.get('/:poolId/claimable', async (req, res, next) => {
  try {
    const poolId = BigInt(req.params.poolId);
    const result = await query(C, 'GetAllClaimable', poolId);
    res.json({
      pool_id: Number(poolId),
      members: serializeDeep(result || []),
      count: (result || []).length,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/distribution-pools
// Body: { super_token, mode? }
// Create a new distribution pool.
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const { super_token, mode } = req.body;
    if (!super_token) return res.status(400).json({ error: 'Missing: super_token' });
    const superTokenHex = toActorId(super_token);
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'CreatePool', superTokenHex) });
    }
    const { result, blockHash } = await command(C, 'CreatePool', superTokenHex);
    res.status(201).json({ pool_id: toBigIntStr(result), super_token, blockHash });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/distribution-pools/:poolId/set-units
// Body: { member, units, mode? }
// Admin sets (or updates) a member's unit count.
// ---------------------------------------------------------------------------
router.post('/:poolId/set-units', async (req, res, next) => {
  try {
    const poolId = BigInt(req.params.poolId);
    const { member, units, mode } = req.body;
    if (!member || units == null) return res.status(400).json({ error: 'Missing: member, units' });
    const memberHex = toActorId(member);
    const unitsBI = BigInt(units);
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'SetUnits', poolId, memberHex, unitsBI) });
    }
    const { result, blockHash } = await command(C, 'SetUnits', poolId, memberHex, unitsBI);
    res.json({ pool_id: Number(poolId), member, units: String(unitsBI), blockHash, result: serializeDeep(result) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/distribution-pools/:poolId/distribute
// Body: { amount, amountRaw?, decimals?, mode? }
// Instant distribution — admin must have pre-approved super token allowance.
// ---------------------------------------------------------------------------
router.post('/:poolId/distribute', async (req, res, next) => {
  try {
    const poolId = BigInt(req.params.poolId);
    const { amount, amountRaw, decimals, mode } = req.body;
    if (!amount && !amountRaw) return res.status(400).json({ error: 'Missing: amount or amountRaw' });

    const baseAmount = amountRaw
      ? BigInt(amountRaw)
      : decimals != null
        ? toBaseUnits(amount, parseInt(decimals, 10))
        : BigInt(amount);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Distribute', poolId, baseAmount) });
    }
    const { result, blockHash } = await command(C, 'Distribute', poolId, baseAmount);
    res.json({
      pool_id: Number(poolId),
      distributed: baseAmount.toString(),
      blockHash,
      result: serializeDeep(result),
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/distribution-pools/:poolId/set-inflow-rate
// Body: { sender, flow_rate, flowRateRaw?, decimals?, mode? }
// Start / update / stop (flow_rate=0) the streaming distribution into a pool.
// ---------------------------------------------------------------------------
router.post('/:poolId/set-inflow-rate', async (req, res, next) => {
  try {
    const poolId = BigInt(req.params.poolId);
    const { sender, flow_rate, flowRateRaw, decimals, mode } = req.body;
    if (!sender || (flow_rate == null && !flowRateRaw)) {
      return res.status(400).json({ error: 'Missing: sender, flow_rate' });
    }
    const senderHex = toActorId(sender);
    const rateBase = flowRateRaw
      ? BigInt(flowRateRaw)
      : decimals != null
        ? toBaseUnits(flow_rate, parseInt(decimals, 10))
        : BigInt(flow_rate);

    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'SetInflowRate', poolId, senderHex, rateBase) });
    }
    const { result, blockHash } = await command(C, 'SetInflowRate', poolId, senderHex, rateBase);
    res.json({
      pool_id: Number(poolId),
      sender,
      inflow_rate: rateBase.toString(),
      streaming: rateBase > 0n,
      blockHash,
      result: serializeDeep(result),
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/distribution-pools/:poolId/claim
// Claim all accrued tokens for the caller.
// ---------------------------------------------------------------------------
router.post('/:poolId/claim', async (req, res, next) => {
  try {
    const poolId = BigInt(req.params.poolId);
    if (req.body?.mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'Claim', poolId) });
    }
    const { result, blockHash } = await command(C, 'Claim', poolId);
    res.json({
      pool_id: Number(poolId),
      claimed: toBigIntStr(result),
      blockHash,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/distribution-pools/:poolId/claim-for
// Body: { member, mode? }
// Permissionless claim push — anyone can trigger a claim for any member.
// ---------------------------------------------------------------------------
router.post('/:poolId/claim-for', async (req, res, next) => {
  try {
    const poolId = BigInt(req.params.poolId);
    const { member, mode } = req.body;
    if (!member) return res.status(400).json({ error: 'Missing: member' });
    const memberHex = toActorId(member);
    if (mode === 'payload') {
      return res.json({ payload: encodePayload(C, 'ClaimFor', poolId, memberHex) });
    }
    const { result, blockHash } = await command(C, 'ClaimFor', poolId, memberHex);
    res.json({
      pool_id: Number(poolId),
      member,
      claimed: toBigIntStr(result),
      blockHash,
    });
  } catch (err) { next(err); }
});

export default router;

/**
 * /api/vara-eth — Phase 4 Vara.eth EVM stream endpoints
 *
 * Exposes StreamEscrow.sol operations (deposit, withdraw, stop, claim)
 * and read queries (info, balances, stream depositor, EVM stream history).
 *
 * All write endpoints use the server-side relayer wallet (ETH_PRIVATE_KEY).
 * For client-side signing, pass { mode: "info" } to get contract addresses
 * and build the tx in the frontend directly.
 *
 * Routes:
 *   GET  /api/vara-eth/info                    — escrow + program addresses
 *   GET  /api/vara-eth/balance/:address        — token balance on Hoodi
 *   GET  /api/vara-eth/wvara/:address          — wVARA balance
 *   GET  /api/vara-eth/claimable/:address      — claimable refund balance
 *   GET  /api/vara-eth/depositor/:streamId     — who owns this streamId
 *   GET  /api/vara-eth/streams/:address        — EVM stream history from DB
 *   POST /api/vara-eth/deposit                 — approve + create stream via escrow
 *   POST /api/vara-eth/deposit/:streamId       — add deposit to existing stream
 *   POST /api/vara-eth/withdraw/:streamId      — withdraw from stream
 *   POST /api/vara-eth/stop/:streamId          — stop stream
 *   POST /api/vara-eth/claim                   — claim refunded tokens
 */

import { Router } from 'express';
import {
  getEscrowInfo,
  getEscrowTokenBalance,
  getWvaraBalance,
  getClaimableBalance,
  getStreamDepositor,
  depositAndCreateStream,
  addDepositToStream,
  withdrawFromStream,
  stopEvmStream,
  claimEscrowRefund,
} from '../vara-eth-client.mjs';
import { query as dbQuery, queryAll } from '../services/db.mjs';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/vara-eth/info
// ---------------------------------------------------------------------------
router.get('/info', async (req, res, next) => {
  try {
    const info = await getEscrowInfo();
    if (!info) return res.status(503).json({ error: 'Vara.eth contracts not configured' });
    res.json(info);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/vara-eth/balance/:address — token balance (MockUSDC / VARA_ETH_TOKEN)
// ---------------------------------------------------------------------------
router.get('/balance/:address', async (req, res, next) => {
  try {
    const result = await getEscrowTokenBalance(req.params.address);
    if (!result) return res.status(503).json({ error: 'Token contract not configured' });
    res.json({ address: req.params.address, ...result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/vara-eth/wvara/:address — wVARA balance on Hoodi
// ---------------------------------------------------------------------------
router.get('/wvara/:address', async (req, res, next) => {
  try {
    const result = await getWvaraBalance(req.params.address);
    if (!result) return res.status(503).json({ error: 'Router not configured' });
    res.json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/vara-eth/claimable/:address — claimable refund balance in escrow
// ---------------------------------------------------------------------------
router.get('/claimable/:address', async (req, res, next) => {
  try {
    const amount = await getClaimableBalance(req.params.address);
    res.json({ address: req.params.address, claimable: amount });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/vara-eth/depositor/:streamId — depositor of a stream in escrow
// ---------------------------------------------------------------------------
router.get('/depositor/:streamId', async (req, res, next) => {
  try {
    const depositor = await getStreamDepositor(req.params.streamId);
    res.json({ streamId: req.params.streamId, depositor: depositor ?? null });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/vara-eth/streams/:address — history from DB
// ---------------------------------------------------------------------------
router.get('/streams/:address', async (req, res, next) => {
  try {
    const address = req.params.address.toLowerCase();
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);

    const rows = await queryAll(
      `SELECT * FROM evm_streams
       WHERE sender = $1 OR receiver = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [address, limit, offset]
    );
    res.json({ address, streams: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/vara-eth/deposit
// Body: { receiver, flowRate, amount }
//   receiver  — 0x EVM address of stream receiver
//   flowRate  — tokens per second (base units, string or number)
//   amount    — total deposit (base units, string or number)
// ---------------------------------------------------------------------------
router.post('/deposit', async (req, res, next) => {
  try {
    const { receiver, flowRate, amount } = req.body;
    if (!receiver || !flowRate || !amount) {
      return res.status(400).json({ error: 'Missing: receiver, flowRate, amount' });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(receiver)) {
      return res.status(400).json({ error: 'receiver must be a 0x EVM address' });
    }

    const result = await depositAndCreateStream({
      receiverEvmAddress: receiver,
      flowRate: String(flowRate),
      amount:   String(amount),
    });

    // Persist to DB
    const escrowAddr = process.env.STREAM_ESCROW_ADDRESS;
    const tokenAddr  = process.env.VARA_ETH_TOKEN;
    const relayerAddr = process.env.ETH_ADDRESS;

    await dbQuery(
      `INSERT INTO evm_streams
         (message_id, sender, receiver, flow_rate, amount, token, escrow_address, approve_tx, deposit_tx, block_number, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING')
       ON CONFLICT (message_id) DO NOTHING`,
      [
        result.messageId ?? null,
        (relayerAddr ?? '').toLowerCase(),
        receiver.toLowerCase(),
        String(flowRate),
        String(amount),
        tokenAddr ?? '',
        escrowAddr ?? '',
        result.approveTxHash ?? null,
        result.depositTxHash,
        result.blockNumber,
      ]
    );

    res.status(201).json({
      ...result,
      receiver,
      flowRate: String(flowRate),
      amount:   String(amount),
      note: 'Stream is PENDING — Vara.eth runtime will confirm in the next batch',
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/vara-eth/deposit/:streamId — add deposit to existing stream
// Body: { amount }
// ---------------------------------------------------------------------------
router.post('/deposit/:streamId', async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'Missing: amount' });

    const result = await addDepositToStream({ streamId: req.params.streamId, amount: String(amount) });
    res.json({ streamId: req.params.streamId, ...result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/vara-eth/withdraw/:streamId
// Body: { amount }
// ---------------------------------------------------------------------------
router.post('/withdraw/:streamId', async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'Missing: amount' });

    const result = await withdrawFromStream({ streamId: req.params.streamId, amount: String(amount) });

    // Update DB status to reflect withdraw attempt
    await dbQuery(
      `UPDATE evm_streams SET updated_at = NOW()
       WHERE stream_id = $1`,
      [req.params.streamId]
    ).catch(() => {});

    res.json({ streamId: req.params.streamId, ...result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/vara-eth/stop/:streamId
// ---------------------------------------------------------------------------
router.post('/stop/:streamId', async (req, res, next) => {
  try {
    const result = await stopEvmStream({ streamId: req.params.streamId });

    await dbQuery(
      `UPDATE evm_streams SET status = 'STOPPED', updated_at = NOW()
       WHERE stream_id = $1`,
      [req.params.streamId]
    ).catch(() => {});

    res.json({ streamId: req.params.streamId, status: 'STOPPED', ...result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/vara-eth/claim — claim refunded tokens for relayer address
// ---------------------------------------------------------------------------
router.post('/claim', async (req, res, next) => {
  try {
    const result = await claimEscrowRefund();
    res.json({ ...result, note: 'Claimed refunded tokens from StreamEscrow' });
  } catch (err) { next(err); }
});

export default router;

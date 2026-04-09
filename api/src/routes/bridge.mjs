// Bridge Routes — ETH ↔ Vara bridge info, fee estimation, tx tracking, and history
import { Router } from 'express';
import {
  getBridgeInfo,
  getSupportedRoutes,
  getRouteForToken,
  estimateBridgeFee,
  createBridgeTransaction,
  updateBridgeStatus,
  getBridgeTransaction,
  getBridgeBySourceTx,
  getBridgeHistory,
  getBridgeStats,
} from '../services/bridge-service.mjs';

const router = Router();

// ─── Info & Routes ──────────────────────────────────────────────

/**
 * GET /info — comprehensive bridge information for frontend
 */
router.get('/info', (req, res) => {
  try {
    const info = getBridgeInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /routes — all supported bridge routes
 */
router.get('/routes', (req, res) => {
  try {
    const routes = getSupportedRoutes();
    res.json({ routes, count: routes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /routes/:token — bridge route for a specific token
 */
router.get('/routes/:token', (req, res) => {
  try {
    const route = getRouteForToken(req.params.token);
    if (!route) return res.status(404).json({ error: `No bridge route for token: ${req.params.token}` });
    res.json(route);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Fee Estimation ─────────────────────────────────────────────

/**
 * POST /estimate — estimate bridge fee for a given amount
 * Body: { token: "WUSDC", amount: "1000", direction?: "ethToVara" }
 */
router.post('/estimate', (req, res) => {
  try {
    const { token, amount, direction } = req.body;
    if (!token || !amount) return res.status(400).json({ error: 'Missing: token, amount' });

    const estimate = estimateBridgeFee(token, amount, direction || 'ethToVara');
    res.json(estimate);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Transaction Tracking ─────────────────────────────────────

/**
 * POST /initiate — record a new bridge transaction
 * Body: { wallet, token, amount, direction?, sourceTxHash?, fee?, feeRaw? }
 */
router.post('/initiate', async (req, res, next) => {
  try {
    const { wallet, token, amount, amountRaw, direction, sourceTxHash, sourceChain, destinationChain, fee, feeRaw } = req.body;
    if (!wallet || !token || !amount) return res.status(400).json({ error: 'Missing: wallet, token, amount' });

    const tx = await createBridgeTransaction({
      wallet: wallet.toLowerCase(),
      token,
      amount,
      amountRaw,
      direction: direction || 'ethToVara',
      sourceTxHash,
      sourceChain,
      destinationChain,
      fee,
      feeRaw,
    });

    res.status(201).json({ transaction: tx });
  } catch (err) { next(err); }
});

/**
 * PUT /status/:id — update bridge transaction status
 * Body: { status, destinationTxHash?, confirmations?, error? }
 */
router.put('/status/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid transaction ID' });

    const { status, destinationTxHash, confirmations, error } = req.body;
    if (!status) return res.status(400).json({ error: 'Missing: status' });

    const tx = await updateBridgeStatus(id, status, { destinationTxHash, confirmations, error });
    if (!tx) return res.status(404).json({ error: 'Bridge transaction not found' });

    res.json({ transaction: tx });
  } catch (err) { next(err); }
});

/**
 * GET /tx/:id — get bridge transaction by ID
 */
router.get('/tx/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid transaction ID' });

    const tx = await getBridgeTransaction(id);
    if (!tx) return res.status(404).json({ error: 'Bridge transaction not found' });

    res.json({ transaction: tx });
  } catch (err) { next(err); }
});

/**
 * GET /status/:txHash — get bridge transaction by source tx hash
 */
router.get('/status/:txHash', async (req, res, next) => {
  try {
    const tx = await getBridgeBySourceTx(req.params.txHash);
    if (!tx) return res.status(404).json({ error: 'Bridge transaction not found for this tx hash' });

    res.json({ transaction: tx });
  } catch (err) { next(err); }
});

// ─── History & Stats ─────────────────────────────────────────────

/**
 * GET /history/:wallet — paginated bridge history for a wallet
 * Query: ?limit=20&offset=0&status=completed&token=WUSDC
 */
router.get('/history/:wallet', async (req, res, next) => {
  try {
    const { limit, offset, status, token } = req.query;
    const history = await getBridgeHistory(req.params.wallet, {
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
      status: status || undefined,
      token: token || undefined,
    });

    res.json(history);
  } catch (err) { next(err); }
});

/**
 * GET /stats/:wallet — bridge stats for a wallet
 */
router.get('/stats/:wallet', async (req, res, next) => {
  try {
    const stats = await getBridgeStats(req.params.wallet);
    res.json(stats);
  } catch (err) { next(err); }
});

export default router;

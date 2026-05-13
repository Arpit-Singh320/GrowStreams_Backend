import { Router } from 'express';
import {
  issueVoucher,
  getVoucherForUser,
  listVouchersForUser,
  getVoucherStats,
} from '../services/voucher-service.mjs';

const router = Router();

// POST /api/voucher/issue
// Issue a gasless voucher for the requesting user
router.post('/issue', async (req, res, next) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: 'wallet is required' });

    const result = await issueVoucher(wallet);
    res.json({
      message: 'Voucher issued successfully. Your transactions are now gasless.',
      voucherId: result.voucherId,
      amount: result.amount,
      durationBlocks: result.durationBlocks,
      expiresAt: result.expiresAt,
      programs: result.programs,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/voucher/active?wallet=0x...
// Get the user's currently active voucher (if any)
router.get('/active', async (req, res, next) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: 'wallet query param required' });

    const voucher = await getVoucherForUser(wallet);
    if (!voucher) {
      return res.json({ hasVoucher: false, voucher: null });
    }
    res.json({ hasVoucher: true, voucher });
  } catch (err) { next(err); }
});

// GET /api/voucher/list?wallet=0x...
// List all vouchers (active + expired) for a user
router.get('/list', async (req, res, next) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: 'wallet query param required' });

    const vouchers = await listVouchersForUser(wallet);
    res.json({ vouchers, total: vouchers.length });
  } catch (err) { next(err); }
});

// GET /api/voucher/stats (admin)
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getVoucherStats();
    res.json(stats);
  } catch (err) { next(err); }
});

export default router;

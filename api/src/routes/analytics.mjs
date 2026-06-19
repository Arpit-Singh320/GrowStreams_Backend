import { Router } from 'express';
import {
  getAnalyticsContracts,
  getAnalyticsExplorerLinks,
  getAnalyticsHistory,
  getAnalyticsSummary,
  getCurrentTvl,
  getObservedActivity,
  getTvlHistory,
  getVolumeHistory,
  getRecentTransactions,
  getActiveWallets,
} from '../services/analytics-service.mjs';

const router = Router();

function parsePositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

router.get('/summary', async (req, res, next) => {
  try {
    const days = parsePositiveInt(req.query.days, 30, 1, 365);
    const summary = await getAnalyticsSummary(days);
    res.json(summary);
  } catch (err) { next(err); }
});

router.get('/tvl', async (req, res, next) => {
  try {
    const tvl = await getCurrentTvl();
    res.json(tvl);
  } catch (err) { next(err); }
});

router.get('/activity', async (req, res, next) => {
  try {
    const days = parsePositiveInt(req.query.days, 30, 1, 365);
    const activity = await getObservedActivity(days);
    res.json(activity);
  } catch (err) { next(err); }
});

router.get('/history', async (req, res, next) => {
  try {
    const hours = parsePositiveInt(req.query.hours, 24 * 7, 1, 24 * 365);
    const history = await getAnalyticsHistory(hours);
    res.json(history);
  } catch (err) { next(err); }
});

router.get('/tvl-history', async (req, res, next) => {
  try {
    const days = parsePositiveInt(req.query.days, 30, 1, 365);
    const history = await getTvlHistory(days);
    res.json(history);
  } catch (err) { next(err); }
});

router.get('/volume-history', async (req, res, next) => {
  try {
    const days = parsePositiveInt(req.query.days, 30, 1, 365);
    const history = await getVolumeHistory(days);
    res.json(history);
  } catch (err) { next(err); }
});

router.get('/contracts', async (req, res, next) => {
  try {
    const contracts = await getAnalyticsContracts();
    res.json(contracts);
  } catch (err) { next(err); }
});

router.get('/explorer-links', async (req, res, next) => {
  try {
    const links = await getAnalyticsExplorerLinks();
    res.json({ links, count: links.length });
  } catch (err) { next(err); }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 50, 1, 500);
    const result = await getRecentTransactions(limit);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/wallets', async (req, res, next) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 50, 1, 500);
    const result = await getActiveWallets(limit);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;

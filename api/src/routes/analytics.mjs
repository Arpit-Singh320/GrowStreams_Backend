import { Router } from 'express';
import {
  getAnalyticsContracts,
  getAnalyticsExplorerLinks,
  getAnalyticsHistory,
  getAnalyticsSummary,
  getCurrentTvl,
  getDefiLlamaTvl,
  getDefiLlamaVolume,
  getOnchainStreamMetrics,
  getObservedActivity,
  getTvlHistory,
  getActivityHistory,
  getVolumeHistory,
  getRecentTransactions,
  getActiveWallets,
  getProtocolFees,
  getRetentionCohorts,
  snapshotGvaraSupply,
} from '../services/analytics-service.mjs';
import { pollStreamState } from '../services/state-indexer.mjs';

const router = Router();

function parsePositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

router.get('/summary', async (req, res, next) => {
  try {
    const days = parsePositiveInt(req.query.days, 30, 1, 365);
    const force = req.query.force === '1' || req.query.force === 'true';
    const summary = await getAnalyticsSummary(days, force);
    res.json(summary);
  } catch (err) { next(err); }
});

router.get('/tvl', async (req, res, next) => {
  try {
    const tvl = await getCurrentTvl();
    res.json(tvl);
  } catch (err) { next(err); }
});

router.get('/defillama-tvl', async (req, res, next) => {
  try {
    const tvl = await getDefiLlamaTvl();
    res.json(tvl);
  } catch (err) { next(err); }
});

router.get('/onchain-streams', async (req, res, next) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true';
    const metrics = await getOnchainStreamMetrics({ force });
    res.json(metrics);
  } catch (err) { next(err); }
});

router.get('/defillama-volume', async (req, res, next) => {
  try {
    const volume = await getDefiLlamaVolume();
    res.json(volume);
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

router.get('/activity-history', async (req, res, next) => {
  try {
    const days = parsePositiveInt(req.query.days, 30, 1, 365);
    const history = await getActivityHistory(days);
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

router.get('/fees', async (req, res, next) => {
  try {
    const days = parsePositiveInt(req.query.days, 30, 1, 365);
    const fees = await getProtocolFees(days);
    res.json(fees);
  } catch (err) { next(err); }
});

router.get('/retention', async (req, res, next) => {
  try {
    const days = parsePositiveInt(req.query.days, 30, 1, 365);
    const retention = await getRetentionCohorts({ days });
    res.json(retention);
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
    const offset = parsePositiveInt(req.query.offset, 0, 0, 1_000_000);
    const result = await getRecentTransactions(limit, offset);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/wallets', async (req, res, next) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 50, 1, 500);
    const offset = parsePositiveInt(req.query.offset, 0, 0, 1_000_000);
    const result = await getActiveWallets(limit, offset);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/analytics/admin/trigger-state-poll — manually trigger stream state indexer (admin)
router.post('/admin/trigger-state-poll', async (req, res, next) => {
  try {
    const result = await pollStreamState({ concurrency: 12 });
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/analytics/admin/snapshot-gvara-supply — manually trigger gVARA TotalSupply snapshot (admin)
// Used by frontend after successful wrap/unwrap to capture volume instantly
router.post('/admin/snapshot-gvara-supply', async (req, res, next) => {
  try {
    const result = await snapshotGvaraSupply();
    res.json(result);
  } catch (err) { next(err); }
});

export default router;

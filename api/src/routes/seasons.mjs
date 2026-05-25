import { Router } from 'express';
import {
  getAllSeasons,
  getActiveSeason,
  getSeason,
  getSeasonLeaderboard,
  getUserSeasonStats,
  createSeason,
  updateSeason,
  transitionToNewSeason,
} from '../services/season-service.mjs';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/seasons — List all seasons
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const seasons = await getAllSeasons();
    res.json({ seasons });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/seasons/active — Get the currently active season
// ---------------------------------------------------------------------------
router.get('/active', async (req, res, next) => {
  try {
    const season = await getActiveSeason();
    if (!season) {
      return res.status(404).json({ error: 'No active season found' });
    }
    res.json(season);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/seasons/:idOrSlug — Get a specific season by ID or slug
// ---------------------------------------------------------------------------
router.get('/:idOrSlug', async (req, res, next) => {
  try {
    const season = await getSeason(req.params.idOrSlug);
    if (!season) {
      return res.status(404).json({ error: 'Season not found' });
    }
    res.json(season);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/seasons/:idOrSlug/leaderboard — Get leaderboard for a season
// ---------------------------------------------------------------------------
router.get('/:idOrSlug/leaderboard', async (req, res, next) => {
  try {
    const season = await getSeason(req.params.idOrSlug);
    if (!season) {
      return res.status(404).json({ error: 'Season not found' });
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));

    const result = await getSeasonLeaderboard(season.id, page, limit);
    res.json({
      season: {
        id: season.id,
        name: season.name,
        slug: season.slug,
        status: season.status,
        startAt: season.start_at,
        endAt: season.end_at,
      },
      ...result,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/seasons/:idOrSlug/user/:wallet — Get user stats for a season
// ---------------------------------------------------------------------------
router.get('/:idOrSlug/user/:wallet', async (req, res, next) => {
  try {
    const season = await getSeason(req.params.idOrSlug);
    if (!season) {
      return res.status(404).json({ error: 'Season not found' });
    }

    const stats = await getUserSeasonStats(req.params.wallet, season.id);
    res.json({
      season: {
        id: season.id,
        name: season.name,
        slug: season.slug,
        status: season.status,
      },
      ...stats,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Admin: POST /api/seasons — Create a new season
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, slug, status, startAt, endAt, description, meta } = req.body;
    if (!name || !slug || !startAt) {
      return res.status(400).json({ error: 'Missing required fields: name, slug, startAt' });
    }

    const season = await createSeason({ name, slug, status, startAt, endAt, description, meta });
    res.status(201).json(season);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Admin: PATCH /api/seasons/:id — Update a season
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res, next) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const season = await updateSeason(parseInt(req.params.id, 10), req.body);
    if (!season) {
      return res.status(404).json({ error: 'Season not found' });
    }
    res.json(season);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Admin: POST /api/seasons/transition — End current season and start new one
// ---------------------------------------------------------------------------
router.post('/transition', async (req, res, next) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { newSeasonName, newSeasonSlug } = req.body;
    if (!newSeasonName || !newSeasonSlug) {
      return res.status(400).json({ error: 'Missing required fields: newSeasonName, newSeasonSlug' });
    }

    // Transition to new season
    const newSeason = await transitionToNewSeason(newSeasonName, newSeasonSlug);
    res.status(201).json({
      message: 'Season transition complete',
      newSeason,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Admin: POST /api/seasons/fix-backfill — Fix season_id for all entries
// ---------------------------------------------------------------------------
router.post('/fix-backfill', async (req, res, next) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.headers['authorization']?.replace('Bearer ', '');
    const validKey = process.env.ADMIN_TOKEN || process.env.ADMIN_API_KEY;
    if (adminKey !== validKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { query } = await import('../services/db.mjs');

    // Get season boundaries
    const season1End = '2026-05-24T11:20:00.000Z';

    // Fix seeds_ledger: set season_id based on created_at
    const seedsResult1 = await query(`
      UPDATE seeds_ledger 
      SET season_id = 1 
      WHERE created_at < $1 AND (season_id IS NULL OR season_id != 1)
    `, [season1End]);

    const seedsResult2 = await query(`
      UPDATE seeds_ledger 
      SET season_id = 2 
      WHERE created_at >= $1 AND (season_id IS NULL OR season_id != 2)
    `, [season1End]);

    // Fix quest_completions: set season_id based on created_at
    const qcResult1 = await query(`
      UPDATE quest_completions 
      SET season_id = 1 
      WHERE created_at < $1 AND (season_id IS NULL OR season_id != 1)
    `, [season1End]);

    const qcResult2 = await query(`
      UPDATE quest_completions 
      SET season_id = 2 
      WHERE created_at >= $1 AND (season_id IS NULL OR season_id != 2)
    `, [season1End]);

    res.json({
      message: 'Backfill complete',
      seedsLedger: {
        season1Fixed: seedsResult1.rowCount,
        season2Fixed: seedsResult2.rowCount,
      },
      questCompletions: {
        season1Fixed: qcResult1.rowCount,
        season2Fixed: qcResult2.rowCount,
      },
    });
  } catch (err) { next(err); }
});

export default router;

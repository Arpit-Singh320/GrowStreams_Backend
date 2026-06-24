import { Router } from 'express';
import {
  listSpecialProjects,
  getSpecialProjectBySlug,
  getSpecialProjectProgress,
  getSpecialProjectLeaderboard,
  upsertSpecialProject,
  deleteSpecialProject,
} from '../services/quest-service.mjs';
import { queryOne } from '../services/db.mjs';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_SECRET || 'admin-secret';
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const router = Router();

// GET /api/projects — list all special projects
router.get('/', async (req, res, next) => {
  try {
    const projects = await listSpecialProjects();
    res.json({ projects });
  } catch (err) { next(err); }
});

// GET /api/projects/:slug — project detail (no auth)
router.get('/:slug', async (req, res, next) => {
  try {
    const project = await getSpecialProjectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) { next(err); }
});

// GET /api/projects/:slug/progress?wallet=... — quest progress for a user in this project
router.get('/:slug/progress', async (req, res, next) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: 'wallet is required' });
    const data = await getSpecialProjectProgress(req.params.slug, wallet);
    if (!data) return res.status(404).json({ error: 'Project not found' });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/projects/:slug/leaderboard — project-scoped leaderboard
router.get('/:slug/leaderboard', async (req, res, next) => {
  try {
    const data = await getSpecialProjectLeaderboard(req.params.slug);
    if (!data) return res.status(404).json({ error: 'Project not found' });
    res.json(data);
  } catch (err) { next(err); }
});

// POST /api/projects/admin/upsert — create or update a special project (admin)
router.post('/admin/upsert', requireAdmin, async (req, res, next) => {
  try {
    const { slug, title, description, banner_url, badge_label, status, sort_order, meta } = req.body;
    if (!slug || !title) return res.status(400).json({ error: 'slug and title are required' });
    const project = await upsertSpecialProject({ slug, title, description, banner_url, badge_label, status, sort_order, meta });
    res.json({ message: 'Project saved', project });
  } catch (err) { next(err); }
});

// POST /api/projects/admin/assign-quest — assign an existing quest to a project
router.post('/admin/assign-quest', requireAdmin, async (req, res, next) => {
  try {
    const { quest_slug, project_slug } = req.body;
    if (!quest_slug) return res.status(400).json({ error: 'quest_slug is required' });

    let projectId = null;
    if (project_slug) {
      const project = await getSpecialProjectBySlug(project_slug);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      projectId = project.id;
    }

    const updated = await queryOne(
      `UPDATE quests SET project_id = $1 WHERE slug = $2 RETURNING *`,
      [projectId, quest_slug]
    );
    if (!updated) return res.status(404).json({ error: 'Quest not found' });

    res.json({ message: projectId ? `Quest assigned to project` : 'Quest unassigned from project', quest: updated });
  } catch (err) { next(err); }
});

// DELETE /api/projects/admin/:slug — delete a special project and its quests (admin)
router.delete('/admin/:slug', requireAdmin, async (req, res, next) => {
  try {
    const result = await deleteSpecialProject(req.params.slug);
    res.json({ message: 'Project deleted', ...result });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
});

export default router;

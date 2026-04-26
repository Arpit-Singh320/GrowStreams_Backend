import { Router } from 'express';
import {
  validateInvite,
  registerForQuests,
  getRegistration,
  listQuests,
  getQuestProgress,
  getSeedsBalance,
  awardSeeds,
  isQuestCompleted,
  generateInvites,
  listInvites,
  getQuestStats,
  getQuestBySlug,
  submitQuestProof,
  listPendingSubmissions,
  approvePendingSubmission,
  rejectPendingSubmission,
  getQuestLeaderboard,
} from '../services/quest-service.mjs';
import { runStreamCheck } from '../cron/quest-stream-monitor.mjs';

const router = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_SECRET || 'admin-secret';

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ---------------------------------------------------------------------------
// POST /api/quests/verify-invite
// ---------------------------------------------------------------------------
router.post('/verify-invite', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Invite code is required' });

    const result = await validateInvite(code);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ valid: true, message: 'Invite code is valid' });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/quests/register
// ---------------------------------------------------------------------------
router.post('/register', async (req, res, next) => {
  try {
    const { wallet, email, x_username, github_username, invite_code } = req.body;

    if (!wallet) return res.status(400).json({ error: 'Wallet address is required' });
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!x_username) return res.status(400).json({ error: 'X (Twitter) username is required' });
    if (!github_username) return res.status(400).json({ error: 'GitHub username is required' });
    if (!invite_code) return res.status(400).json({ error: 'Invite code is required' });

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const registration = await registerForQuests(wallet, email, x_username, github_username, invite_code);
    res.status(201).json({
      message: 'Successfully registered for quests',
      registration,
    });
  } catch (err) {
    if (err.message.includes('already registered') || err.message.includes('Invalid invite') ||
        err.message.includes('fully used') || err.message.includes('expired')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/quests
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const quests = await listQuests();
    res.json({ quests });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/quests/me?wallet=...
// ---------------------------------------------------------------------------
router.get('/me', async (req, res, next) => {
  try {
    const wallet = req.query.wallet;
    if (!wallet) return res.status(400).json({ error: 'wallet query param is required' });

    const registration = await getRegistration(wallet);
    if (!registration) {
      return res.json({ registered: false });
    }

    const progress = await getQuestProgress(wallet);
    res.json({ registered: true, ...progress });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/quests/seeds/:wallet
// ---------------------------------------------------------------------------
router.get('/seeds/:wallet', async (req, res, next) => {
  try {
    const { wallet } = req.params;
    const balance = await getSeedsBalance(wallet);
    res.json({ wallet, seeds: balance });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/quests/:slug/claim
// Manually trigger verification for a quest (user-initiated)
// ---------------------------------------------------------------------------
router.post('/:slug/claim', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { wallet, x_username, tweet_url } = req.body;

    if (!wallet) return res.status(400).json({ error: 'Wallet is required' });

    const registration = await getRegistration(wallet);
    if (!registration) {
      return res.status(403).json({ error: 'Not registered for quests. Please register first.' });
    }

    const quest = await getQuestBySlug(slug);
    if (!quest) return res.status(404).json({ error: 'Quest not found' });

    // Block re-claim within the same week (covers repeatable weekly quests).
    const alreadyDoneThisWeek = await isQuestCompleted(wallet, slug);
    if (alreadyDoneThisWeek) {
      return res.status(400).json({ error: 'Quest already completed this week. Refreshes Monday 00:00 UTC.' });
    }

    // Manual review submissions for any X_FOLLOW quest (e.g. follow-x, follow-x-ginie)
    if (quest.quest_type === 'X_FOLLOW') {
      const handle = (x_username || '').trim().replace(/^@/, '');
      if (!handle) return res.status(400).json({ error: 'Please enter your X username' });

      const result = await submitQuestProof(wallet, slug, {
        x_username: handle,
        source: 'manual-review',
      });
      return res.json({
        message: 'Submitted for review. An admin will award XP shortly.',
        slug,
        wallet,
        status: 'PENDING_REVIEW',
        submission: result,
      });
    }

    // Manual review for any X_MENTION quest (e.g. mention-x, mention-x-ginie)
    if (quest.quest_type === 'X_MENTION') {
      const url = (tweet_url || '').trim();
      if (!url) return res.status(400).json({ error: 'Please paste your tweet URL' });
      // basic URL sanity check
      if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) {
        return res.status(400).json({ error: 'Invalid X/Twitter URL' });
      }

      const result = await submitQuestProof(wallet, slug, {
        tweet_url: url,
        source: 'manual-review',
      });
      return res.json({
        message: 'Submitted for review. An admin will award XP shortly.',
        slug,
        wallet,
        status: 'PENDING_REVIEW',
        submission: result,
      });
    }

    // Return 200 immediately, trigger async verification for other quest types
    res.json({
      message: 'Quest claim submitted. Verification in progress — this may take a few minutes.',
      slug,
      wallet,
      status: 'VERIFYING',
    });

    // Fire-and-forget verification depending on quest type
    setImmediate(async () => {
      try {
        if (quest.quest_type === 'GITHUB_STAR') {
          // GitHub star check via stargazers API (paginated; works without token but
          // rate-limited 60/hr per IP if unauthenticated).
          const ghUser = registration.github_username?.toLowerCase();
          const owner = process.env.GITHUB_REPO_OWNER || 'BlockX-AI';
          const repo = process.env.GITHUB_REPO_NAME || 'GrowStreams_Backend';
          const ghToken = process.env.GITHUB_TOKEN;
          if (!ghToken) {
            console.warn('[quest-claim] GITHUB_TOKEN not set — falling back to unauthenticated stargazers fetch (rate-limited).');
          }
          console.log(`[quest-claim] Checking GitHub star for @${ghUser} on ${owner}/${repo}...`);

          try {
            const headers = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'GrowStreams-Quests' };
            if (ghToken) headers.Authorization = `token ${ghToken}`;

            let isStarred = false;
            for (let page = 1; page <= 10 && !isStarred; page++) {
              const resp = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/stargazers?per_page=100&page=${page}`,
                { headers }
              );
              if (!resp.ok) {
                console.warn(`[quest-claim] Stargazers page ${page} returned ${resp.status} ${resp.statusText}`);
                break;
              }
              const stargazers = await resp.json();
              if (!Array.isArray(stargazers) || stargazers.length === 0) break;
              isStarred = stargazers.some(s => s.login?.toLowerCase() === ghUser);
              if (stargazers.length < 100) break; // last page
            }

            if (isStarred) {
              await awardSeeds(wallet, slug, { github_user: registration.github_username, source: 'claim-verify' });
              console.log(`[quest-claim] Star verified and awarded for ${wallet}`);
            } else {
              console.log(`[quest-claim] Star NOT found for @${ghUser}`);
            }
          } catch (ghErr) {
            console.warn(`[quest-claim] GitHub star check failed: ${ghErr.message}`);
          }
        } else if (quest.quest_type === 'GITHUB_PR') {
          // PR quests are awarded via webhook — nothing to check on-demand
          console.log(`[quest-claim] PR quests are verified via GitHub webhook. No manual check.`);
        } else if (quest.quest_type === 'ONCHAIN_STREAM') {
          console.log(`[quest-claim] Triggering stream creation check...`);
          await runStreamCheck();
        }
      } catch (verifyErr) {
        console.error(`[quest-claim] Async verification failed for ${slug}: ${verifyErr.message}`);
      }
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/quests/leaderboard (public)
// Ranked list of all quest-registered users with total XP, completions, handles.
// ---------------------------------------------------------------------------
router.get('/leaderboard', async (req, res, next) => {
  try {
    const rows = await getQuestLeaderboard();
    res.json({ leaderboard: rows, total: rows.length });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/quests/stats (public stats)
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getQuestStats();
    res.json(stats);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// ADMIN ROUTES
// ---------------------------------------------------------------------------

// POST /api/quests/admin/generate-invites
router.post('/admin/generate-invites', requireAdmin, async (req, res, next) => {
  try {
    const { count = 10, max_uses = 1, expires_at = null, created_by = 'ADMIN' } = req.body;

    if (count < 1 || count > 100) {
      return res.status(400).json({ error: 'Count must be between 1 and 100' });
    }

    const codes = await generateInvites(count, created_by, max_uses, expires_at);
    res.status(201).json({
      message: `Generated ${codes.length} invite codes`,
      codes,
    });
  } catch (err) { next(err); }
});

// GET /api/quests/admin/invites
router.get('/admin/invites', requireAdmin, async (req, res, next) => {
  try {
    const status = req.query.status || null; // 'unused', 'used', or null for all
    const invites = await listInvites(status);
    res.json({ invites, total: invites.length });
  } catch (err) { next(err); }
});

// POST /api/quests/admin/award
// Manual seed award (admin override)
router.post('/admin/award', requireAdmin, async (req, res, next) => {
  try {
    const { wallet, quest_slug, proof = {} } = req.body;
    if (!wallet || !quest_slug) {
      return res.status(400).json({ error: 'wallet and quest_slug are required' });
    }

    const completion = await awardSeeds(wallet, quest_slug, proof);
    if (!completion) {
      return res.status(400).json({ error: 'Quest already completed (non-repeatable)' });
    }
    res.json({ message: 'Seeds awarded', completion });
  } catch (err) { next(err); }
});

// GET /api/quests/admin/submissions
// List PENDING quest submissions awaiting manual review
router.get('/admin/submissions', requireAdmin, async (req, res, next) => {
  try {
    const submissions = await listPendingSubmissions();
    res.json({ submissions, total: submissions.length });
  } catch (err) { next(err); }
});

// POST /api/quests/admin/submissions/:id/approve
router.post('/admin/submissions/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const completion = await approvePendingSubmission(id);
    res.json({ message: 'Submission approved', completion });
  } catch (err) {
    if (err.message?.includes('not found') || err.message?.includes('not pending')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// POST /api/quests/admin/submissions/:id/reject
router.post('/admin/submissions/:id/reject', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { reason = '' } = req.body || {};
    const completion = await rejectPendingSubmission(id, reason);
    res.json({ message: 'Submission rejected', completion });
  } catch (err) {
    if (err.message?.includes('not found') || err.message?.includes('not pending')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// GET /api/quests/admin/stats
router.get('/admin/stats', requireAdmin, async (req, res, next) => {
  try {
    const stats = await getQuestStats();
    res.json(stats);
  } catch (err) { next(err); }
});

export default router;

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
} from '../services/quest-service.mjs';
import { runFollowCheck, runMentionCheck } from '../cron/quest-x-monitor.mjs';
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
    const { wallet } = req.body;

    if (!wallet) return res.status(400).json({ error: 'Wallet is required' });

    const registration = await getRegistration(wallet);
    if (!registration) {
      return res.status(403).json({ error: 'Not registered for quests. Please register first.' });
    }

    const quest = await getQuestBySlug(slug);
    if (!quest) return res.status(404).json({ error: 'Quest not found' });

    // Check if already completed (non-repeatable)
    if (!quest.repeatable) {
      const alreadyDone = await isQuestCompleted(wallet, slug);
      if (alreadyDone) {
        return res.status(400).json({ error: 'Quest already completed' });
      }
    }

    // Return 200 immediately, trigger async verification
    res.json({
      message: 'Quest claim submitted. Verification in progress — this may take a few minutes.',
      slug,
      wallet,
      status: 'VERIFYING',
    });

    // Fire-and-forget verification depending on quest type
    setImmediate(async () => {
      try {
        if (slug === 'follow-x' || slug === 'mention-x') {
          // 🚨 X API VERIFICATION DISABLED - burns ~$5/claim due to per-user-record pricing
          // Requires manual admin review via POST /api/quests/admin/award
          console.warn(`[quest-claim] ${slug} verification is DISABLED (X API too expensive). Needs admin review.`);
        } else if (slug === 'star-repo') {
          // Instant GitHub star check via API
          console.log(`[quest-claim] Checking GitHub star for @${registration.github_username}...`);
          const ghToken = process.env.GITHUB_TOKEN;
          if (ghToken) {
            try {
              const resp = await fetch(
                `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER || 'BlockX-AI'}/${process.env.GITHUB_REPO_NAME || 'GrowStreams_Backend'}/stargazers?per_page=100`,
                { headers: { Authorization: `token ${ghToken}`, Accept: 'application/vnd.github.v3+json' } }
              );
              if (resp.ok) {
                const stargazers = await resp.json();
                const isStarred = stargazers.some(s => s.login?.toLowerCase() === registration.github_username.toLowerCase());
                if (isStarred) {
                  await awardSeeds(wallet, 'star-repo', { github_user: registration.github_username, source: 'claim-verify' });
                  console.log(`[quest-claim] Star verified and awarded for ${wallet}`);
                } else {
                  console.log(`[quest-claim] Star NOT found for @${registration.github_username}`);
                }
              }
            } catch (ghErr) {
              console.warn(`[quest-claim] GitHub star check failed: ${ghErr.message}`);
            }
          }
        } else if (slug === 'raise-pr') {
          // PR quests are awarded via webhook — nothing to check on-demand
          console.log(`[quest-claim] PR quests are verified via GitHub webhook. No manual check.`);
        } else if (slug === 'create-stream') {
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

// GET /api/quests/admin/stats
router.get('/admin/stats', requireAdmin, async (req, res, next) => {
  try {
    const stats = await getQuestStats();
    res.json(stats);
  } catch (err) { next(err); }
});

export default router;

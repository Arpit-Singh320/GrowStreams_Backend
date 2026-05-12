import { Router } from 'express';
import { query as sailsQuery, getContract } from '../sails-client.mjs';
import {
  validateInvite,
  registerForQuests,
  getRegistration,
  listQuests,
  getQuestProgress,
  getSeedsBalance,
  awardSeeds,
  awardWelcomeBonus,
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
  getReferralStats,
  syncOnchainMints,
} from '../services/quest-service.mjs';
import { runStreamCheck } from '../cron/quest-stream-monitor.mjs';
import {
  listQuestCampaigns,
  getQuestCampaignBySlug,
  getCampaignProgress,
  getCampaignLeaderboardBySlug,
  getCampaignPrizeBoard,
  upsertQuestCampaign,
  assignQuestToCampaign,
  upsertQuest,
  listAllQuests,
  deleteQuestCampaign,
  deleteQuest,
} from '../services/quest-campaign-service.mjs';
import { sendOtp, verifyOtp } from '../services/otp-service.mjs';

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
// POST /api/quests/otp/send  — send 6-digit OTP to email
// POST /api/quests/otp/verify — verify OTP
// ---------------------------------------------------------------------------
router.post('/otp/send', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    await sendOtp(email.trim().toLowerCase());
    res.json({ sent: true });
  } catch (err) { next(err); }
});

router.post('/otp/verify', async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'email and code are required' });
    const result = verifyOtp(email.trim().toLowerCase(), code);
    res.json(result);
  } catch (err) { next(err); }
});

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
    const { wallet, evm_address, email, display_name, ref_code } = req.body;

    // At least one address type required
    if (!wallet && !evm_address) {
      return res.status(400).json({ error: 'wallet (SS58) or evm_address (0x) is required' });
    }

    // Basic EVM address validation
    if (evm_address && !/^0x[0-9a-fA-F]{40}$/.test(evm_address)) {
      return res.status(400).json({ error: 'Invalid evm_address format — expected 0x followed by 40 hex chars' });
    }

    if (!display_name || !display_name.trim()) return res.status(400).json({ error: 'Display name is required' });
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const registration = await registerForQuests(wallet, email, display_name, evm_address || null, ref_code || null);
    res.status(201).json({
      message: 'Successfully registered for quests',
      registration,
    });

    // Award the one-time welcome bonus asynchronously — must not block the response
    setImmediate(async () => {
      try {
        const primaryWallet = wallet || evm_address;
        await awardWelcomeBonus(primaryWallet);
      } catch (wbErr) {
        console.warn(`[register] Welcome bonus failed for ${wallet || evm_address}: ${wbErr.message}`);
      }
    });
  } catch (err) {
    if (err.message.includes('already registered')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/quests/profile  — update display_name for a registered wallet
// ---------------------------------------------------------------------------
router.patch('/profile', async (req, res, next) => {
  try {
    const { wallet, display_name } = req.body;
    if (!wallet) return res.status(400).json({ error: 'wallet is required' });
    if (!display_name || !display_name.trim()) return res.status(400).json({ error: 'display_name is required' });

    const registration = await getRegistration(wallet);
    if (!registration) return res.status(404).json({ error: 'Wallet not registered for quests' });

    const { queryOne } = await import('../services/db.mjs');
    const updated = await queryOne(
      `UPDATE quest_registrations SET display_name = $1 WHERE wallet = $2 OR evm_address = $2 RETURNING *`,
      [display_name.trim(), wallet]
    );
    res.json({ message: 'Profile updated', registration: updated });
  } catch (err) { next(err); }
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

    // Welcome bonus is auto-awarded on registration — cannot be manually claimed.
    if (quest.quest_type === 'WELCOME') {
      return res.status(400).json({ error: 'This quest is awarded automatically when you register.' });
    }

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

    // Retweet quests: user submits URL of their retweet for admin review
    if (quest.quest_type === 'X_RETWEET') {
      const url = (tweet_url || '').trim();
      if (!url) return res.status(400).json({ error: 'Please paste the URL of your retweet' });
      if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) {
        return res.status(400).json({ error: 'Invalid X/Twitter URL' });
      }

      const result = await submitQuestProof(wallet, slug, {
        tweet_url: url,
        quest_type: 'retweet',
        source: 'manual-review',
      });
      return res.json({
        message: 'Retweet submitted for review. Seeds will be awarded once verified.',
        slug,
        wallet,
        status: 'PENDING_REVIEW',
        submission: result,
      });
    }

    // Original tweet quests: user submits their tweet URL; admin verifies keyword + mention
    if (quest.quest_type === 'X_TWEET_KEYWORD') {
      const url = (tweet_url || '').trim();
      if (!url) return res.status(400).json({ error: 'Please paste the URL of your tweet' });
      if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) {
        return res.status(400).json({ error: 'Invalid X/Twitter URL' });
      }

      const result = await submitQuestProof(wallet, slug, {
        tweet_url: url,
        quest_type: 'keyword-tweet',
        required_keyword: quest.meta?.required_keyword || 'build',
        required_mention: quest.meta?.required_mention || '@GrowStreams',
        source: 'manual-review',
      });
      return res.json({
        message: 'Tweet submitted for review. Our team will verify it has the required keyword and mention.',
        slug,
        wallet,
        status: 'PENDING_REVIEW',
        submission: result,
      });
    }

    // Visit URL / Telegram join: honour-system, auto-approve immediately
    if (quest.quest_type === 'VISIT_URL' || quest.quest_type === 'TELEGRAM_JOIN') {
      const completion = await awardSeeds(wallet, slug, { source: 'self-reported' });
      if (!completion) {
        return res.status(400).json({ error: 'Quest already completed.' });
      }
      return res.json({
        message: `Quest complete! ${quest.seeds_reward} Seeds awarded.`,
        slug,
        wallet,
        status: 'VERIFIED',
        completion,
      });
    }

    // REFERRAL quests cannot be manually claimed — they trigger automatically on referral registration
    if (quest.quest_type === 'REFERRAL') {
      return res.status(400).json({
        error: 'Referral Seeds are awarded automatically when someone registers with your referral code.',
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
        if (quest.quest_type === 'ONCHAIN_STREAM') {
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
// GET /api/quests/referral/:wallet
// Returns the user's referral code, link, and referral stats.
// ---------------------------------------------------------------------------
router.get('/referral/:wallet', async (req, res, next) => {
  try {
    const { wallet } = req.params;
    const stats = await getReferralStats(wallet);
    if (!stats) {
      return res.status(404).json({ error: 'Wallet not registered for quests' });
    }
    res.json(stats);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/quests/leaderboard (public)
// Ranked list of all quest-registered users with total XP, completions, handles.
// ---------------------------------------------------------------------------
router.get('/leaderboard', async (req, res, next) => {
  try {
    const rows = await getQuestLeaderboard();
    // Also fetch on-chain total supply so the UI can show real minted XP
    let onchainTotal = null;
    try {
      if (getContract('questSeeds')) {
        const raw = await sailsQuery('questSeeds', 'TotalSupply');
        onchainTotal = Number(raw);
      }
    } catch (_) { /* non-fatal */ }
    res.json({ leaderboard: rows, total: rows.length, onchain_total_xp: onchainTotal });
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
// CAMPAIGN COLLECTION ROUTES
// ---------------------------------------------------------------------------

// GET /api/quests/campaigns
// List all quest campaigns (for the /earn page — the cards grid)
router.get('/campaigns', async (req, res, next) => {
  try {
    const campaigns = await listQuestCampaigns();
    res.json({ campaigns, total: campaigns.length });
  } catch (err) { next(err); }
});

// GET /api/quests/campaigns/:slug
// Single campaign with full quest list (for the campaign detail page)
router.get('/campaigns/:slug', async (req, res, next) => {
  try {
    const campaign = await getQuestCampaignBySlug(req.params.slug);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err) { next(err); }
});

// GET /api/quests/campaigns/:slug/progress?wallet=...
// Per-wallet progress inside a campaign (drives the campaign detail page when logged in)
router.get('/campaigns/:slug/progress', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: 'wallet query param is required' });

    const registration = await getRegistration(wallet);
    if (!registration) {
      return res.status(403).json({ error: 'Not registered for quests. Please register first.' });
    }

    const progress = await getCampaignProgress(slug, wallet);
    if (!progress) return res.status(404).json({ error: 'Campaign not found' });

    res.json(progress);
  } catch (err) { next(err); }
});

// GET /api/quests/campaigns/:slug/leaderboard?limit=50
// Campaign-scoped leaderboard ranked by Seeds earned in that campaign
router.get('/campaigns/:slug/leaderboard', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const rows = await getCampaignLeaderboardBySlug(slug, limit);
    if (rows === null) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ campaign_slug: slug, leaderboard: rows, total: rows.length });
  } catch (err) { next(err); }
});

// GET /api/quests/campaigns/:slug/prize-board?limit=10
// Prize board with VARA amounts overlaid on top-N users (Ginie campaign)
router.get('/campaigns/:slug/prize-board', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const board = await getCampaignPrizeBoard(slug, limit);
    if (!board) return res.status(404).json({ error: 'Campaign not found' });
    res.json(board);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// ADMIN ROUTES
// ---------------------------------------------------------------------------

// POST /api/quests/admin/campaigns — create or update a campaign
router.post('/admin/campaigns', requireAdmin, async (req, res, next) => {
  try {
    const campaign = await upsertQuestCampaign(req.body);
    res.status(201).json({ message: 'Campaign upserted', campaign });
  } catch (err) { next(err); }
});

// POST /api/quests/admin/campaigns/:campaignSlug/assign/:questSlug
// Assign a quest to a campaign
router.post('/admin/campaigns/:campaignSlug/assign/:questSlug', requireAdmin, async (req, res, next) => {
  try {
    const { campaignSlug, questSlug } = req.params;
    const quest = await assignQuestToCampaign(questSlug, campaignSlug);
    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    res.json({ message: `Quest '${questSlug}' assigned to campaign '${campaignSlug}'`, quest });
  } catch (err) {
    if (err.message?.includes('not found')) return res.status(404).json({ error: err.message });
    next(err);
  }
});

// POST /api/quests/admin/sync-onchain
// Retry on-chain minting for all VERIFIED completions where tx_hash is NULL
router.post('/admin/sync-onchain', requireAdmin, async (req, res, next) => {
  try {
    const result = await syncOnchainMints();
    res.json({ message: 'On-chain sync complete', ...result });
  } catch (err) {
    if (err.message?.includes('not loaded')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

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

// GET /api/quests/admin/quests — list all quests with campaign info
router.get('/admin/quests', requireAdmin, async (req, res, next) => {
  try {
    const quests = await listAllQuests();
    res.json({ quests, total: quests.length });
  } catch (err) { next(err); }
});

// POST /api/quests/admin/quests — create or update a quest
router.post('/admin/quests', requireAdmin, async (req, res, next) => {
  try {
    const quest = await upsertQuest(req.body);
    res.status(201).json({ message: 'Quest upserted', quest });
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// GET /api/quests/admin/campaigns — list all campaigns (for dropdowns)
router.get('/admin/campaigns', requireAdmin, async (req, res, next) => {
  try {
    const campaigns = await listQuestCampaigns();
    res.json({ campaigns, total: campaigns.length });
  } catch (err) { next(err); }
});

// DELETE /api/quests/admin/campaigns/:slug — delete campaign + all its quests
router.delete('/admin/campaigns/:slug', requireAdmin, async (req, res, next) => {
  try {
    const result = await deleteQuestCampaign(req.params.slug);
    res.json({ message: 'Campaign deleted', ...result });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/quests/admin/quests/:slug — delete a single quest
router.delete('/admin/quests/:slug', requireAdmin, async (req, res, next) => {
  try {
    const result = await deleteQuest(req.params.slug);
    res.json({ message: 'Quest deleted', ...result });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
});

export default router;

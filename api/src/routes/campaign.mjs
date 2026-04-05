import { Router } from 'express';
import { query, queryOne, queryAll } from '../services/db.mjs';
import {
  awardXP,
  getLeaderboard,
  getParticipantStats,
  calculateAllPayouts,
} from '../services/xp-service.mjs';
import { createUser, getUserByWallet } from '../services/user-service.mjs';

const router = Router();

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter: max 5 registrations per IP per minute
// ---------------------------------------------------------------------------
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Periodically clean stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// POST /api/campaign/register
// ---------------------------------------------------------------------------
router.post('/register', async (req, res, next) => {
  try {
    // Rate limit check
    const clientIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ error: 'Too many registration attempts. Try again in 1 minute.' });
    }

    const { wallet, github_handle, x_handle, track, referral_code } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: 'Missing required field: wallet' });
    }
    if (!track || !['OSS', 'CONTENT', 'BOTH'].includes(track)) {
      return res.status(400).json({ error: 'Invalid track. Must be OSS, CONTENT, or BOTH' });
    }
    if (track === 'OSS' && !github_handle) {
      return res.status(400).json({ error: 'github_handle is required for OSS track' });
    }
    if (track === 'CONTENT' && !x_handle) {
      return res.status(400).json({ error: 'x_handle is required for CONTENT track' });
    }
    if (track === 'BOTH' && !github_handle && !x_handle) {
      return res.status(400).json({ error: 'At least one handle (github or x) is required for BOTH track' });
    }

    // Ensure the user exists (auto-create if needed)
    let user = await getUserByWallet(wallet);
    if (!user) {
      try {
        user = await createUser(wallet, github_handle, x_handle, referral_code || null);
      } catch (userErr) {
        if (userErr.status === 409) {
          user = userErr.user; // already exists, reuse
        } else if (userErr.status === 400) {
          return res.status(400).json({ error: userErr.message });
        } else {
          throw userErr;
        }
      }
    }

    const display_name = github_handle || x_handle || wallet.slice(0, 12);

    let data;
    try {
      data = await queryOne(
        `INSERT INTO participants (wallet, github_handle, x_handle, display_name, track, user_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [wallet, github_handle || null, x_handle || null, display_name, track, user ? user.id : null]
      );
    } catch (dbErr) {
      if (dbErr.code === '23505') {
        return res.status(409).json({ error: 'Participant already registered or handle already taken' });
      }
      throw dbErr;
    }

    // Award join bonus so new users appear on leaderboard immediately
    const JOIN_BONUS = parseInt(process.env.JOIN_BONUS_XP || '10', 10);
    if (JOIN_BONUS > 0) {
      try {
        await awardXP(wallet, JOIN_BONUS, 'JOIN_BONUS');
        console.log(`[campaign] Join bonus: +${JOIN_BONUS} XP to ${wallet}`);
      } catch (bonusErr) {
        console.warn(`[campaign] Join bonus failed for ${wallet}: ${bonusErr.message}`);
      }
    }

    console.log(`[campaign] Registered ${wallet} (${track}) -> user ${user?.id || 'none'}`);
    res.status(201).json(data);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/campaign/participant/:wallet
// ---------------------------------------------------------------------------
router.get('/participant/:wallet', async (req, res, next) => {
  try {
    const { wallet } = req.params;
    const stats = await getParticipantStats(wallet);
    res.json(stats);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/campaign/leaderboard (convenience proxy to /api/leaderboard)
// ---------------------------------------------------------------------------
router.get('/leaderboard', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const track = req.query.track || null;

    if (track && !['OSS', 'CONTENT', 'BOTH'].includes(track)) {
      return res.status(400).json({ error: 'Invalid track. Must be OSS, CONTENT, or BOTH' });
    }

    const result = await getLeaderboard(page, limit, track);
    res.json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/campaign/config
// ---------------------------------------------------------------------------
router.get('/config', (req, res) => {
  res.json({
    campaignStartDate: process.env.CAMPAIGN_START_DATE || null,
    campaignEndDate: process.env.CAMPAIGN_END_DATE || null,
    poolUSDC: parseFloat(process.env.CAMPAIGN_POOL_USDC || '100'),
    scoreThreshold: parseInt(process.env.SCORE_THRESHOLD || '70', 10),
    xpTiers: {
      oss: {
        initial: {
          '70-79': parseInt(process.env.OSS_XP_70 || '700', 10),
          '80-89': parseInt(process.env.OSS_XP_80 || '1200', 10),
          '90-100': parseInt(process.env.OSS_XP_90 || '2000', 10),
        },
        daily: {
          '70-79': parseInt(process.env.OSS_DAILY_70 || '100', 10),
          '80-89': parseInt(process.env.OSS_DAILY_80 || '150', 10),
          '90-100': parseInt(process.env.OSS_DAILY_90 || '200', 10),
        },
        mergeBonus: parseInt(process.env.MERGE_BONUS_XP || '500', 10),
      },
      content: {
        initial: {
          '70-79': parseInt(process.env.CONTENT_XP_70 || '500', 10),
          '80-89': parseInt(process.env.CONTENT_XP_80 || '800', 10),
          '90-100': parseInt(process.env.CONTENT_XP_90 || '1200', 10),
        },
        threadBonus: '30%',
        viralBonus: 800,
        reshareBonus: 500,
      },
    },
    payoutFormula: '(userXP / totalXP) * poolUSDC',
    minimumPayout: 1.0,
  });
});

// ---------------------------------------------------------------------------
// POST /api/campaign/payout-snapshot (admin only)
// ---------------------------------------------------------------------------
router.post('/payout-snapshot', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header: Bearer <ADMIN_SECRET>' });
    }

    const token = authHeader.slice(7);
    if (token !== adminSecret) {
      return res.status(401).json({ error: 'Invalid admin secret' });
    }

    const payouts = await calculateAllPayouts();
    console.log(`[campaign] Payout snapshot generated: ${payouts.totalParticipants} participants, ${payouts.totalXP} total XP`);
    res.json(payouts);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/campaign/award-xp (admin only — for testing)
// ---------------------------------------------------------------------------
router.post('/award-xp', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header: Bearer <ADMIN_SECRET>' });
    }
    if (authHeader.slice(7) !== adminSecret) {
      return res.status(401).json({ error: 'Invalid admin secret' });
    }

    const { wallet, xp, reason } = req.body;
    if (!wallet || !xp || !reason) {
      return res.status(400).json({ error: 'Missing: wallet, xp, reason' });
    }

    const event = await awardXP(wallet, parseInt(xp, 10), reason);
    res.json({ success: true, event });
  } catch (err) { next(err); }
});

// POST /api/campaign/poll-tweets — manually trigger tweet poll (admin)
router.post('/poll-tweets', async (req, res, next) => {
  try {
    const { pollRecentTweets, pollRegisteredUsers } = await import('../services/x-agent.mjs');
    await pollRecentTweets();
    await pollRegisteredUsers();
    res.json({ success: true, message: 'Poll completed (search + user timelines)' });
  } catch (err) { next(err); }
});

// POST /api/campaign/reprocess-failed — reprocess contributions that failed to get XP (admin)
router.post('/reprocess-failed', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header: Bearer <ADMIN_SECRET>' });
    }
    if (authHeader.slice(7) !== adminSecret) {
      return res.status(401).json({ error: 'Invalid admin secret' });
    }

    // Find all contributions with xp_awarded = 0 or status = REJECTED/PENDING_REEVAL
    const failedContributions = await queryAll(
      `SELECT c.*, p.wallet, p.x_handle 
       FROM contributions c
       JOIN participants p ON c.wallet = p.wallet
       WHERE c.track = 'CONTENT' 
       AND c.tweet_id IS NOT NULL
       AND (c.xp_awarded = 0 OR c.status IN ('REJECTED', 'PENDING_REEVAL'))
       ORDER BY c.submitted_at DESC`
    );

    if (!failedContributions.length) {
      return res.json({ reprocessed: 0, message: 'No failed contributions found' });
    }

    console.log(`[campaign] Reprocessing ${failedContributions.length} failed contributions`);

    // Delete these contributions so they can be re-processed
    const tweetIds = failedContributions.map(c => c.tweet_id);
    const placeholders = tweetIds.map((_, i) => `$${i + 1}`).join(',');
    await query(`DELETE FROM contributions WHERE tweet_id IN (${placeholders})`, tweetIds);

    // Also delete associated XP events (if any)
    const contributionIds = failedContributions.map(c => c.id);
    if (contributionIds.length) {
      const ph2 = contributionIds.map((_, i) => `$${i + 1}`).join(',');
      await query(`DELETE FROM xp_events WHERE contribution_id IN (${ph2})`, contributionIds);
    }

    // Trigger re-polling
    const { pollRegisteredUsers } = await import('../services/x-agent.mjs');
    await pollRegisteredUsers();

    res.json({
      reprocessed: failedContributions.length,
      tweets: failedContributions.map(c => ({
        tweetId: c.tweet_id,
        user: c.x_handle || c.wallet.slice(0, 12),
        previousStatus: c.status,
        previousXP: c.xp_awarded
      })),
      message: 'Failed contributions deleted and re-polling triggered'
    });
  } catch (err) { next(err); }
});

// POST /api/campaign/force-reeval — force immediate re-evaluation of PENDING_REEVAL tweets (admin)
router.post('/force-reeval', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header: Bearer <ADMIN_SECRET>' });
    }
    if (authHeader.slice(7) !== adminSecret) {
      return res.status(401).json({ error: 'Invalid admin secret' });
    }

    // Find all PENDING_REEVAL contributions
    const pendingContributions = await queryAll(
      `SELECT c.*, p.wallet 
       FROM contributions c
       JOIN participants p ON c.wallet = p.wallet
       WHERE c.track = 'CONTENT' 
       AND c.tweet_id IS NOT NULL
       AND c.status = 'PENDING_REEVAL'
       ORDER BY c.submitted_at DESC`
    );

    if (!pendingContributions.length) {
      return res.json({ reevaluated: 0, message: 'No pending contributions found' });
    }

    console.log(`[campaign] Force re-evaluating ${pendingContributions.length} pending contributions`);

    // Trigger re-evaluation for each
    const { reevaluateTweet } = await import('../services/x-agent.mjs');
    const results = [];

    for (const c of pendingContributions) {
      try {
        await reevaluateTweet(c.id, c.tweet_id, c.wallet);
        results.push({ tweetId: c.tweet_id, status: 'reevaluated' });
      } catch (err) {
        console.error(`[campaign] Failed to re-evaluate ${c.tweet_id}: ${err.message}`);
        results.push({ tweetId: c.tweet_id, status: 'failed', error: err.message });
      }
    }

    res.json({
      reevaluated: results.filter(r => r.status === 'reevaluated').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
      message: 'Force re-evaluation completed'
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/campaign/participants/cleanup (admin only)
// Remove mock/test participants and all their related data
// ---------------------------------------------------------------------------
router.post('/participants/cleanup', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header: Bearer <ADMIN_SECRET>' });
    }
    if (authHeader.slice(7) !== adminSecret) {
      return res.status(401).json({ error: 'Invalid admin secret' });
    }

    // Accept a list of display_names or wallets to remove
    const { display_names, wallets } = req.body;
    if ((!display_names || !display_names.length) && (!wallets || !wallets.length)) {
      return res.status(400).json({ error: 'Provide display_names or wallets array to remove' });
    }

    // Find matching participants
    let participants = [];
    if (display_names?.length) {
      const placeholders = display_names.map((_, i) => `$${i + 1}`).join(',');
      const rows = await queryAll(
        `SELECT wallet, display_name FROM participants WHERE display_name IN (${placeholders})`,
        display_names
      );
      participants.push(...rows);
    }
    if (wallets?.length) {
      const offset = participants.length ? display_names.length : 0;
      const placeholders = wallets.map((_, i) => `$${i + 1}`).join(',');
      const rows = await queryAll(
        `SELECT wallet, display_name FROM participants WHERE wallet IN (${placeholders})`,
        wallets
      );
      participants.push(...rows);
    }

    // Deduplicate by wallet
    const uniqueWallets = [...new Set(participants.map(p => p.wallet))];

    if (!uniqueWallets.length) {
      return res.json({ removed: 0, message: 'No matching participants found' });
    }

    const ph = uniqueWallets.map((_, i) => `$${i + 1}`).join(',');

    // Delete in correct FK order
    await query(`DELETE FROM daily_snapshots WHERE wallet IN (${ph})`, uniqueWallets);
    await query(`DELETE FROM xp_events WHERE wallet IN (${ph})`, uniqueWallets);
    await query(`DELETE FROM contributions WHERE wallet IN (${ph})`, uniqueWallets);
    await query(`DELETE FROM participants WHERE wallet IN (${ph})`, uniqueWallets);

    console.log(`[campaign] Cleaned up ${uniqueWallets.length} mock participants: ${participants.map(p => p.display_name).join(', ')}`);
    res.json({
      removed: uniqueWallets.length,
      participants: participants.map(p => ({ wallet: p.wallet, displayName: p.display_name })),
    });
  } catch (err) { next(err); }
});

export default router;

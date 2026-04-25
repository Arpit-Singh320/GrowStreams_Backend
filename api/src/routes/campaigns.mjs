import { Router } from 'express';
import {
  createCampaign,
  fundCampaign,
  getCampaign,
  listCampaigns,
  getActiveCampaigns,
  enrollInCampaign,
  getCampaignParticipants,
  getCampaignLeaderboard,
  getCampaignPayoutPreview,
  executeCampaignPayout,
} from '../services/campaign-service.mjs';
import { getKeyring } from '../sails-client.mjs';
import { decodeAddress } from '@polkadot/keyring';

const router = Router();

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (same pattern as campaign.mjs / users.mjs)
// ---------------------------------------------------------------------------
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 10;

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

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// Admin auth helper
// ---------------------------------------------------------------------------
function requireAdmin(req) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    throw Object.assign(new Error('ADMIN_SECRET not configured on server'), { status: 500 });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing Authorization header: Bearer <ADMIN_SECRET>'), { status: 401 });
  }

  if (authHeader.slice(7) !== adminSecret) {
    throw Object.assign(new Error('Invalid admin secret'), { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/campaigns/platform-escrow — returns platform server wallet address
// Users transfer their campaign pool WUSDC to this address at creation time.
// ---------------------------------------------------------------------------
router.get('/platform-escrow', async (req, res, next) => {
  try {
    const keyring = getKeyring();
    if (!keyring) {
      return res.status(500).json({ error: 'Platform escrow wallet not configured (VARA_SEED missing)' });
    }
    const ss58 = keyring.address;
    let actorId = null;
    try {
      const decoded = decodeAddress(ss58);
      actorId = '0x' + Buffer.from(decoded).toString('hex').padStart(64, '0');
    } catch (err) {
      return res.status(500).json({ error: `Failed to decode platform address: ${err.message}` });
    }
    res.json({ ss58, actorId });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/campaigns — list all campaigns (filterable)
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const status = req.query.status || null;
    const trackType = req.query.track_type || null;

    if (status && !['DRAFT', 'FUNDED', 'ACTIVE', 'ENDED', 'SETTLING', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }
    if (trackType && !['OSS', 'CONTENT', 'BOTH'].includes(trackType)) {
      return res.status(400).json({ error: 'Invalid track_type filter' });
    }

    const result = await listCampaigns({ status, trackType, page, limit });
    res.json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/campaigns/active — list only ACTIVE campaigns
// ---------------------------------------------------------------------------
router.get('/active', async (req, res, next) => {
  try {
    const campaigns = await getActiveCampaigns();
    res.json({ campaigns, count: campaigns.length });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id — single campaign details
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    res.json(campaign);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/campaigns — create a new campaign (DRAFT)
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const clientIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ error: 'Too many requests. Try again in 1 minute.' });
    }

    const {
      creator_wallet, title, description, pool_amount, token,
      track_type, start_date, end_date,
      required_hashtags, required_mentions,
      github_repo_url, github_issue_labels,
      max_oss_contributions, max_content_contributions, score_threshold,
    } = req.body;

    // Validation
    if (!creator_wallet) return res.status(400).json({ error: 'Missing: creator_wallet' });
    if (!title || title.length > 200) return res.status(400).json({ error: 'title is required (max 200 chars)' });
    if (!pool_amount || parseFloat(pool_amount) <= 0) return res.status(400).json({ error: 'pool_amount must be > 0' });
    if (!start_date) return res.status(400).json({ error: 'Missing: start_date' });
    if (!end_date) return res.status(400).json({ error: 'Missing: end_date' });

    const start = new Date(start_date);
    const end = new Date(end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for start_date or end_date' });
    }
    if (end <= start) {
      return res.status(400).json({ error: 'end_date must be after start_date' });
    }

    if (track_type && !['OSS', 'CONTENT', 'BOTH'].includes(track_type)) {
      return res.status(400).json({ error: 'track_type must be OSS, CONTENT, or BOTH' });
    }

    if (track_type === 'OSS' && !github_repo_url) {
      return res.status(400).json({ error: 'github_repo_url is required for OSS track campaigns' });
    }

    const campaign = await createCampaign({
      creatorWallet: creator_wallet,
      title,
      description,
      poolAmount: parseFloat(pool_amount),
      token,
      trackType: track_type,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      requiredHashtags: required_hashtags || null,
      requiredMentions: required_mentions || null,
      githubRepoUrl: github_repo_url || null,
      githubIssueLabels: github_issue_labels || null,
      maxOssContributions: max_oss_contributions,
      maxContentContributions: max_content_contributions,
      scoreThreshold: score_threshold,
    });

    res.status(201).json(campaign);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/fund — fund a campaign (DRAFT → FUNDED/ACTIVE)
// ---------------------------------------------------------------------------
router.post('/:id/fund', async (req, res, next) => {
  try {
    const { wallet, tx_hash } = req.body;
    if (!wallet) return res.status(400).json({ error: 'Missing: wallet' });

    const campaign = await fundCampaign(req.params.id, wallet, tx_hash || null);
    res.json(campaign);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/enroll — enroll wallet in campaign
// ---------------------------------------------------------------------------
router.post('/:id/enroll', async (req, res, next) => {
  try {
    const clientIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ error: 'Too many requests. Try again in 1 minute.' });
    }

    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: 'Missing: wallet' });

    const enrollment = await enrollInCampaign(req.params.id, wallet);
    res.status(201).json(enrollment);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/leaderboard — per-campaign leaderboard
// ---------------------------------------------------------------------------
router.get('/:id/leaderboard', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));

    const result = await getCampaignLeaderboard(req.params.id, page, limit);
    res.json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/participants — list participants
// ---------------------------------------------------------------------------
router.get('/:id/participants', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));

    const result = await getCampaignParticipants(req.params.id, page, limit);
    res.json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/payout-preview — preview payout distribution
// ---------------------------------------------------------------------------
router.get('/:id/payout-preview', async (req, res, next) => {
  try {
    const preview = await getCampaignPayoutPreview(req.params.id);
    res.json(preview);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/execute-payout — execute payout (admin-gated)
// ---------------------------------------------------------------------------
router.post('/:id/execute-payout', async (req, res, next) => {
  try {
    requireAdmin(req);

    const result = await executeCampaignPayout(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;

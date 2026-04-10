import { Router } from 'express';
import {
  createUser,
  getUserByWallet,
  getUserProfile,
  getUserReferrals,
} from '../services/user-service.mjs';

const router = Router();

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter: max 5 registrations per IP per minute
// ---------------------------------------------------------------------------
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
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

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// POST /api/users/register
// ---------------------------------------------------------------------------
router.post('/register', async (req, res, next) => {
  try {
    const clientIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ error: 'Too many registration attempts. Try again in 1 minute.' });
    }

    const { wallet, github_handle, x_handle, referral_code } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: 'Missing required field: wallet' });
    }

    const user = await createUser(wallet, github_handle, x_handle, referral_code || null);

    res.status(201).json({
      user,
      referral_code: user.referral_code,
      message: 'User registered successfully',
    });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message, user: err.user });
    }
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/:wallet
// ---------------------------------------------------------------------------
router.get('/:wallet', async (req, res, next) => {
  try {
    const { wallet } = req.params;
    if (!wallet || wallet.length < 10) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const profile = await getUserProfile(wallet);

    if (!profile) {
      return res.status(404).json({ error: 'User not found', wallet });
    }

    res.json({
      wallet,
      user: profile.user,
      referralCount: profile.referralCount ?? 0,
      totalXP: profile.totalXP ?? 0,
      track: profile.track ?? null,
      rank: profile.rank ?? null,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/users/:wallet/referrals
// ---------------------------------------------------------------------------
router.get('/:wallet/referrals', async (req, res, next) => {
  try {
    const { wallet } = req.params;
    if (!wallet || wallet.length < 10) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const user = await getUserByWallet(wallet);

    if (!user) {
      return res.status(404).json({ error: 'User not found', wallet });
    }

    const referrals = await getUserReferrals(user.id);

    res.json({
      wallet,
      referral_code: user.referral_code || null,
      referral_count: referrals?.length ?? 0,
      referrals: referrals || [],
    });
  } catch (err) { next(err); }
});

export default router;

// Authentication middleware for API routes
// Validates wallet addresses against the users table

import { queryOne } from '../services/db.mjs';

/**
 * Express middleware that validates the wallet address from request body
 * and adds the user record to req.user if found.
 * 
 * This ensures analytics captures real user wallets instead of 'unknown'.
 */
export async function requireAuth(req, res, next) {
  const wallet = req.body?.wallet || req.headers['x-wallet'];
  
  if (!wallet) {
    return res.status(401).json({ error: 'Authentication required: wallet address missing' });
  }

  try {
    const user = await queryOne(
      'SELECT id, wallet, github_handle, x_handle, display_name FROM users WHERE wallet = $1',
      [wallet]
    );

    if (!user) {
      return res.status(401).json({ 
        error: 'Authentication failed: wallet not registered',
        hint: 'Please register your wallet at /api/users/register'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[auth] Database error during authentication:', err.message);
    return res.status(500).json({ error: 'Authentication service error' });
  }
}

/**
 * Optional authentication middleware - adds req.user if wallet is valid
 * but doesn't block requests if wallet is not registered.
 * Useful for read operations or when you want to allow unauthenticated access.
 */
export async function optionalAuth(req, res, next) {
  const wallet = req.body?.wallet || req.headers['x-wallet'];
  
  if (!wallet) {
    return next();
  }

  try {
    const user = await queryOne(
      'SELECT id, wallet, github_handle, x_handle, display_name FROM users WHERE wallet = $1',
      [wallet]
    );

    if (user) {
      req.user = user;
    }
  } catch (err) {
    console.warn('[auth] Optional auth lookup failed:', err.message);
  }

  next();
}

// Middleware to validate :wallet route params
import { isValidWallet } from '../utils/validation.mjs';

/**
 * Express middleware that validates any :wallet param in the route.
 * Returns 400 if the wallet address format is invalid.
 */
export function validateWalletParam(req, res, next) {
  const wallet = req.params.wallet;
  if (wallet && !isValidWallet(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address format' });
  }
  next();
}

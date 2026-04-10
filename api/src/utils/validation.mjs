/**
 * Validation utility for GrowStreams API.
 */

/**
 * Validates a wallet address.
 * Supports Substrate SS58 (47-48 chars) and Ethereum Hex (42 chars).
 * @param {string} address 
 * @returns {boolean}
 */
export function isValidWallet(address) {
  if (!address || typeof address !== 'string') return false;
  
  // Ethereum Address (0x followed by 40 hex chars)
  const ethRegex = /^0x[a-fA-F0-9]{40}$/;
  if (ethRegex.test(address)) return true;

  // Substrate / Vara Address (simple check for SS58 format)
  // Typically starts with 5 (Vara/Polkadot) and is 47-48 chars
  const substrateRegex = /^[1-9A-HJ-NP-Za-km-z]{47,48}$/;
  if (substrateRegex.test(address)) return true;

  // Also support full 32-byte actor_id hex for Gear
  const actorIdRegex = /^0x[a-fA-F0-9]{64}$/;
  if (actorIdRegex.test(address)) return true;

  return false;
}

/**
 * Simple sanitization to prevent XSS in stored text fields.
 * Strips HTML tags.
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/<[^>]*>?/gm, '').trim();
}

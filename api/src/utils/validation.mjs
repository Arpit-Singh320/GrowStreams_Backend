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
  // Polkadot/Kusama = 47-48 chars; Vara mainnet (prefix 137) = 49 chars
  const substrateRegex = /^[1-9A-HJ-NP-Za-km-z]{47,49}$/;
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

/**
 * Comprehensive XSS detection and prevention.
 * Checks for common XSS patterns in input strings.
 * @param {string} input
 * @returns {boolean} true if input contains potential XSS
 */
export function containsXSS(input) {
  if (!input || typeof input !== 'string') return false;

  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,  // Event handlers like onclick=
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /eval\(/i,
    /fromCharCode/i,
    /document\./i,
    /window\./i,
    /alert\(/i,
    /<svg/i,
    /<img/i,
    /onerror/i,
    /onload/i,
  ];

  return xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Sanitize wallet address to prevent XSS.
 * Validates the address format and removes any suspicious content.
 * @param {string} address
 * @returns {string|null} sanitized address or null if invalid
 */
export function sanitizeWalletAddress(address) {
  if (!address || typeof address !== 'string') return null;

  // Check for XSS patterns first
  if (containsXSS(address)) {
    console.warn('[validation] XSS pattern detected in wallet address:', address);
    return null;
  }

  // Validate address format
  if (!isValidWallet(address)) {
    console.warn('[validation] Invalid wallet address format:', address);
    return null;
  }

  return address.trim();
}

/**
 * Sanitize user input fields (handles, display names, bios, etc.)
 * Removes HTML tags and common XSS patterns.
 * @param {string} input
 * @returns {string} sanitized input
 */
export function sanitizeUserInput(input) {
  if (!input || typeof input !== 'string') return '';

  // Check for XSS patterns
  if (containsXSS(input)) {
    console.warn('[validation] XSS pattern detected in user input, sanitizing');
  }

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>?/gm, '');

  // Remove potentially dangerous JavaScript keywords
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');

  // Trim and limit length
  sanitized = sanitized.trim();
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }

  return sanitized;
}

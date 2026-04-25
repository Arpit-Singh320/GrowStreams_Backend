// Debug Logger -- Enhanced logging for development, testing, and demo preparation
// Usage: import { debug, debugStream, debugVault, debugBridge, debugToken } from '../utils/debug-logger.mjs';
// Enable: set DEBUG=true or DEBUG=streams,vault,bridge,tokens in environment

const DEBUG = process.env.DEBUG || '';
const isDebugAll = DEBUG === 'true' || DEBUG === '1' || DEBUG === '*';
const enabledScopes = DEBUG.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function isEnabled(scope) {
  if (isDebugAll) return true;
  return enabledScopes.includes(scope);
}

function timestamp() {
  return new Date().toISOString().slice(11, 23);
}

function createScopedLogger(scope, emoji) {
  const enabled = isEnabled(scope);
  return {
    log: (...args) => {
      if (!enabled) return;
      console.log(`[${timestamp()}] ${emoji} [${scope}]`, ...args);
    },
    warn: (...args) => {
      if (!enabled) return;
      console.warn(`[${timestamp()}] [WARN] [${scope}]`, ...args);
    },
    error: (...args) => {
      console.error(`[${timestamp()}] [ERROR] [${scope}]`, ...args);
    },
    table: (data, label) => {
      if (!enabled) return;
      console.log(`[${timestamp()}] ${emoji} [${scope}] ${label || ''}`);
      if (typeof data === 'object' && data !== null) {
        const entries = Array.isArray(data) ? data : Object.entries(data).map(([k, v]) => ({ key: k, value: v }));
        console.table(entries);
      }
    },
    time: (label) => {
      if (!enabled) return () => {};
      const start = performance.now();
      return () => {
        const elapsed = (performance.now() - start).toFixed(2);
        console.log(`[${timestamp()}] ${emoji} [${scope}] ${label}: ${elapsed}ms`);
      };
    },
    enabled,
  };
}

export const debug = createScopedLogger('debug', '[DBG]');
export const debugStream = createScopedLogger('streams', '[STR]');
export const debugVault = createScopedLogger('vault', '[VLT]');
export const debugBridge = createScopedLogger('bridge', '[BRG]');
export const debugToken = createScopedLogger('tokens', '[TKN]');

// Request logger middleware for Express
export function debugRequestLogger(scope = 'api') {
  const logger = createScopedLogger(scope, '[REQ]');
  return (req, res, next) => {
    if (!logger.enabled) return next();

    const start = performance.now();
    const method = req.method;
    const path = req.path;
    const queryStr = Object.keys(req.query || {}).length > 0 ? ` ?${new URLSearchParams(req.query).toString()}` : '';
    const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];

    logger.log(`--> ${method} ${path}${queryStr}${bodyKeys.length ? ` body=[${bodyKeys.join(',')}]` : ''}`);

    const origEnd = res.end;
    res.end = function (...args) {
      const elapsed = (performance.now() - start).toFixed(1);
      logger.log(`<-- ${method} ${path} ${res.statusCode} (${elapsed}ms)`);
      return origEnd.apply(this, args);
    };

    next();
  };
}

// Decimal debug helper: logs conversion steps
export function debugDecimalConversion(token, amount, decimals, result, direction = 'toBase') {
  const logger = createScopedLogger('decimals', '[DEC]');
  if (!logger.enabled) return;
  logger.log(`${direction}: ${token} "${amount}" (${decimals} dec) => ${result}`);
}

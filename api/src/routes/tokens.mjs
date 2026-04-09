import { Router } from 'express';
import { SUPPORTED_TOKENS, getToken, listTokens, listStablecoins, resolveVaraAddress } from '../config/tokens.mjs';
import { toBaseUnits, toDisplayUnits, flowRateFromInterval, flowRatePerInterval, calculateMinDeposit, INTERVALS } from '../utils/decimals.mjs';
import { getVftBalance, getVftAllowance, generateApprovePayload, getAllBalances } from '../services/token-service.mjs';
import { getProgramIds } from '../sails-client.mjs';

const router = Router();

// ─── Token Metadata ──────────────────────────────────────────

/** GET /api/tokens — list all supported tokens */
router.get('/', (req, res) => {
  const tokens = listTokens();
  res.json({ tokens, count: tokens.length });
});

/** GET /api/tokens/stablecoins — list only stablecoins */
router.get('/stablecoins', (req, res) => {
  const tokens = listStablecoins();
  res.json({ tokens, count: tokens.length });
});

/** GET /api/tokens/addresses — quick lookup of all Vara contract addresses */
router.get('/addresses', (req, res) => {
  const addresses = {};
  for (const [key, tok] of Object.entries(SUPPORTED_TOKENS)) {
    addresses[key] = { vara: tok.vara, eth: tok.eth };
  }
  const ids = getProgramIds();
  res.json({ tokens: addresses, contracts: ids });
});

// ─── On-Chain Balance Queries ────────────────────────────────
// NOTE: /balances/:wallet MUST be before /:symbol to avoid 'balances' matching as a symbol param

/** GET /api/tokens/balances/:wallet — all token balances for a wallet */
router.get('/balances/:wallet', async (req, res, next) => {
  try {
    const balances = await getAllBalances(req.params.wallet);
    res.json({ wallet: req.params.wallet, balances });
  } catch (err) { next(err); }
});

/** GET /api/tokens/:symbol — single token metadata */
router.get('/:symbol', (req, res) => {
  const tok = getToken(req.params.symbol);
  if (!tok) return res.status(404).json({ error: `Token not found: ${req.params.symbol}` });
  res.json(tok);
});

/** GET /api/tokens/:symbol/balance/:wallet — on-chain VFT balance for a wallet */
router.get('/:symbol/balance/:wallet', async (req, res, next) => {
  try {
    const result = await getVftBalance(req.params.symbol, req.params.wallet);
    res.json({ wallet: req.params.wallet, ...result });
  } catch (err) { next(err); }
});

// ─── Allowance ───────────────────────────────────────────────

/** GET /api/tokens/:symbol/allowance/:owner/:spender — check VFT allowance */
router.get('/:symbol/allowance/:owner/:spender', async (req, res, next) => {
  try {
    const result = await getVftAllowance(req.params.symbol, req.params.owner, req.params.spender);
    res.json({ owner: req.params.owner, spender: req.params.spender, ...result });
  } catch (err) { next(err); }
});

// ─── Approval Payload ────────────────────────────────────────

/**
 * POST /api/tokens/:symbol/approve — generate VFT.Approve payload for client-side signing
 * Body: { spender: "<vault_address>", amount: "1000.50" }
 * The amount is in human-readable units; it gets converted to base units.
 * If amountRaw is provided, it is used directly (no conversion).
 */
router.post('/:symbol/approve', async (req, res, next) => {
  try {
    const { spender, amount, amountRaw } = req.body;
    if (!spender) return res.status(400).json({ error: 'Missing: spender' });
    if (!amount && !amountRaw) return res.status(400).json({ error: 'Missing: amount or amountRaw' });

    const tok = getToken(req.params.symbol);
    if (!tok) return res.status(404).json({ error: `Token not found: ${req.params.symbol}` });

    const baseAmount = amountRaw ? BigInt(amountRaw) : toBaseUnits(amount, tok.decimals);
    const result = await generateApprovePayload(req.params.symbol, spender, baseAmount);
    res.json(result);
  } catch (err) { next(err); }
});

// ─── Utility: Decimal Conversion ─────────────────────────────

/**
 * POST /api/tokens/:symbol/convert — convert between human-readable and base units
 * Body: { amount: "100.50", direction: "toBase" | "toDisplay" }
 */
router.post('/:symbol/convert', (req, res) => {
  const { amount, direction = 'toBase' } = req.body;
  if (amount == null) return res.status(400).json({ error: 'Missing: amount' });

  const tok = getToken(req.params.symbol);
  if (!tok) return res.status(404).json({ error: `Token not found: ${req.params.symbol}` });

  if (direction === 'toBase') {
    const base = toBaseUnits(amount, tok.decimals);
    res.json({ token: tok.symbol, decimals: tok.decimals, input: amount, baseUnits: base.toString() });
  } else {
    const display = toDisplayUnits(amount, tok.decimals);
    res.json({ token: tok.symbol, decimals: tok.decimals, input: amount.toString(), displayUnits: display });
  }
});

// ─── Utility: Flow Rate Conversion ───────────────────────────

/**
 * POST /api/tokens/:symbol/flow-rate — convert flow rates between intervals
 * Body: { amount: "100", fromInterval: "month", toInterval: "second" }
 * Returns the flow rate in base units per-second and per the target interval.
 */
router.post('/:symbol/flow-rate', (req, res) => {
  const { amount, fromInterval = 'month', toInterval = 'second' } = req.body;
  if (!amount) return res.status(400).json({ error: 'Missing: amount' });

  const tok = getToken(req.params.symbol);
  if (!tok) return res.status(404).json({ error: `Token not found: ${req.params.symbol}` });

  if (!INTERVALS[fromInterval]) return res.status(400).json({ error: `Invalid interval: ${fromInterval}. Use: ${Object.keys(INTERVALS).join(', ')}` });
  if (!INTERVALS[toInterval]) return res.status(400).json({ error: `Invalid interval: ${toInterval}` });

  // Convert to per-second base units first
  const perSecondBase = flowRateFromInterval(amount, tok.decimals, fromInterval);
  // Then convert to target interval display
  const perTargetDisplay = flowRatePerInterval(perSecondBase, tok.decimals, toInterval);
  // Minimum deposit for this flow rate
  const minDeposit = calculateMinDeposit(perSecondBase, tok.minBuffer || 3600);

  res.json({
    token: tok.symbol,
    decimals: tok.decimals,
    input: { amount, interval: fromInterval },
    perSecond: {
      baseUnits: perSecondBase.toString(),
      display: toDisplayUnits(perSecondBase, tok.decimals),
    },
    [`per_${toInterval}`]: {
      display: perTargetDisplay,
    },
    minDeposit: {
      baseUnits: minDeposit.toString(),
      display: toDisplayUnits(minDeposit, tok.decimals),
      bufferSeconds: tok.minBuffer || 3600,
    },
  });
});

// ─── Resolve Token Address ───────────────────────────────────

/** GET /api/tokens/:symbol/resolve — resolve symbol to Vara ActorId */
router.get('/:symbol/resolve', (req, res) => {
  const varaAddr = resolveVaraAddress(req.params.symbol);
  if (!varaAddr) return res.status(404).json({ error: `Cannot resolve: ${req.params.symbol}` });
  const tok = getToken(req.params.symbol);
  res.json({
    input: req.params.symbol,
    varaAddress: varaAddr,
    symbol: tok?.symbol || null,
    decimals: tok?.decimals || null,
  });
});

export default router;

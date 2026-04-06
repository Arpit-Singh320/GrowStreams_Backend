// ---------------------------------------------------------------------------
// GET /api/tokens — Token metadata and balance endpoints
// ---------------------------------------------------------------------------

import { Router } from 'express';
import {
  getAllTokens,
  getTokenBySymbol,
  getStablecoins,
  resolveTokenAddress,
} from '../config/tokens.mjs';
import {
  getVaultBalance,
  getAllVaultBalances,
  generateApprovalPayload,
  fetchPrices,
} from '../services/token-service.mjs';
import { toBaseUnits, toDisplayUnits, flowRateBreakdown, toPerSecondRate } from '../utils/decimals.mjs';

const router = Router();

// GET /api/tokens — list all supported tokens
router.get('/', async (req, res, next) => {
  try {
    const tokens = getAllTokens();
    const prices = await fetchPrices();

    const result = tokens.map(t => ({
      symbol: t.symbol,
      displaySymbol: t.displaySymbol,
      name: t.name,
      decimals: t.decimals,
      category: t.category,
      icon: t.icon,
      vara: t.vara,
      eth: t.eth,
      priceUSD: prices[t.symbol] ?? null,
    }));

    res.json({ tokens: result });
  } catch (err) { next(err); }
});

// GET /api/tokens/stablecoins — list only stablecoins
router.get('/stablecoins', async (req, res, next) => {
  try {
    const tokens = getStablecoins();
    res.json({ tokens: tokens.map(t => ({
      symbol: t.symbol,
      displaySymbol: t.displaySymbol,
      name: t.name,
      decimals: t.decimals,
      vara: t.vara,
      eth: t.eth,
      icon: t.icon,
    })) });
  } catch (err) { next(err); }
});

// GET /api/tokens/prices — current USD prices
router.get('/prices', async (req, res, next) => {
  try {
    const prices = await fetchPrices();
    res.json({ prices });
  } catch (err) { next(err); }
});

// GET /api/tokens/:symbol — single token metadata
router.get('/:symbol', async (req, res, next) => {
  try {
    const token = getTokenBySymbol(req.params.symbol);
    if (!token) return res.status(404).json({ error: `Token not found: ${req.params.symbol}` });

    const prices = await fetchPrices();

    res.json({
      symbol: token.symbol,
      displaySymbol: token.displaySymbol,
      name: token.name,
      decimals: token.decimals,
      category: token.category,
      icon: token.icon,
      vara: token.vara,
      eth: token.eth,
      priceUSD: prices[token.symbol] ?? null,
    });
  } catch (err) { next(err); }
});

// GET /api/tokens/:symbol/resolve — resolve symbol to Vara ActorId
router.get('/:symbol/resolve', async (req, res, next) => {
  try {
    const address = resolveTokenAddress(req.params.symbol);
    if (!address) return res.status(404).json({ error: `Cannot resolve: ${req.params.symbol}` });
    res.json({ symbol: req.params.symbol, varaAddress: address });
  } catch (err) { next(err); }
});

// GET /api/tokens/:symbol/vault-balance/:wallet — vault balance for a token
router.get('/:symbol/vault-balance/:wallet', async (req, res, next) => {
  try {
    const balance = await getVaultBalance(req.params.wallet, req.params.symbol);
    res.json(balance);
  } catch (err) { next(err); }
});

// GET /api/tokens/vault-balances/:wallet — all vault balances for a wallet
router.get('/vault-balances/:wallet', async (req, res, next) => {
  try {
    const balances = await getAllVaultBalances(req.params.wallet);
    res.json({ wallet: req.params.wallet, balances });
  } catch (err) { next(err); }
});

// POST /api/tokens/:symbol/approve — generate VFT approval payload
router.post('/:symbol/approve', async (req, res, next) => {
  try {
    const { spender, amount } = req.body;
    if (!spender || !amount) return res.status(400).json({ error: 'Missing: spender, amount' });

    const token = getTokenBySymbol(req.params.symbol);
    if (!token) return res.status(404).json({ error: `Token not found: ${req.params.symbol}` });

    const rawAmount = toBaseUnits(amount, token.decimals).toString();
    const approval = generateApprovalPayload(req.params.symbol, spender, rawAmount);

    res.json({
      ...approval,
      token: token.symbol,
      displayAmount: amount,
      rawAmount,
      decimals: token.decimals,
    });
  } catch (err) { next(err); }
});

// POST /api/tokens/convert — utility: convert between display and base units
router.post('/convert', async (req, res, next) => {
  try {
    const { symbol, amount, direction } = req.body;
    if (!symbol || amount == null || !direction) {
      return res.status(400).json({ error: 'Missing: symbol, amount, direction (toBase | toDisplay)' });
    }

    const token = getTokenBySymbol(symbol);
    if (!token) return res.status(404).json({ error: `Token not found: ${symbol}` });

    if (direction === 'toBase') {
      const base = toBaseUnits(amount, token.decimals).toString();
      res.json({ symbol, input: amount, baseUnits: base, decimals: token.decimals });
    } else if (direction === 'toDisplay') {
      const display = toDisplayUnits(amount, token.decimals);
      res.json({ symbol, input: amount, displayUnits: display, decimals: token.decimals });
    } else {
      res.status(400).json({ error: 'direction must be "toBase" or "toDisplay"' });
    }
  } catch (err) { next(err); }
});

// POST /api/tokens/flow-rate — utility: convert flow rate between intervals
router.post('/flow-rate', async (req, res, next) => {
  try {
    const { symbol, amount, interval } = req.body;
    if (!symbol || !amount || !interval) {
      return res.status(400).json({ error: 'Missing: symbol, amount, interval (second|minute|hour|day|month)' });
    }

    const token = getTokenBySymbol(symbol);
    if (!token) return res.status(404).json({ error: `Token not found: ${symbol}` });

    const perSecond = toPerSecondRate(amount, token.decimals, interval);
    const breakdown = flowRateBreakdown(perSecond, token.decimals);

    res.json({
      symbol: token.symbol,
      input: { amount, interval },
      perSecondRaw: perSecond.toString(),
      breakdown,
    });
  } catch (err) { next(err); }
});

export default router;

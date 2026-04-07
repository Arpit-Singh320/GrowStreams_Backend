'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, type TokenMeta, type TokenVaultBalance, type FlowRateBreakdown } from '@/lib/growstreams-api';

export function useTokenList() {
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.tokens.list()
      .then(({ tokens }) => { if (!cancelled) setTokens(tokens); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const stablecoins = tokens.filter(t => t.category === 'stablecoin');

  return { tokens, stablecoins, loading, error };
}

export function useTokenPrices() {
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = () => {
      api.tokens.prices()
        .then(({ prices }) => { if (!cancelled) setPrices(prices); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    fetch();
    const interval = setInterval(fetch, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { prices, loading };
}

export function useVaultBalances(wallet: string | null) {
  const [balances, setBalances] = useState<TokenVaultBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    api.vaultV3.balances(wallet)
      .then(({ balances }) => setBalances(balances))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [wallet]);

  useEffect(() => { refresh(); }, [refresh]);

  return { balances, loading, error, refresh };
}

export function useFlowRate(symbol: string, amount: string, interval: string) {
  const [breakdown, setBreakdown] = useState<FlowRateBreakdown | null>(null);
  const [perSecondRaw, setPerSecondRaw] = useState('0');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol || !amount || !interval || parseFloat(amount) <= 0) {
      setBreakdown(null);
      setPerSecondRaw('0');
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      api.tokens.flowRate({ symbol, amount, interval })
        .then((res) => {
          setBreakdown(res.breakdown);
          setPerSecondRaw(res.perSecondRaw);
        })
        .catch(() => { setBreakdown(null); setPerSecondRaw('0'); })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [symbol, amount, interval]);

  return { breakdown, perSecondRaw, loading };
}

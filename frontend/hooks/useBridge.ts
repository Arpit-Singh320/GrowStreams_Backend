'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import {
  api,
  type BridgeInfo,
  type BridgeRoute,
  type BridgeFeeEstimate,
  type BridgeTransaction,
  type BridgeStats,
} from '@/lib/growstreams-api';

/**
 * Hook to fetch and cache bridge info (routes, fees, chain config).
 */
export function useBridgeInfo() {
  const [info, setInfo] = useState<BridgeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.bridge.info()
      .then(data => { if (!cancelled) setInfo(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { info, loading, error };
}

/**
 * Hook to fetch supported bridge routes.
 */
export function useBridgeRoutes() {
  const [routes, setRoutes] = useState<BridgeRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.bridge.routes()
      .then(data => { if (!cancelled) setRoutes(data.routes); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { routes, loading };
}

/**
 * Hook for bridge fee estimation. Re-estimates when token/amount change.
 */
export function useBridgeFeeEstimate(token: string, amount: string, direction: string = 'ethToVara') {
  const [estimate, setEstimate] = useState<BridgeFeeEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !amount || parseFloat(amount) <= 0) {
      setEstimate(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api.bridge.estimate({ token, amount, direction })
        .then(data => { if (!cancelled) setEstimate(data); })
        .catch(() => { if (!cancelled) setEstimate(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300); // debounce

    return () => { cancelled = true; clearTimeout(timer); };
  }, [token, amount, direction]);

  return { estimate, loading };
}

/**
 * Hook for bridge transaction history.
 */
export function useBridgeHistory(limit = 20) {
  const { account } = useAccount();
  const [transactions, setTransactions] = useState<BridgeTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!account?.decodedAddress) return;
    setLoading(true);
    try {
      const data = await api.bridge.history(account.decodedAddress, { limit });
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [account, limit]);

  useEffect(() => { refresh(); }, [refresh]);

  return { transactions, total, loading, refresh };
}

/**
 * Hook for bridge stats.
 */
export function useBridgeStats() {
  const { account } = useAccount();
  const [stats, setStats] = useState<BridgeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!account?.decodedAddress) return;
    let cancelled = false;
    api.bridge.stats(account.decodedAddress)
      .then(data => { if (!cancelled) setStats(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account]);

  return { stats, loading };
}

/**
 * Hook to track a single bridge transaction with polling.
 */
export function useBridgeTransactionTracker(txId: number | null, pollIntervalMs = 10000) {
  const [transaction, setTransaction] = useState<BridgeTransaction | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!txId) { setTransaction(null); return; }

    let cancelled = false;

    const poll = async () => {
      setLoading(true);
      try {
        const data = await api.bridge.getTransaction(txId);
        if (!cancelled) setTransaction(data.transaction);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    poll();
    const interval = setInterval(() => {
      if (!cancelled) poll();
    }, pollIntervalMs);

    return () => { cancelled = true; clearInterval(interval); };
  }, [txId, pollIntervalMs]);

  const isTerminal = transaction?.status === 'completed' || transaction?.status === 'failed';

  return { transaction, loading, isTerminal };
}

/**
 * Hook with bridge actions (initiate, update status).
 */
export function useBridgeActions() {
  const { account } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiate = useCallback(async (params: {
    token: string;
    amount: string;
    amountRaw?: string;
    direction?: string;
    sourceTxHash?: string;
    fee?: string;
    feeRaw?: string;
  }) => {
    if (!account?.decodedAddress) throw new Error('Wallet not connected');
    setLoading(true);
    setError(null);
    try {
      const result = await api.bridge.initiate({
        wallet: account.decodedAddress,
        ...params,
      });
      return result.transaction;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bridge initiation failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account]);

  return { initiate, loading, error };
}

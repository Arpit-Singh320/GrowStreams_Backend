'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  varaEthApi,
  type VaraEthInfo,
  type TokenBalance,
  type WvaraBalance,
  type EvmStream,
} from '@/lib/vara-eth-api';

// ─── useVaraEthInfo ───────────────────────────────────────────────────────────

export function useVaraEthInfo() {
  const [info, setInfo]       = useState<VaraEthInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    varaEthApi.info()
      .then(setInfo)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { info, loading, error };
}

// ─── useVaraEthBalances ───────────────────────────────────────────────────────

export function useVaraEthBalances(address: string | undefined) {
  const [tokenBal, setTokenBal] = useState<TokenBalance | null>(null);
  const [wvaraBal, setWvaraBal] = useState<WvaraBalance | null>(null);
  const [claimable, setClaimable] = useState('0');
  const [loading, setLoading]   = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const [tb, wb, cl] = await Promise.all([
        varaEthApi.balance(address),
        varaEthApi.wvara(address),
        varaEthApi.claimable(address),
      ]);
      setTokenBal(tb);
      setWvaraBal(wb);
      setClaimable(cl.claimable);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  return { tokenBal, wvaraBal, claimable, loading, refresh };
}

// ─── useEvmStreams ────────────────────────────────────────────────────────────

export function useEvmStreams(address: string | undefined) {
  const [streams, setStreams] = useState<EvmStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) { setStreams([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await varaEthApi.streams(address);
      setStreams(res.streams);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load streams');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  return { streams, loading, error, refresh };
}

// ─── useVaraEthActions ────────────────────────────────────────────────────────

export function useVaraEthActions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  const createStream = (receiver: string, flowRate: string, amount: string) =>
    run(() => varaEthApi.deposit(receiver, flowRate, amount));

  const addDeposit = (streamId: number, amount: string) =>
    run(() => varaEthApi.addDeposit(streamId, amount));

  const withdraw = (streamId: number, amount: string) =>
    run(() => varaEthApi.withdraw(streamId, amount));

  const stopStream = (streamId: number) =>
    run(() => varaEthApi.stop(streamId));

  const claimRefund = () =>
    run(() => varaEthApi.claim());

  return { createStream, addDeposit, withdraw, stopStream, claimRefund, busy, error };
}

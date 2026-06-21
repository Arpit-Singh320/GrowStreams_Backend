'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api, type WalletBalance, type MultiTokenBalance } from '@/lib/growstreams-api';
import { listTokens, listStreamableTokens, type TokenConfig } from '@/lib/tokens';

// ─── Token metadata (static, from local config) ─────────────

export function useTokenList() {
  return {
    tokens: listTokens(),
    streamableTokens: listStreamableTokens(),
  };
}

// ─── Wallet VFT balances (on-chain via API) ──────────────────

export function useWalletBalances(walletAddress?: string) {
  const { account } = useAccount();
  const wallet = walletAddress || account?.decodedAddress;
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.tokens.allBalances(wallet);
      setBalances(res.balances || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load balances');
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { refresh(); }, [refresh]);

  return { balances, loading, error, refresh };
}

// ─── Vault balances (multi-token) ────────────────────────────

export function useVaultBalances(walletAddress?: string) {
  const { account } = useAccount();
  const wallet = walletAddress || account?.decodedAddress;
  const [balances, setBalances] = useState<MultiTokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.vault.balances(wallet);
      setBalances(res.balances || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault balances');
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { refresh(); }, [refresh]);

  return { balances, loading, error, refresh };
}

// ─── Single token allowance check ────────────────────────────

export function useTokenAllowance(symbol: string, spender: string) {
  const { account } = useAccount();
  const [allowance, setAllowance] = useState<string>('0');
  const [allowanceRaw, setAllowanceRaw] = useState<string>('0');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!account?.decodedAddress || !symbol || !spender) return;
    setLoading(true);
    try {
      const res = await api.tokens.allowance(symbol, account.decodedAddress, spender);
      setAllowance(res.allowance);
      setAllowanceRaw(res.allowanceRaw);
    } catch {
      setAllowance('0');
      setAllowanceRaw('0');
    } finally {
      setLoading(false);
    }
  }, [account?.decodedAddress, symbol, spender]);

  useEffect(() => { refresh(); }, [refresh]);

  return { allowance, allowanceRaw, loading, refresh };
}

// ─── Token selector state ────────────────────────────────────

export function useTokenSelector(initialToken?: string) {
  const [selectedKey, setSelectedKey] = useState(initialToken || 'GVARA');
  const { tokens, streamableTokens } = useTokenList();

  const selectedToken = tokens.find(t => t.key === selectedKey) || tokens[0];

  const selectToken = useCallback((key: string) => {
    setSelectedKey(key);
  }, []);

  return {
    selectedKey,
    selectedToken,
    tokens,
    streamableTokens,
    selectToken,
  };
}

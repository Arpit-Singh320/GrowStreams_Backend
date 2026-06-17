'use client';

import { useState, useCallback, useEffect, FormEvent } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api, type MultiTokenBalance } from '@/lib/growstreams-api';
import { useVaultActions, useGearSign, PROGRAM_IDS } from '@/hooks/useGrowStreams';
import { useWalletBalances, useVaultBalances } from '@/hooks/useTokens';
import { type TokenConfig, listStreamableTokens, formatDisplayAmount, fmtDisplay, toBaseUnits, getToken } from '@/lib/tokens';
import TokenSelector, { TokenIcon } from './TokenSelector';
import { toast } from 'sonner';
import {
  Vault, ArrowUpFromLine, ArrowDownToLine, RefreshCw, Percent,
  AlertTriangle, Lock, Clock, Info, Shield, CheckCircle2, Loader2,
  ArrowRightLeft,
} from 'lucide-react';

export default function VaultDashboard() {
  const { account } = useAccount();
  const { depositTokens, withdrawTokens, depositNative, withdrawNative } = useVaultActions();
  const { signAndSend } = useGearSign();
  const { balances: walletBalances, refresh: refreshWallet } = useWalletBalances();
  const { balances: vaultBals, loading: vaultLoading, refresh: refreshVault } = useVaultBalances();
  const [paused, setPaused] = useState(false);

  const streamableTokens = listStreamableTokens();
  const allTokens = streamableTokens;

  const [selectedToken, setSelectedToken] = useState<TokenConfig>(streamableTokens[0] || allTokens[0]);
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const [gvaraMode, setGvaraMode] = useState<'wrap' | 'unwrap'>('wrap');
  const [gvaraAmount, setGvaraAmount] = useState('');
  const [gvaraBusy, setGvaraBusy] = useState(false);
  const [gvaraBalance, setGvaraBalance] = useState('0');

  useEffect(() => {
    api.vault.paused().then(p => setPaused(p.paused)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!account?.decodedAddress) return;
    api.gvara.balance(account.decodedAddress)
      .then(b => setGvaraBalance(b.balance_display || '0'))
      .catch(() => {});
  }, [account]);

  const walletBalMap: Record<string, string> = {};
  for (const wb of walletBalances) {
    walletBalMap[wb.key] = wb.balance;
  }
  const vaultBalMap: Record<string, string> = {};
  for (const vb of vaultBals) {
    vaultBalMap[vb.key] = vb.available_display;
  }

  const currentVaultBal = vaultBals.find(b => b.key === selectedToken.key);
  const totalDeposited = currentVaultBal?.total_deposited_display || '0';
  const totalAllocated = currentVaultBal?.total_allocated_display || '0';
  const available = currentVaultBal?.available_display || '0';
  const availableRaw = currentVaultBal?.available || '0';

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshWallet(), refreshVault()]);
  }, [refreshWallet, refreshVault]);

  const handleApprove = async () => {
    if (!account?.decodedAddress || selectedToken.vara === 'native') return;
    setApproving(true);
    try {
      // The vault contract itself is the spender that needs approval
      const res = await api.tokens.approve(selectedToken.key, {
        spender: PROGRAM_IDS.tokenVault,
        amount: '999999999999',
      });
      // Send approve payload to the VFT TOKEN contract (res.programId), NOT the vault
      await signAndSend(res.programId, res.payload);
      toast.success(`${selectedToken.symbol} approved! Please wait 10 seconds before depositing.`);
      setTimeout(refreshAll, 3000);
      // Keep approving state for 10 seconds to prevent immediate deposit
      setTimeout(() => setApproving(false), 10000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
      setApproving(false);
    }
  };

  const handleGvaraAction = async () => {
    if (!account?.decodedAddress) return;
    const raw = parseFloat(gvaraAmount);
    if (isNaN(raw) || raw <= 0) { toast.error('Enter a valid amount'); return; }
    setGvaraBusy(true);
    try {
      if (gvaraMode === 'wrap') {
        const res = await api.gvara.wrapNative({ amount: gvaraAmount, mode: 'payload' });
        await signAndSend(PROGRAM_IDS.gvaraToken, res.payload, res.value);
        toast.success(`Wrapped ${gvaraAmount} VARA → gVARA!`);
      } else {
        const res = await api.gvara.unwrapNative({ amount: gvaraAmount, mode: 'payload' }) as { payload: string };
        await signAndSend(PROGRAM_IDS.gvaraToken, res.payload);
        toast.success(`Unwrapped ${gvaraAmount} gVARA → VARA!`);
      }
      setGvaraAmount('');
      setTimeout(async () => {
        if (account?.decodedAddress) {
          api.gvara.balance(account.decodedAddress).then(b => setGvaraBalance(b.balance_display || '0')).catch(() => {});
        }
        await refreshAll();
      }, 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setGvaraBusy(false);
    }
  };


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const raw = parseFloat(amount);
    if (isNaN(raw) || raw <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }
    setBusy(true);
    try {
      if (selectedToken.vara === 'native') {
        const baseAmt = toBaseUnits(amount, selectedToken.decimals).toString();
        if (mode === 'deposit') {
          await depositNative(baseAmt);
          toast.success(`Deposited ${amount} VARA`);
        } else {
          await withdrawNative(baseAmt);
          toast.success(`Withdrew ${amount} VARA`);
        }
      } else {
        const baseAmt = toBaseUnits(amount, selectedToken.decimals).toString();
        if (mode === 'deposit') {
          // Check allowance before deposit to prevent race condition
          if (account?.decodedAddress) {
            try {
              const allowanceRes = await api.tokens.allowance(selectedToken.key, account.decodedAddress, PROGRAM_IDS.tokenVault);
              const allowance = BigInt(allowanceRes.allowanceRaw || '0');
              const required = BigInt(baseAmt);
              
              if (allowance < required) {
                toast.error(`Insufficient allowance. Please approve ${selectedToken.symbol} first and wait 10 seconds before depositing.`);
                setBusy(false);
                return;
              }
            } catch (err) {
              toast.warning('Could not verify allowance. Proceeding with deposit...');
            }
          }
          
          await depositTokens(selectedToken.vara, baseAmt);
          toast.success(`Deposited ${amount} ${selectedToken.symbol}`);
        } else {
          await withdrawTokens(selectedToken.vara, baseAmt);
          toast.success(`Withdrew ${amount} ${selectedToken.symbol}`);
        }
      }
      setAmount('');
      setTimeout(refreshAll, 4000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setBusy(false);
    }
  };

  const setMaxWithdraw = () => {
    if (available === '0' || !available) {
      toast.error('No available balance.');
      return;
    }
    setAmount(available);
  };

  const totalVaultValue = vaultBals.reduce((sum, b) => {
    if (b.isStablecoin) return sum + parseFloat(b.available_display || '0') + parseFloat(b.total_allocated_display || '0');
    return sum;
  }, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Vault className="w-6 h-6 text-purple-400" /> Multi-Token Vault
          </h1>
          <p className="text-provn-muted text-sm mt-1">
            Manage escrow for streaming across all supported tokens
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={vaultLoading}
          className="p-2 rounded-lg border border-provn-border hover:bg-provn-surface transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${vaultLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {paused && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Vault Paused</p>
            <p className="text-xs text-red-400/70 mt-0.5">Deposits and withdrawals temporarily disabled.</p>
          </div>
        </div>
      )}

      {vaultLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" />
        </div>
      ) : (
        <>
          {/* Token balance cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {vaultBals.filter(b => !b.error).map(bal => {
              const tok = getToken(bal.key);
              if (!tok) return null;
              const isSelected = selectedToken.key === bal.key;
              const totalBal = (parseFloat(bal.total_allocated_display || '0') + parseFloat(bal.available_display || '0'));
              const hasBalance = totalBal > 0;

              return (
                <button
                  key={bal.key}
                  onClick={() => setSelectedToken(tok)}
                  className={`text-left bg-provn-surface border rounded-xl p-4 transition-all ${
                    isSelected
                      ? `border-${tok.colorAccent}-500/40 ring-1 ring-${tok.colorAccent}-500/20`
                      : 'border-provn-border hover:border-provn-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TokenIcon token={tok} size="sm" />
                    <span className="text-sm font-semibold">{tok.symbol}</span>
                    {isSelected && (
                      <span className={`ml-auto text-[10px] bg-${tok.colorAccent}-500/20 ${tok.color} px-1.5 py-0.5 rounded-full`}>
                        Selected
                      </span>
                    )}
                  </div>
                  <p className={`text-lg font-bold font-mono ${hasBalance ? tok.color : 'text-provn-muted'}`}>
                    {hasBalance ? formatDisplayAmount(
                      (BigInt(bal.total_allocated || '0') + BigInt(bal.available || '0')).toString(),
                      tok.decimals,
                    ) : '0'}
                  </p>
                  <p className="text-[10px] text-provn-muted">
                    in vault {hasBalance && `· ${fmtDisplay(bal.available_display)} available`}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Balance breakdown */}
          {currentVaultBal && (
            <div className="bg-provn-surface border border-provn-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-provn-border/50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Percent className="w-4 h-4 text-purple-400" /> {selectedToken.symbol} Vault Breakdown
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-px bg-provn-border/50">
                <div className="bg-provn-surface p-4 text-center">
                  <p className="text-[10px] text-provn-muted uppercase tracking-wider mb-1">Total Deposited</p>
                  <p className="text-xl font-bold font-mono">{fmtDisplay(totalDeposited)}</p>
                  <p className="text-[10px] text-provn-muted">{selectedToken.symbol}</p>
                </div>
                <div className="bg-provn-surface p-4 text-center">
                  <p className="text-[10px] text-provn-muted uppercase tracking-wider mb-1">In Streams</p>
                  <p className="text-xl font-bold font-mono text-amber-400">{fmtDisplay(totalAllocated)}</p>
                  <p className="text-[10px] text-amber-400/70">allocated</p>
                </div>
                <div className="bg-provn-surface p-4 text-center">
                  <p className="text-[10px] text-provn-muted uppercase tracking-wider mb-1">Available</p>
                  <p className={`text-xl font-bold font-mono ${selectedToken.color}`}>{fmtDisplay(available)}</p>
                  <p className="text-[10px] text-provn-muted">withdrawable</p>
                </div>
              </div>
            </div>
          )}

          {/* gVARA wrap/unwrap — show when VARA (wVARA) is selected */}
          {selectedToken.key === 'WTVARA' && (
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-semibold">Wrap VARA ↔ gVARA</h3>
                    <p className="text-[10px] text-provn-muted">gVARA is the Superfluid streaming token — wrap native VARA directly</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-provn-muted">
                  <span>gVARA balance:</span>
                  <span className="font-mono text-emerald-400 font-medium">{gvaraBalance}</span>
                </div>
              </div>
              <div className="flex gap-1.5 p-1 bg-provn-bg rounded-lg">
                <button
                  onClick={() => setGvaraMode('wrap')}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    gvaraMode === 'wrap' ? 'bg-emerald-500/20 text-emerald-400' : 'text-provn-muted hover:text-provn-text'
                  }`}
                >
                  Wrap VARA → gVARA
                </button>
                <button
                  onClick={() => setGvaraMode('unwrap')}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    gvaraMode === 'unwrap' ? 'bg-teal-500/20 text-teal-400' : 'text-provn-muted hover:text-provn-text'
                  }`}
                >
                  Unwrap gVARA → VARA
                </button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    value={gvaraAmount}
                    onChange={e => setGvaraAmount(e.target.value)}
                    type="number" min="0" step="any"
                    className="w-full px-3 py-2.5 pr-20 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
                    placeholder="Amount"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-provn-muted">
                    {gvaraMode === 'wrap' ? 'VARA' : 'gVARA'}
                  </span>
                </div>
                <button
                  onClick={handleGvaraAction}
                  disabled={gvaraBusy || !gvaraAmount || parseFloat(gvaraAmount) <= 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {gvaraBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                  {gvaraBusy ? '...' : gvaraMode === 'wrap' ? 'Wrap' : 'Unwrap'}
                </button>
              </div>
              <div className="flex gap-2">
                {['1', '5', '10', '50', '100'].map(v => (
                  <button key={v} type="button" onClick={() => setGvaraAmount(v)}
                    className="px-2.5 py-1 rounded text-[11px] border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                    {v}
                  </button>
                ))}
              </div>
              {gvaraMode === 'wrap' && (
                <p className="text-[10px] text-provn-muted flex items-center gap-1">
                  <Info className="w-3 h-3" /> Native VARA is sent directly — no approval needed. 1 VARA = 1 gVARA.
                </p>
              )}
              {gvaraMode === 'unwrap' && (
                <p className="text-[10px] text-provn-muted flex items-center gap-1">
                  <Info className="w-3 h-3" /> Burns gVARA and returns native VARA to your wallet.
                </p>
              )}
            </div>
          )}


          {/* Deposit / Withdraw form */}
          <div className="bg-provn-surface border border-provn-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode('deposit')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'deposit'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'text-provn-muted hover:text-provn-text border border-provn-border'
                }`}
              >
                <ArrowUpFromLine className="w-4 h-4" /> Deposit
              </button>
              <button
                onClick={() => setMode('withdraw')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'withdraw'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'text-provn-muted hover:text-provn-text border border-provn-border'
                }`}
              >
                <ArrowDownToLine className="w-4 h-4" /> Withdraw
              </button>
            </div>

            <TokenSelector
              tokens={allTokens}
              selected={selectedToken}
              onSelect={setSelectedToken}
              walletBalances={walletBalMap}
              vaultBalances={vaultBalMap}
              label="Token"
            />

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-provn-muted mb-1">
                  Amount ({selectedToken.symbol})
                </label>
                <div className="relative">
                  <input
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    type="number"
                    min="0"
                    step="any"
                    className="w-full px-3 py-2.5 pr-24 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                    placeholder={selectedToken.isStablecoin ? 'e.g. 100.00' : 'e.g. 0.5'}
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {mode === 'withdraw' && (
                      <button
                        type="button"
                        onClick={setMaxWithdraw}
                        className="px-2 py-1 rounded text-[10px] bg-provn-border/40 text-provn-muted hover:text-provn-text transition-colors"
                      >
                        Max
                      </button>
                    )}
                    <span className="text-xs text-provn-muted px-1">{selectedToken.symbol}</span>
                  </div>
                </div>
                {selectedToken.vara !== 'native' && mode === 'deposit' && (
                  <p className="text-[10px] text-provn-muted mt-1 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Token approval required before first deposit
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {(selectedToken.isStablecoin
                  ? ['10', '50', '100', '500', '1000']
                  : ['0.01', '0.1', '0.5', '1', '5']
                ).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(v)}
                    className="px-2.5 py-1 rounded text-[11px] border border-provn-border/50 text-provn-muted hover:text-purple-400 hover:border-purple-500/30 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                {selectedToken.vara !== 'native' && mode === 'deposit' && (
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={approving || paused}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 text-sm font-medium transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                  >
                    {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Approve
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy || paused || !amount}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    mode === 'deposit'
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-white'
                  }`}
                >
                  {busy
                    ? 'Signing...'
                    : mode === 'deposit'
                      ? `Deposit ${selectedToken.symbol}`
                      : `Withdraw ${selectedToken.symbol}`}
                </button>
              </div>
            </form>
          </div>

          {/* Info panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-provn-surface border border-provn-border rounded-xl p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-400" /> Lockup & Cooldown
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-provn-bg/40 rounded-lg p-3">
                  <Lock className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">Stream Lock Period</p>
                    <p className="text-[10px] text-provn-muted mt-0.5">
                      Funds allocated to active streams are locked until the stream ends or is stopped.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-provn-bg/40 rounded-lg p-3">
                  <Clock className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">No Withdrawal Cooldown</p>
                    <p className="text-[10px] text-provn-muted mt-0.5">
                      Withdraw unallocated balance anytime. Transactions confirm in ~6 seconds on Vara.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-provn-surface border border-provn-border rounded-xl p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-emerald-400" /> Supported Tokens
              </h3>
              <div className="space-y-2">
                {allTokens.map(tok => (
                  <div key={tok.key} className="flex items-center gap-2 bg-provn-bg/40 rounded-lg p-2.5">
                    <TokenIcon token={tok} size="sm" />
                    <div className="flex-1">
                      <span className="text-xs font-medium">{tok.symbol}</span>
                      <span className="text-[10px] text-provn-muted ml-2">{tok.name}</span>
                    </div>
                    <span className="text-[10px] text-provn-muted">{tok.decimals} decimals</span>
                    {tok.isStablecoin && (
                      <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">Stable</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

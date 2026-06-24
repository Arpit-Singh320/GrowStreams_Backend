'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { useStreamActions } from '@/hooks/useGrowStreams';
import { useTokenSelector, useWalletBalances, useVaultBalances } from '@/hooks/useTokens';
import { api } from '@/lib/growstreams-api';
import {
  type TokenConfig,
  listStreamableTokens,
  toBaseUnits,
  flowRateFromInterval,
  calculateMinDeposit,
  formatDuration,
  formatFlowRate as formatFlowRateFn,
  INTERVALS,
  INTERVAL_LABELS,
} from '@/lib/tokens';
import TokenSelector from './TokenSelector';
import { toast } from 'sonner';
import { Plus, Waves, Calculator, Clock, AlertTriangle, Loader2 } from 'lucide-react';

interface CreateStreamProps {
  onCreated?: () => void;
}

export default function CreateStream({ onCreated }: CreateStreamProps) {
  const { account } = useAccount();
  const actions = useStreamActions();
  const { selectedToken, selectToken, streamableTokens } = useTokenSelector('GVARA');
  const { balances: walletBalances } = useWalletBalances();
  const { balances: vaultBals } = useVaultBalances();

  const [receiver, setReceiver] = useState('');
  const [flowRateAmount, setFlowRateAmount] = useState('');
  const [flowRateInterval, setFlowRateInterval] = useState('month');
  const [depositAmount, setDepositAmount] = useState('');
  const [streamName, setStreamName] = useState('');
  const [busy, setBusy] = useState(false);
  const [gvaraWalletBal, setGvaraWalletBal] = useState('0');

  useEffect(() => {
    if (!account?.decodedAddress) return;
    api.gvara.balance(account.decodedAddress)
      .then(b => setGvaraWalletBal(b.balance_display || '0'))
      .catch(() => {});
  }, [account?.decodedAddress]);

  const walletBalMap: Record<string, string> = {};
  for (const wb of walletBalances) walletBalMap[wb.key] = wb.balance;
  walletBalMap['GVARA'] = gvaraWalletBal;
  const vaultBalMap: Record<string, string> = {};
  for (const vb of vaultBals) vaultBalMap[vb.key] = vb.available_display;

  const tok = selectedToken;

  // Compute derived values
  const flowRatePerSecond = flowRateAmount && tok
    ? flowRateFromInterval(flowRateAmount, tok.decimals, flowRateInterval)
    : BigInt(0);

  const depositBaseUnits = depositAmount && tok
    ? toBaseUnits(depositAmount, tok.decimals)
    : BigInt(0);

  const minDeposit = flowRatePerSecond > BigInt(0)
    ? calculateMinDeposit(flowRatePerSecond, tok?.minBuffer || 3600)
    : BigInt(0);

  const isDepositSufficient = depositBaseUnits >= minDeposit;

  const streamDuration = flowRatePerSecond > BigInt(0) && depositBaseUnits > BigInt(0)
    ? Number(depositBaseUnits / flowRatePerSecond)
    : 0;

  const dailyOutflow = flowRateAmount
    ? (parseFloat(flowRateAmount) * 86400 / (INTERVALS[flowRateInterval] || 1))
    : 0;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!receiver || !flowRateAmount || !depositAmount) {
      toast.error('Fill all required fields');
      return;
    }
    if (flowRatePerSecond <= BigInt(0)) {
      toast.error('Flow rate must be greater than zero');
      return;
    }
    if (!isDepositSufficient) {
      toast.error(`Deposit must cover minimum buffer (${formatDuration(tok.minBuffer || 3600)})`);
      return;
    }

    setBusy(true);
    try {
      // gVARA streams: pass wVARA address as token — stream-core maps wVARA→gVARA internally
      const tokenAddress = tok.key === 'GVARA'
        ? '0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d'
        : tok.vara;
      await actions.createStream(
        receiver,
        tokenAddress,
        flowRatePerSecond.toString(),
        depositBaseUnits.toString(),
      );
      toast.success('Stream created!');

      if (streamName) {
        try {
          const saved = JSON.parse(localStorage.getItem('growstreams_names') || '{}');
          // Best-effort: try to get the new stream ID
          const total = await (await fetch(`${process.env.NEXT_PUBLIC_GROWSTREAMS_API || ''}/api/streams/total`)).json();
          if (total?.total) {
            saved[Number(total.total)] = streamName;
            localStorage.setItem('growstreams_names', JSON.stringify(saved));
          }
        } catch {}
      }

      setReceiver('');
      setFlowRateAmount('');
      setDepositAmount('');
      setStreamName('');
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create stream');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleCreate} className="bg-provn-surface border border-provn-border rounded-xl p-5 space-y-4">
      <h2 className="font-semibold flex items-center gap-2">
        <Plus className="w-4 h-4 text-emerald-400" /> New Stream
      </h2>

      {/* Token selector */}
      <TokenSelector
        tokens={listStreamableTokens()}
        selected={tok}
        onSelect={(t: TokenConfig) => selectToken(t.key)}
        walletBalances={walletBalMap}
        vaultBalances={vaultBalMap}
        label="Streaming Token"
      />

      {/* Stream name */}
      <div>
        <label className="block text-xs text-provn-muted mb-1">Stream Name (optional)</label>
        <input
          value={streamName}
          onChange={e => setStreamName(e.target.value)}
          className="w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
          placeholder="e.g. Salary to Alice, Dev bounty payout"
        />
      </div>

      {/* Receiver */}
      <div>
        <label className="block text-xs text-provn-muted mb-1">Receiver Address</label>
        <input
          value={receiver}
          onChange={e => setReceiver(e.target.value)}
          required
          className="w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-sm font-mono focus:border-emerald-500/50 focus:outline-none"
          placeholder="kGk... or 0x..."
        />
        <p className="text-[10px] text-provn-muted/70 mt-1">
          No address to test? Try: <button
            type="button"
            onClick={() => setReceiver('kGiaMA7wophBP4BuJRyCUPTrkrgMfYFL78KaZmAF44WYjuPM2')}
            className="text-emerald-400 hover:text-emerald-300 font-mono underline"
          >
            kGiaMA7wophBP4BuJRyCUPTrkrgMfYFL78KaZmAF44WYjuPM2
          </button>
        </p>
      </div>

      {/* Flow rate with interval selector */}
      <div>
        <label className="block text-xs text-provn-muted mb-1">
          Flow Rate ({tok.symbol} per {flowRateInterval})
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={flowRateAmount}
              onChange={e => setFlowRateAmount(e.target.value)}
              required
              type="number"
              step="any"
              min="0"
              className="w-full px-3 py-2 pr-14 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
              placeholder={tok.isStablecoin ? 'e.g. 100' : 'e.g. 0.01'}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-provn-muted">
              {tok.symbol}
            </span>
          </div>
          <select
            value={flowRateInterval}
            onChange={e => setFlowRateInterval(e.target.value)}
            className="px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
          >
            {Object.entries(INTERVAL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        {tok.isStablecoin && (
          <div className="flex gap-1.5 mt-1.5">
            {['10', '50', '100', '500', '1000'].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setFlowRateAmount(v)}
                className="px-2 py-0.5 rounded text-[10px] border border-provn-border/50 text-provn-muted hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
              >
                {v}{INTERVAL_LABELS[flowRateInterval]}
              </button>
            ))}
          </div>
        )}
        {tok.key === 'GVARA' && (
          <div className="flex gap-1.5 mt-1.5">
            {['1', '5', '10', '50', '100'].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setFlowRateAmount(v)}
                className="px-2 py-0.5 rounded text-[10px] border border-provn-border/50 text-provn-muted hover:text-teal-400 hover:border-teal-500/30 transition-colors"
              >
                {v}{INTERVAL_LABELS[flowRateInterval]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Initial deposit */}
      <div>
        <label className="block text-xs text-provn-muted mb-1">
          Initial Deposit ({tok.symbol})
        </label>
        <div className="relative">
          <input
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            required
            type="number"
            step="any"
            min="0"
            className="w-full px-3 py-2 pr-16 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
            placeholder={tok.isStablecoin ? 'e.g. 1000' : 'e.g. 1.0'}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-provn-muted">
            {tok.symbol}
          </span>
        </div>
        {tok.isStablecoin && (
          <div className="flex gap-1.5 mt-1.5">
            {['100', '500', '1000', '5000', '10000'].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setDepositAmount(v)}
                className="px-2 py-0.5 rounded text-[10px] border border-provn-border/50 text-provn-muted hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        )}
        {tok.key === 'GVARA' && (
          <div className="flex gap-1.5 mt-1.5">
            {['1', '5', '10', '50', '100'].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setDepositAmount(v)}
                className="px-2 py-0.5 rounded text-[10px] border border-provn-border/50 text-provn-muted hover:text-teal-400 hover:border-teal-500/30 transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      {flowRateAmount && depositAmount && (
        <div className="bg-provn-bg/70 rounded-lg p-3 text-xs space-y-2 border border-provn-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="w-3.5 h-3.5 text-provn-muted" />
            <span className="text-provn-muted font-medium">Stream Preview</span>
          </div>
          <div className="flex justify-between">
            <span className="text-provn-muted">Token</span>
            <span className="font-mono font-medium">{tok.symbol} ({tok.decimals} decimals)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-provn-muted">Flow rate</span>
            <span className="font-mono">
              {flowRateAmount} {tok.symbol}{INTERVAL_LABELS[flowRateInterval]}
            </span>
          </div>
          {dailyOutflow > 0 && flowRateInterval !== 'day' && (
            <div className="flex justify-between">
              <span className="text-provn-muted">Daily outflow</span>
              <span className="font-mono">{dailyOutflow.toFixed(4)} {tok.symbol}/day</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-provn-muted flex items-center gap-1">
              <Clock className="w-3 h-3" /> Duration
            </span>
            <span className="font-mono font-medium">{formatDuration(streamDuration)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-provn-muted">Min buffer ({formatDuration(tok.minBuffer || 3600)})</span>
            <span className={`font-mono ${isDepositSufficient ? 'text-emerald-400' : 'text-red-400'}`}>
              {isDepositSufficient ? 'Sufficient' : 'Insufficient'}
            </span>
          </div>
          {!isDepositSufficient && (
            <div className="flex items-center gap-2 mt-1 text-red-400 bg-red-500/10 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Increase deposit to cover minimum buffer requirement.</span>
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !receiver || !flowRateAmount || !depositAmount}
        className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        {busy ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Signing transaction...</>
        ) : (
          <><Waves className="w-4 h-4" /> Create Stream</>
        )}
      </button>
    </form>
  );
}

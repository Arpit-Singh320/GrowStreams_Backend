'use client';

import { useState, FormEvent } from 'react';
import { toast } from 'sonner';
import {
  Waves, Plus, RefreshCw, Square, ArrowDownToLine, ArrowUpFromLine,
  Clock, Loader2, Activity, Zap, AlertTriangle, CheckCircle2,
  ExternalLink, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import {
  useVaraEthInfo,
  useVaraEthBalances,
  useEvmStreams,
  useVaraEthActions,
} from '@/hooks/useVaraEth';
import type { EvmStream } from '@/lib/vara-eth-api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HOODI_EXPLORER = 'https://blockscout.hoodi.gear-tech.io';

function truncAddr(a: string, chars = 6) {
  if (!a) return '';
  return `${a.slice(0, chars + 2)}…${a.slice(-chars)}`;
}

function fmtUnits(raw: string, decimals: number): string {
  if (!raw || raw === '0') return '0';
  const n = Number(BigInt(raw)) / Math.pow(10, decimals);
  if (n >= 1_000_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return '< 0.0001';
}

function fmtFlowPerSec(raw: string, decimals: number): string {
  if (!raw || raw === '0') return '0/s';
  const perSec = Number(BigInt(raw)) / Math.pow(10, decimals);
  const perDay = perSec * 86400;
  const perMonth = perSec * 2592000;
  if (perMonth >= 0.01) return `${perMonth.toFixed(4)}/mo`;
  if (perDay >= 0.0001) return `${perDay.toFixed(6)}/day`;
  return `${perSec.toExponential(2)}/s`;
}

function statusBadge(status: EvmStream['status']) {
  const map: Record<EvmStream['status'], { cls: string; label: string }> = {
    PENDING: { cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',  label: 'Pending' },
    ACTIVE:  { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Active' },
    STOPPED: { cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',        label: 'Stopped' },
    FAILED:  { cls: 'bg-red-500/15 text-red-400 border-red-500/30',           label: 'Failed' },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── CreateStreamForm ─────────────────────────────────────────────────────────

function CreateStreamForm({
  info,
  tokenDecimals,
  onCreated,
}: {
  info: { token: string } | null;
  tokenDecimals: number;
  onCreated: () => void;
}) {
  const { createStream, busy } = useVaraEthActions();
  const [receiver, setReceiver]       = useState('');
  const [flowAmt, setFlowAmt]         = useState('');
  const [flowInterval, setFlowInterval] = useState('month');
  const [deposit, setDeposit]         = useState('');
  const [open, setOpen]               = useState(false);

  const INTERVALS: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, month: 2592000 };

  const flowRateRaw = (): string => {
    if (!flowAmt) return '0';
    const perSec = parseFloat(flowAmt) / INTERVALS[flowInterval];
    return BigInt(Math.floor(perSec * Math.pow(10, tokenDecimals))).toString();
  };

  const depositRaw = (): string => {
    if (!deposit) return '0';
    return BigInt(Math.floor(parseFloat(deposit) * Math.pow(10, tokenDecimals))).toString();
  };

  const minDepositDisplay = () => {
    if (!flowAmt) return null;
    const perSec = parseFloat(flowAmt) / INTERVALS[flowInterval];
    const minDeposit = perSec * 3600; // 1h buffer
    return minDeposit.toFixed(6);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^0x[0-9a-fA-F]{40}$/.test(receiver)) {
      toast.error('Receiver must be a valid 0x EVM address (40 hex chars)');
      return;
    }
    const fr = flowRateRaw();
    const dep = depositRaw();
    if (fr === '0') { toast.error('Flow rate must be > 0'); return; }
    if (dep === '0') { toast.error('Deposit must be > 0'); return; }

    try {
      const res = await createStream(receiver, fr, dep);
      toast.success('Stream submitted! Vara.eth runtime will confirm shortly.', { duration: 8000 });
      setReceiver(''); setFlowAmt(''); setDeposit('');
      setOpen(false);
      onCreated();
      if (res.depositTxHash) {
        toast(
          <a
            href={`${HOODI_EXPLORER}/tx/${res.depositTxHash}`}
            target="_blank" rel="noopener noreferrer"
            className="underline text-emerald-400 text-xs"
          >
            View tx on explorer ↗
          </a>,
          { duration: 12000 }
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Stream creation failed');
    }
  };

  return (
    <div className="bg-provn-surface border border-provn-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          Create EVM Stream
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-provn-muted" /> : <ChevronDown className="w-4 h-4 text-provn-muted" />}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4 border-t border-provn-border/60">
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex gap-2 text-xs text-blue-300">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Stream created via the GrowStreams relayer on Vara.eth (Hoodi). Token:{' '}
              <span className="font-mono">{info?.token ? truncAddr(info.token) : '…'}</span>
            </span>
          </div>

          {/* Receiver */}
          <div>
            <label className="block text-xs text-provn-muted mb-1">Receiver EVM Address</label>
            <input
              value={receiver}
              onChange={e => setReceiver(e.target.value)}
              required
              placeholder="0x..."
              className="w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-sm font-mono focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          {/* Flow rate */}
          <div>
            <label className="block text-xs text-provn-muted mb-1">Flow Rate</label>
            <div className="flex gap-2">
              <input
                value={flowAmt}
                onChange={e => setFlowAmt(e.target.value)}
                required type="number" step="any" min="0"
                placeholder="e.g. 10"
                className="flex-1 px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
              />
              <select
                value={flowInterval}
                onChange={e => setFlowInterval(e.target.value)}
                className="px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
              >
                {Object.keys(INTERVALS).map(k => <option key={k} value={k}>per {k}</option>)}
              </select>
            </div>
            {minDepositDisplay() && (
              <p className="text-[10px] text-provn-muted mt-1">
                Min deposit for 1h buffer: <span className="text-emerald-400 font-mono">{minDepositDisplay()}</span>
              </p>
            )}
          </div>

          {/* Deposit */}
          <div>
            <label className="block text-xs text-provn-muted mb-1">Initial Deposit (token units)</label>
            <input
              value={deposit}
              onChange={e => setDeposit(e.target.value)}
              required type="number" step="any" min="0"
              placeholder="e.g. 100"
              className="w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <button
            type="submit" disabled={busy}
            className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {busy
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
              : <><Waves className="w-4 h-4" /> Create Stream</>}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── StreamCard ───────────────────────────────────────────────────────────────

function StreamCard({
  stream,
  tokenDecimals,
  onRefresh,
}: {
  stream: EvmStream;
  tokenDecimals: number;
  onRefresh: () => void;
}) {
  const { addDeposit, withdraw, stopStream, busy } = useVaraEthActions();
  const [extraAmt, setExtraAmt] = useState('');
  const [wdAmt, setWdAmt]       = useState('');
  const [expanded, setExpanded] = useState(false);

  const amtRaw = (v: string) =>
    BigInt(Math.floor(parseFloat(v) * Math.pow(10, tokenDecimals))).toString();

  const handleAddDeposit = async () => {
    if (!extraAmt) return;
    try {
      await addDeposit(stream.stream_id!, amtRaw(extraAmt));
      toast.success('Deposit added');
      setExtraAmt('');
      onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const handleWithdraw = async () => {
    if (!wdAmt) return;
    try {
      await withdraw(stream.stream_id!, amtRaw(wdAmt));
      toast.success('Withdrawal submitted');
      setWdAmt('');
      onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const handleStop = async () => {
    if (!stream.stream_id) return;
    if (!confirm('Stop this stream? This is irreversible.')) return;
    try {
      await stopStream(stream.stream_id);
      toast.success('Stream stopped');
      onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div className="bg-provn-bg border border-provn-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(x => !x)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Waves className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge(stream.status)}
              {stream.stream_id !== null && (
                <span className="text-xs text-provn-muted font-mono">#{stream.stream_id}</span>
              )}
            </div>
            <div className="text-xs text-provn-muted font-mono mt-0.5 truncate">
              → {truncAddr(stream.receiver)}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0 ml-4">
          <div className="text-sm font-semibold font-mono text-emerald-400">
            {fmtFlowPerSec(stream.flow_rate, tokenDecimals)}
          </div>
          <div className="text-[10px] text-provn-muted">
            dep: {fmtUnits(stream.amount, tokenDecimals)}
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-provn-muted ml-2 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-provn-muted ml-2 shrink-0" />}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-provn-border/60 px-4 py-4 space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Sender',    truncAddr(stream.sender)],
              ['Receiver',  truncAddr(stream.receiver)],
              ['Flow Rate', fmtFlowPerSec(stream.flow_rate, tokenDecimals)],
              ['Deposited', fmtUnits(stream.amount, tokenDecimals)],
              ['Network',   stream.network],
              ['Created',   new Date(stream.created_at).toLocaleDateString()],
            ].map(([k, v]) => (
              <div key={k} className="bg-provn-surface rounded-lg p-2">
                <div className="text-provn-muted mb-0.5">{k}</div>
                <div className="font-mono text-white/80">{v}</div>
              </div>
            ))}
          </div>

          {/* Tx links */}
          <div className="space-y-1">
            {stream.deposit_tx && (
              <a
                href={`${HOODI_EXPLORER}/tx/${stream.deposit_tx}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-provn-muted hover:text-emerald-400 transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Deposit tx
              </a>
            )}
            {stream.approve_tx && (
              <a
                href={`${HOODI_EXPLORER}/tx/${stream.approve_tx}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-provn-muted hover:text-emerald-400 transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Approve tx
              </a>
            )}
          </div>

          {/* Pending note */}
          {stream.status === 'PENDING' && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Waiting for Vara.eth runtime confirmation (usually &lt; 2 minutes)
            </div>
          )}

          {/* Actions for ACTIVE streams */}
          {stream.status === 'ACTIVE' && stream.stream_id !== null && (
            <div className="space-y-3 pt-1">
              {/* Add deposit */}
              <div className="flex gap-2">
                <input
                  value={extraAmt}
                  onChange={e => setExtraAmt(e.target.value)}
                  type="number" step="any" min="0"
                  placeholder="Add deposit amount"
                  className="flex-1 px-2.5 py-1.5 bg-provn-surface border border-provn-border rounded-lg text-xs focus:border-emerald-500/50 focus:outline-none"
                />
                <button
                  onClick={handleAddDeposit}
                  disabled={busy || !extraAmt}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/30 disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpFromLine className="w-3 h-3" />}
                  Top up
                </button>
              </div>

              {/* Withdraw */}
              <div className="flex gap-2">
                <input
                  value={wdAmt}
                  onChange={e => setWdAmt(e.target.value)}
                  type="number" step="any" min="0"
                  placeholder="Withdraw amount"
                  className="flex-1 px-2.5 py-1.5 bg-provn-surface border border-provn-border rounded-lg text-xs focus:border-emerald-500/50 focus:outline-none"
                />
                <button
                  onClick={handleWithdraw}
                  disabled={busy || !wdAmt}
                  className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-medium hover:bg-blue-500/30 disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownToLine className="w-3 h-3" />}
                  Withdraw
                </button>
              </div>

              {/* Stop */}
              <button
                onClick={handleStop}
                disabled={busy}
                className="w-full py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-medium hover:bg-red-500/25 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Square className="w-3 h-3" /> Stop Stream
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function VaraEthStreamDashboard({ evmAddress }: { evmAddress?: string }) {
  const { info, loading: infoLoading, error: infoError } = useVaraEthInfo();
  const { tokenBal, wvaraBal, claimable, loading: balLoading, refresh: refreshBals } =
    useVaraEthBalances(evmAddress);
  const { streams, loading: streamsLoading, refresh: refreshStreams } = useEvmStreams(evmAddress);
  const { claimRefund, busy: claimBusy } = useVaraEthActions();

  const tokenDecimals = tokenBal?.decimals ?? 6;

  const handleClaim = async () => {
    try {
      await claimRefund();
      toast.success('Refund claimed!');
      refreshBals();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Claim failed'); }
  };

  const refresh = () => { refreshBals(); refreshStreams(); };

  const activeCount  = streams.filter(s => s.status === 'ACTIVE').length;
  const pendingCount = streams.filter(s => s.status === 'PENDING').length;

  if (infoLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-provn-muted gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading Vara.eth info…
      </div>
    );
  }

  if (infoError) {
    return (
      <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-4">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Vara.eth contracts not configured: {infoError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Contract info banner */}
      <div className="bg-provn-surface border border-provn-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4 text-emerald-400" />
            Vara.eth — Hoodi Testnet
          </h2>
          <button
            onClick={refresh}
            disabled={balLoading || streamsLoading}
            className="p-1.5 rounded-lg hover:bg-white/10 text-provn-muted hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(balLoading || streamsLoading) ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            ['Chain ID',  String(info?.chainId ?? '—')],
            ['Escrow',    info ? truncAddr(info.escrow, 4) : '—'],
            ['Token',     info ? truncAddr(info.token, 4) : '—'],
            ['Mirror',    info ? truncAddr(info.mirror, 4) : '—'],
          ].map(([k, v]) => (
            <div key={k} className="bg-provn-bg rounded-lg p-2.5">
              <div className="text-provn-muted mb-0.5">{k}</div>
              <div className="font-mono text-white/80">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Balances row */}
      {evmAddress && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Token Balance',
              value: tokenBal ? fmtUnits(tokenBal.balance, tokenBal.decimals) : '—',
              sub: 'mUSDC',
              color: 'text-emerald-400',
            },
            {
              label: 'wVARA Balance',
              value: wvaraBal ? fmtUnits(wvaraBal.balance, 12) : '—',
              sub: 'wVARA',
              color: 'text-blue-400',
            },
            {
              label: 'Active Streams',
              value: String(activeCount),
              sub: pendingCount > 0 ? `${pendingCount} pending` : 'streams',
              color: 'text-emerald-400',
            },
            {
              label: 'Claimable Refund',
              value: claimable !== '0' ? fmtUnits(claimable, tokenDecimals) : '0',
              sub: 'tokens',
              color: claimable !== '0' ? 'text-yellow-400' : 'text-provn-muted',
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-provn-surface border border-provn-border rounded-xl p-3.5">
              <div className="text-[10px] text-provn-muted mb-1">{label}</div>
              <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
              <div className="text-[10px] text-provn-muted">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Claim refund button */}
      {claimable !== '0' && (
        <button
          onClick={handleClaim}
          disabled={claimBusy}
          className="w-full py-2.5 rounded-xl bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-sm font-medium hover:bg-yellow-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {claimBusy
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Claiming…</>
            : <><CheckCircle2 className="w-4 h-4" /> Claim Refund ({fmtUnits(claimable, tokenDecimals)} tokens)</>}
        </button>
      )}

      {/* No wallet message */}
      {!evmAddress && (
        <div className="bg-provn-surface border border-provn-border rounded-xl p-6 text-center text-sm text-provn-muted">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Connect an EVM wallet to view your streams and create new ones.
        </div>
      )}

      {/* Create stream */}
      {evmAddress && (
        <CreateStreamForm
          info={info}
          tokenDecimals={tokenDecimals}
          onCreated={refresh}
        />
      )}

      {/* Stream list */}
      {evmAddress && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-provn-muted" />
              Your EVM Streams
              {streams.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {streams.length}
                </span>
              )}
            </h3>
          </div>

          {streamsLoading ? (
            <div className="flex items-center justify-center py-8 text-provn-muted gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading streams…
            </div>
          ) : streams.length === 0 ? (
            <div className="bg-provn-surface border border-provn-border rounded-xl p-6 text-center">
              <Waves className="w-8 h-8 mx-auto mb-2 text-provn-muted opacity-40" />
              <p className="text-sm text-provn-muted">No EVM streams yet.</p>
              <p className="text-xs text-provn-muted/60 mt-1">Create a stream above to get started on Vara.eth.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {streams.map(s => (
                <StreamCard
                  key={s.id}
                  stream={s}
                  tokenDecimals={tokenDecimals}
                  onRefresh={refresh}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

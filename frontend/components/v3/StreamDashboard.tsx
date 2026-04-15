'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api, type StreamData } from '@/lib/growstreams-api';
import { useStreamActions } from '@/hooks/useGrowStreams';
import {
  getTokenByVaraAddress,
  getToken,
  formatDisplayAmount,
  formatFlowRate,
  formatDuration,
  truncAddress,
  calculateBufferSeconds,
  type TokenConfig,
} from '@/lib/tokens';
import { TokenIcon } from './TokenSelector';
import CreateStream from './CreateStream';
import { toast } from 'sonner';
import {
  Waves, Play, Pause, Square, Plus, RefreshCw, ArrowDownToLine,
  ArrowUpFromLine, AlertTriangle, Zap, Clock, TrendingDown, TrendingUp,
  X,
} from 'lucide-react';

const ZERO_TOKEN = '0x' + '0'.repeat(64);
const MIN_BUFFER_SECONDS = 3600;

function resolveToken(tokenAddr: string): TokenConfig | null {
  if (!tokenAddr || tokenAddr === ZERO_TOKEN) return getToken('VARA');
  return getTokenByVaraAddress(tokenAddr);
}

function computeRealtime(s: StreamData, nowSec: number) {
  const tok = resolveToken(s.token);
  const flowRate = Number(s.flow_rate);
  const deposited = Number(s.deposited);
  const withdrawn = Number(s.withdrawn);
  const lastStreamed = Number(s.streamed);
  const lastUpdate = Number(s.last_update);

  let totalStreamed = lastStreamed;
  if (s.status === 'Active' && nowSec > lastUpdate) {
    totalStreamed += flowRate * (nowSec - lastUpdate);
  }
  if (totalStreamed > deposited) totalStreamed = deposited;

  const remaining = deposited - totalStreamed;
  const withdrawable = Math.min(totalStreamed, deposited) - withdrawn;
  const timeToDepletion = flowRate > 0 && s.status === 'Active' ? remaining / flowRate : Infinity;
  const bufferThreshold = flowRate * MIN_BUFFER_SECONDS;
  const isDep = deposited > 0 && remaining <= 0;
  const isCritical = s.status === 'Active' && remaining < bufferThreshold && flowRate > 0 && !isDep;
  const progress = deposited > 0 ? (totalStreamed / deposited) * 100 : 0;

  return { totalStreamed, remaining, withdrawable, timeToDepletion, isCritical, isDepleted: isDep, progress };
}

function fmtAmount(raw: number, tok: TokenConfig | null): string {
  if (!tok) return String(raw);
  return formatDisplayAmount(Math.round(raw).toString(), tok.decimals);
}

function fmtFlow(raw: string | number, tok: TokenConfig | null, interval = 'second'): string {
  if (!tok) return `${raw}/s`;
  return formatFlowRate(raw.toString(), tok.decimals, interval);
}

function StreamCard({
  s, account, busy, onAction, depositAmounts, setDepositAmounts, nowSec, streamName, onNameChange,
}: {
  s: StreamData;
  account: string;
  busy: number | null;
  onAction: (id: number, action: string) => void;
  depositAmounts: Record<number, string>;
  setDepositAmounts: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  nowSec: number;
  streamName?: string;
  onNameChange?: (id: number, name: string) => void;
}) {
  const tok = resolveToken(s.token);
  const rt = computeRealtime(s, nowSec);
  const isSender = s.sender?.toLowerCase() === account?.toLowerCase();
  const isReceiver = s.receiver?.toLowerCase() === account?.toLowerCase();

  const statusColor = (st: string) => {
    if (st === 'Active') return 'text-emerald-400 bg-emerald-500/10';
    if (st === 'Paused') return 'text-amber-400 bg-amber-500/10';
    return 'text-red-400 bg-red-500/10';
  };

  return (
    <div className={`bg-provn-surface border rounded-xl p-5 transition-colors ${
      rt.isDepleted ? 'border-provn-border/50 opacity-70' : rt.isCritical ? 'border-red-500/50 shadow-red-500/5 shadow-lg' : 'border-provn-border'
    }`}>
      {rt.isCritical && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Critical: Buffer below minimum. This stream can be liquidated.</span>
          <button onClick={() => onAction(s.id, 'liquidate')} disabled={busy === s.id}
            className="ml-auto px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium transition-colors">
            Liquidate
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {tok && <TokenIcon token={tok} size="sm" />}
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">#{s.id}</span>
            {tok && <span className={`text-xs font-semibold ${tok.color}`}>{tok.symbol}</span>}
            {streamName ? (
              <span className="text-xs text-provn-muted font-medium truncate max-w-[120px]" title={streamName}>{streamName}</span>
            ) : onNameChange ? (
              <button onClick={() => { const n = prompt('Name this stream (optional):'); if (n) onNameChange(s.id, n); }}
                className="text-[10px] text-provn-muted/50 hover:text-provn-muted transition-colors">+ name</button>
            ) : null}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rt.isDepleted ? 'text-provn-muted bg-provn-border/30' : statusColor(s.status)}`}>
              {rt.isDepleted ? 'Depleted' : s.status}
            </span>
          </div>
          <div className="flex gap-1">
            {isSender && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400">Sending</span>
            )}
            {isReceiver && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400">Receiving</span>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          {s.status === 'Active' && isSender && (
            <button onClick={() => onAction(s.id, 'pause')} disabled={busy === s.id}
              className="p-1.5 rounded-lg border border-provn-border hover:bg-amber-500/10 hover:border-amber-500/30 transition-colors" title="Pause">
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}
          {s.status === 'Paused' && isSender && (
            <button onClick={() => onAction(s.id, 'resume')} disabled={busy === s.id}
              className="p-1.5 rounded-lg border border-provn-border hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-colors" title="Resume">
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          {(s.status === 'Active' || s.status === 'Paused') && isReceiver && (
            <button onClick={() => onAction(s.id, 'withdraw')} disabled={busy === s.id}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors text-blue-400 text-xs font-medium" title="Withdraw">
              <ArrowDownToLine className="w-3 h-3" /> Withdraw
            </button>
          )}
          {(s.status === 'Active' || s.status === 'Paused') && isSender && (
            <button onClick={() => onAction(s.id, 'stop')} disabled={busy === s.id}
              className="p-1.5 rounded-lg border border-provn-border hover:bg-red-500/10 hover:border-red-500/30 transition-colors" title="Stop">
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Real-time balance animation */}
      {s.status === 'Active' && (
        <div className="mb-4 p-3 rounded-lg bg-provn-bg/70 border border-provn-border/50">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs text-provn-muted">Total Streamed</span>
            <span className="text-xs text-provn-muted">{rt.progress.toFixed(1)}% of deposit</span>
          </div>
          <p className={`text-xl font-bold font-mono tabular-nums ${tok?.color || 'text-emerald-400'}`}>
            {fmtAmount(rt.totalStreamed, tok)} {tok?.symbol || ''}
          </p>
          <div className="mt-2 h-1.5 bg-provn-border/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                rt.isCritical ? 'bg-red-500' : rt.progress > 75 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(rt.progress, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-provn-muted">Sender</span>
          <p className="font-mono mt-0.5" title={s.sender}>{truncAddress(s.sender)}</p>
        </div>
        <div>
          <span className="text-provn-muted">Receiver</span>
          <p className="font-mono mt-0.5" title={s.receiver}>{truncAddress(s.receiver)}</p>
        </div>
        <div>
          <span className="text-provn-muted flex items-center gap-1"><Zap className="w-3 h-3" /> Flow Rate</span>
          <p className="font-mono mt-0.5">{fmtFlow(s.flow_rate, tok)} {tok?.symbol || ''}</p>
          {tok && (
            <p className="text-[10px] text-provn-muted mt-0.5">
              ≈ {fmtFlow(s.flow_rate, tok, 'month')} {tok.symbol}
            </p>
          )}
        </div>
        <div>
          <span className="text-provn-muted flex items-center gap-1"><Clock className="w-3 h-3" /> Time Left</span>
          <p className={`font-mono mt-0.5 ${rt.isCritical ? 'text-red-400' : ''}`}>
            {s.status === 'Active' ? formatDuration(rt.timeToDepletion) : '\u2014'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
        <div className="bg-provn-bg/50 rounded-lg px-3 py-2">
          <span className="text-provn-muted">Deposited</span>
          <p className="font-mono mt-0.5 font-medium">{fmtAmount(Number(s.deposited), tok)} {tok?.symbol || ''}</p>
        </div>
        <div className="bg-provn-bg/50 rounded-lg px-3 py-2">
          <span className="text-provn-muted">Remaining</span>
          <p className={`font-mono mt-0.5 font-medium ${rt.isCritical ? 'text-red-400' : ''}`}>
            {fmtAmount(rt.remaining, tok)} {tok?.symbol || ''}
          </p>
        </div>
        <div className="bg-provn-bg/50 rounded-lg px-3 py-2">
          <span className="text-provn-muted">Withdrawn</span>
          <p className="font-mono mt-0.5 font-medium">{fmtAmount(Number(s.withdrawn), tok)} {tok?.symbol || ''}</p>
        </div>
      </div>

      {/* Buffer health indicator */}
      {s.status === 'Active' && tok && Number(s.flow_rate) > 0 && (
        <div className="mt-3 pt-3 border-t border-provn-border/50">
          <BufferHealth remaining={rt.remaining} flowRate={Number(s.flow_rate)} token={tok} />
        </div>
      )}

      {(s.status === 'Active' || s.status === 'Paused') && isSender && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-provn-border/50">
          <input
            value={depositAmounts[s.id] || ''}
            onChange={e => setDepositAmounts(prev => ({ ...prev, [s.id]: e.target.value }))}
            type="number" step="any" placeholder={`Amount (${tok?.symbol || 'tokens'})`}
            className="flex-1 px-3 py-1.5 bg-provn-bg border border-provn-border rounded-lg text-xs focus:border-emerald-500/50 focus:outline-none"
          />
          <button onClick={() => onAction(s.id, 'deposit')} disabled={busy === s.id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 text-xs font-medium transition-colors">
            <ArrowUpFromLine className="w-3 h-3" /> Top Up
          </button>
        </div>
      )}
    </div>
  );
}

function BufferHealth({ remaining, flowRate, token }: { remaining: number; flowRate: number; token: TokenConfig }) {
  const bufferSecs = flowRate > 0 ? remaining / flowRate : Infinity;
  const minBuffer = token.minBuffer || 3600;
  const pct = Math.min((bufferSecs / (minBuffer * 4)) * 100, 100);
  const color = bufferSecs < minBuffer ? 'bg-red-500' : bufferSecs < minBuffer * 2 ? 'bg-amber-500' : 'bg-emerald-500';
  const label = bufferSecs < minBuffer ? 'Critical' : bufferSecs < minBuffer * 2 ? 'Low' : 'Healthy';

  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-provn-muted whitespace-nowrap">Buffer Health</span>
      <div className="flex-1 h-1.5 bg-provn-border/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-medium ${
        bufferSecs < minBuffer ? 'text-red-400' : bufferSecs < minBuffer * 2 ? 'text-amber-400' : 'text-emerald-400'
      }`}>
        {label} ({formatDuration(bufferSecs)})
      </span>
    </div>
  );
}

export default function StreamDashboard() {
  const { account } = useAccount();
  const actions = useStreamActions();
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [nowSec, setNowSec] = useState(Math.floor(Date.now() / 1000));
  const [depositAmounts, setDepositAmounts] = useState<Record<number, string>>({});
  const [streamNames, setStreamNames] = useState<Record<number, string>>({});
  const [filterToken, setFilterToken] = useState<string>('all');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('growstreams_names');
      if (saved) setStreamNames(JSON.parse(saved));
    } catch {}
  }, []);

  const saveStreamName = (id: number, name: string) => {
    const updated = { ...streamNames, [id]: name };
    setStreamNames(updated);
    try { localStorage.setItem('growstreams_names', JSON.stringify(updated)); } catch {}
  };

  useEffect(() => {
    const interval = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const loadStreams = useCallback(async () => {
    if (!account?.decodedAddress) return;
    setLoading(true);
    try {
      const hex = account.decodedAddress;
      const [sent, received] = await Promise.all([
        api.streams.bySender(hex).catch(() => ({ streamIds: [] as string[] })),
        api.streams.byReceiver(hex).catch(() => ({ streamIds: [] as string[] })),
      ]);
      const allIds = [...new Set([...(sent.streamIds || []), ...(received.streamIds || [])])];
      const details = await Promise.all(
        allIds.slice(0, 50).map(id => api.streams.get(Number(id)).catch(() => null))
      );
      const valid = details.filter(Boolean) as StreamData[];
      valid.sort((a, b) => b.id - a.id);
      setStreams(valid);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => { loadStreams(); }, [loadStreams]);

  const accountHex = account?.decodedAddress?.toLowerCase() || '';

  const isDepleted = (s: StreamData) => {
    const rt = computeRealtime(s, nowSec);
    return s.status === 'Active' && rt.remaining <= 0 && Number(s.deposited) > 0;
  };

  const activeStreams = streams.filter(s => s.status === 'Active' && !isDepleted(s));

  // Group by token for flow summary
  const tokenFlows: Record<string, { outflow: number; inflow: number; symbol: string; color: string }> = {};
  for (const s of activeStreams) {
    const tok = resolveToken(s.token);
    const key = tok?.key || s.token;
    if (!tokenFlows[key]) tokenFlows[key] = { outflow: 0, inflow: 0, symbol: tok?.symbol || '?', color: tok?.color || 'text-provn-text' };
    if (s.sender?.toLowerCase() === accountHex) tokenFlows[key].outflow += Number(s.flow_rate);
    if (s.receiver?.toLowerCase() === accountHex) tokenFlows[key].inflow += Number(s.flow_rate);
  }

  const filteredStreams = filterToken === 'all'
    ? streams
    : streams.filter(s => {
        const tok = resolveToken(s.token);
        return tok?.key === filterToken;
      });

  // Unique tokens in user's streams for filter
  const streamTokenKeys = [...new Set(streams.map(s => resolveToken(s.token)?.key).filter(Boolean))] as string[];

  const handleAction = async (id: number, action: string) => {
    setBusy(id);
    try {
      const s = streams.find(st => st.id === id);
      const tok = s ? resolveToken(s.token) : null;

      switch (action) {
        case 'pause': await actions.pauseStream(id); break;
        case 'resume': await actions.resumeStream(id); break;
        case 'stop': await actions.stopStream(id); break;
        case 'withdraw': await actions.withdrawFromStream(id); break;
        case 'liquidate': await actions.liquidateStream(id); break;
        case 'deposit': {
          const amt = depositAmounts[id];
          if (!amt) { toast.error('Enter an amount'); setBusy(null); return; }
          const raw = parseFloat(amt);
          if (isNaN(raw) || raw <= 0) { toast.error('Enter a valid amount'); setBusy(null); return; }
          // Convert to base units if we know the token
          let baseAmt: string;
          if (tok && tok.decimals) {
            const { toBaseUnits } = await import('@/lib/tokens');
            baseAmt = toBaseUnits(amt, tok.decimals).toString();
          } else {
            baseAmt = BigInt(Math.round(raw * 1e12)).toString();
          }
          await actions.depositToStream(id, baseAmt);
          setDepositAmounts(prev => ({ ...prev, [id]: '' }));
          break;
        }
      }
      toast.success(`${action} succeeded for stream #${id}`);
      loadStreams();
      setTimeout(loadStreams, 5000);
      setTimeout(loadStreams, 12000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Waves className="w-6 h-6 text-emerald-400" /> Money Streams
          </h1>
          <p className="text-provn-muted text-sm mt-1">
            Multi-token per-second streaming on Vara
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadStreams} className="p-2 rounded-lg border border-provn-border hover:bg-provn-surface transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
          >
            {showCreate ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCreate ? 'Cancel' : 'Create Stream'}
          </button>
        </div>
      </div>

      {/* Per-token flow summary */}
      {Object.keys(tokenFlows).length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(tokenFlows).map(([key, flow]) => {
            const tok = getToken(key);
            const net = flow.inflow - flow.outflow;
            return (
              <div key={key} className="bg-provn-surface border border-provn-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  {tok && <TokenIcon token={tok} size="sm" />}
                  <span className="text-xs font-semibold">{flow.symbol}</span>
                </div>
                {flow.outflow > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <TrendingDown className="w-3 h-3 text-red-400" />
                    <span className="text-red-400 font-mono">
                      -{tok ? fmtFlow(flow.outflow, tok, 'month') : flow.outflow}{tok ? '' : '/s'} {flow.symbol}
                    </span>
                  </div>
                )}
                {flow.inflow > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-mono">
                      +{tok ? fmtFlow(flow.inflow, tok, 'month') : flow.inflow}{tok ? '' : '/s'} {flow.symbol}
                    </span>
                  </div>
                )}
                <div className="mt-1 text-[10px] text-provn-muted">
                  Net: <span className={net >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {net >= 0 ? '+' : ''}{tok ? fmtFlow(Math.abs(net), tok, 'month') : Math.abs(net)} {flow.symbol}/mo
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create stream form */}
      {showCreate && (
        <CreateStream onCreated={() => { setShowCreate(false); setTimeout(loadStreams, 3000); }} />
      )}

      {/* Token filter */}
      {streamTokenKeys.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-provn-muted">Filter:</span>
          <button
            onClick={() => setFilterToken('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterToken === 'all' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'text-provn-muted border border-provn-border hover:text-provn-text'
            }`}
          >
            All
          </button>
          {streamTokenKeys.map(key => {
            const tok = getToken(key);
            if (!tok) return null;
            return (
              <button
                key={key}
                onClick={() => setFilterToken(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterToken === key ? `bg-${tok.colorAccent}-500/10 ${tok.color} border border-${tok.colorAccent}-500/30` : 'text-provn-muted border border-provn-border hover:text-provn-text'
                }`}
              >
                <TokenIcon token={tok} size="sm" />
                {tok.symbol}
              </button>
            );
          })}
        </div>
      )}

      {/* Stream list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
        </div>
      ) : filteredStreams.length === 0 ? (
        <div className="text-center py-16 text-provn-muted">
          <Waves className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="mb-1">{filterToken !== 'all' ? 'No streams for this token' : 'No streams found'}</p>
          <p className="text-sm">Create a stream to start sending tokens per-second</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredStreams.map(s => (
            <StreamCard
              key={s.id}
              s={s}
              account={accountHex}
              busy={busy}
              onAction={handleAction}
              depositAmounts={depositAmounts}
              setDepositAmounts={setDepositAmounts}
              nowSec={nowSec}
              streamName={streamNames[s.id]}
              onNameChange={saveStreamName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

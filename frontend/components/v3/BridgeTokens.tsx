'use client';

import { useState, useEffect } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import {
  useBridgeInfo,
  useBridgeRoutes,
  useBridgeFeeEstimate,
  useBridgeHistory,
  useBridgeActions,
  useBridgeTransactionTracker,
} from '@/hooks/useBridge';
import { getToken, type TokenConfig } from '@/lib/tokens';
import { TokenIcon } from './TokenSelector';
import { toast } from 'sonner';
import {
  ArrowRight, ArrowLeftRight, RefreshCw, ExternalLink, Clock,
  CheckCircle2, XCircle, Loader2, Info, Wallet, Copy, ChevronDown,
  ChevronUp, Zap, Shield, AlertTriangle, Globe,
} from 'lucide-react';
import type { BridgeRoute, BridgeTransaction } from '@/lib/growstreams-api';

// ─── Status helpers ─────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock; step: number }> = {
  initiated: { label: 'Initiated', color: 'text-blue-400 bg-blue-500/10', icon: Loader2, step: 1 },
  source_confirmed: { label: 'Source Confirmed', color: 'text-amber-400 bg-amber-500/10', icon: CheckCircle2, step: 2 },
  bridging: { label: 'Bridging', color: 'text-purple-400 bg-purple-500/10', icon: ArrowLeftRight, step: 3 },
  destination_confirmed: { label: 'Destination Confirmed', color: 'text-emerald-400 bg-emerald-500/10', icon: CheckCircle2, step: 4 },
  completed: { label: 'Completed', color: 'text-emerald-400 bg-emerald-500/10', icon: CheckCircle2, step: 5 },
  failed: { label: 'Failed', color: 'text-red-400 bg-red-500/10', icon: XCircle, step: -1 },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.initiated;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className={`w-3 h-3 ${status === 'initiated' || status === 'bridging' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

function ProgressSteps({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status];
  const currentStep = cfg?.step || 0;
  const steps = ['Initiated', 'Source TX', 'Bridging', 'Destination', 'Complete'];
  const failed = status === 'failed';

  return (
    <div className="flex items-center gap-1 w-full">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isActive = !failed && stepNum <= currentStep;
        const isCurrent = !failed && stepNum === currentStep;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${
              failed ? 'bg-red-500/20 text-red-400' :
              isActive ? 'bg-emerald-500/20 text-emerald-400' :
              'bg-provn-border/50 text-provn-muted'
            } ${isCurrent ? 'ring-2 ring-emerald-500/30' : ''}`}>
              {failed ? '!' : isActive ? '✓' : stepNum}
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 transition-colors ${
                !failed && stepNum < currentStep ? 'bg-emerald-500/40' : 'bg-provn-border/30'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Token Route Card ───────────────────────────────────────────

function RouteCard({
  route, selected, onSelect,
}: {
  route: BridgeRoute;
  selected: boolean;
  onSelect: () => void;
}) {
  const tok = getToken(route.token);
  return (
    <button
      onClick={onSelect}
      className={`text-left bg-provn-surface border rounded-xl p-4 transition-all ${
        selected ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : 'border-provn-border hover:border-emerald-500/20'
      }`}
    >
      <div className="flex items-center gap-3">
        {tok && <TokenIcon token={tok} size="md" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{route.symbol}</span>
            {route.isStablecoin && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400">Stable</span>
            )}
            {selected && (
              <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">Selected</span>
            )}
          </div>
          <p className="text-xs text-provn-muted mt-0.5">{route.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-provn-muted">
        <span className="px-1.5 py-0.5 rounded bg-provn-bg/80">{route.source.chainName}</span>
        <ArrowRight className="w-3 h-3 text-emerald-400" />
        <span className="px-1.5 py-0.5 rounded bg-provn-bg/80">{route.destination.chainName}</span>
      </div>
    </button>
  );
}

// ─── Transaction Card ──────────────────────────────────────────

function TxCard({ tx }: { tx: BridgeTransaction }) {
  const [expanded, setExpanded] = useState(false);
  const tok = getToken(tx.token_key);
  const isTerminal = tx.status === 'completed' || tx.status === 'failed';

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success('Copied to clipboard');
  };

  return (
    <div className={`bg-provn-surface border rounded-xl overflow-hidden transition-colors ${
      tx.status === 'failed' ? 'border-red-500/30' :
      tx.status === 'completed' ? 'border-emerald-500/20' :
      'border-provn-border'
    }`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {tok && <TokenIcon token={tok} size="sm" />}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{tx.amount} {tx.token_symbol}</span>
                <StatusBadge status={tx.status} />
              </div>
              <p className="text-[10px] text-provn-muted mt-0.5">
                {tx.direction === 'ethToVara' ? 'ETH → Vara' : 'Vara → ETH'} · {new Date(tx.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg hover:bg-provn-bg transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {!isTerminal && (
          <ProgressSteps status={tx.status} />
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-provn-border/50 mt-0 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-3 pt-3">
            <div>
              <span className="text-provn-muted">Fee</span>
              <p className="font-mono mt-0.5">{tx.fee || '0'} {tx.token_symbol}</p>
            </div>
            <div>
              <span className="text-provn-muted">Confirmations</span>
              <p className="font-mono mt-0.5">{tx.confirmations || 0}</p>
            </div>
          </div>
          {tx.source_tx_hash && (
            <div className="flex items-center gap-2">
              <span className="text-provn-muted shrink-0">Source TX:</span>
              <span className="font-mono truncate">{tx.source_tx_hash}</span>
              <button onClick={() => copyHash(tx.source_tx_hash!)} className="p-1 hover:text-emerald-400 transition-colors">
                <Copy className="w-3 h-3" />
              </button>
            </div>
          )}
          {tx.destination_tx_hash && (
            <div className="flex items-center gap-2">
              <span className="text-provn-muted shrink-0">Dest TX:</span>
              <span className="font-mono truncate">{tx.destination_tx_hash}</span>
              <button onClick={() => copyHash(tx.destination_tx_hash!)} className="p-1 hover:text-emerald-400 transition-colors">
                <Copy className="w-3 h-3" />
              </button>
            </div>
          )}
          {tx.error && (
            <div className="bg-red-500/10 rounded-lg p-2 text-red-400 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{tx.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function BridgeTokens() {
  const { account } = useAccount();
  const { info, loading: infoLoading } = useBridgeInfo();
  const { routes, loading: routesLoading } = useBridgeRoutes();
  const { transactions, loading: historyLoading, refresh: refreshHistory } = useBridgeHistory();
  const { initiate, loading: initiating } = useBridgeActions();

  const [selectedToken, setSelectedToken] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'ethToVara' | 'varaToEth'>('ethToVara');
  const [sourceTxHash, setSourceTxHash] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [trackingTxId, setTrackingTxId] = useState<number | null>(null);

  const { estimate, loading: estimating } = useBridgeFeeEstimate(selectedToken, amount, direction);
  const { transaction: trackedTx, isTerminal } = useBridgeTransactionTracker(trackingTxId);

  // Auto-select first route
  useEffect(() => {
    if (routes.length > 0 && !selectedToken) {
      setSelectedToken(routes[0].token);
    }
  }, [routes, selectedToken]);

  const selectedRoute = routes.find(r => r.token === selectedToken);
  const selectedTok = selectedToken ? getToken(selectedToken) : null;

  const handleBridge = async () => {
    if (!selectedToken || !amount || parseFloat(amount) <= 0) {
      toast.error('Select a token and enter an amount');
      return;
    }
    try {
      const tx = await initiate({
        token: selectedToken,
        amount,
        amountRaw: estimate?.amountRaw,
        direction,
        sourceTxHash: sourceTxHash || undefined,
        fee: estimate?.fee,
        feeRaw: estimate?.feeRaw,
      });
      toast.success(`Bridge transaction initiated! ID: ${tx.id}`);
      setTrackingTxId(tx.id);
      setAmount('');
      setSourceTxHash('');
      setTimeout(refreshHistory, 2000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Bridge failed');
    }
  };

  const loading = infoLoading || routesLoading;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-purple-400" /> Bridge Tokens
          </h1>
          <p className="text-provn-muted text-sm mt-1">
            Bridge ERC-20 tokens from Ethereum to wrapped VFT tokens on Vara
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
              showHistory ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 'border-provn-border hover:bg-provn-surface text-provn-muted'
            }`}
          >
            <Clock className="w-4 h-4 inline mr-1.5" />
            History {transactions.length > 0 && `(${transactions.length})`}
          </button>
        </div>
      </div>

      {/* Bridge Info Banner */}
      {info && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
            <Globe className="w-5 h-5 text-purple-400 mx-auto mb-1.5" />
            <p className="text-lg font-bold">{info.routeCount}</p>
            <p className="text-[10px] text-provn-muted">Supported Tokens</p>
          </div>
          <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
            <Zap className="w-5 h-5 text-amber-400 mx-auto mb-1.5" />
            <p className="text-lg font-bold">{info.fees.percentDisplay}</p>
            <p className="text-[10px] text-provn-muted">Bridge Fee</p>
          </div>
          <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
            <Clock className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
            <p className="text-lg font-bold">~{info.timing.estimatedMinutes}m</p>
            <p className="text-[10px] text-provn-muted">Estimated Time</p>
          </div>
        </div>
      )}

      {/* Active tracking */}
      {trackedTx && !isTerminal && (
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" /> Tracking Bridge Transaction #{trackedTx.id}
          </h3>
          <ProgressSteps status={trackedTx.status} />
          <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
            <div>
              <span className="text-provn-muted">Amount</span>
              <p className="font-mono mt-0.5 font-medium">{trackedTx.amount} {trackedTx.token_symbol}</p>
            </div>
            <div>
              <span className="text-provn-muted">Status</span>
              <div className="mt-0.5"><StatusBadge status={trackedTx.status} /></div>
            </div>
            <div>
              <span className="text-provn-muted">Confirmations</span>
              <p className="font-mono mt-0.5">{trackedTx.confirmations || 0} / {info?.timing.minConfirmations || 12}</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" />
        </div>
      ) : showHistory ? (
        /* ─── History View ─── */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Bridge History</h2>
            <button onClick={refreshHistory} className="p-1.5 rounded-lg border border-provn-border hover:bg-provn-surface transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-provn-muted">
              <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No bridge transactions yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map(tx => <TxCard key={tx.id} tx={tx} />)}
            </div>
          )}
        </div>
      ) : (
        /* ─── Bridge Form ─── */
        <>
          {/* Direction toggle */}
          <div className="flex items-center gap-3 bg-provn-surface border border-provn-border rounded-xl p-4">
            <div className="flex-1 text-center">
              <p className="text-xs text-provn-muted mb-1">From</p>
              <p className="text-sm font-semibold">
                {direction === 'ethToVara' ? 'Ethereum' : 'Vara'}
              </p>
              <p className="text-[10px] text-provn-muted">
                {direction === 'ethToVara' ? info?.chains.ethereum.name : info?.chains.vara.name}
              </p>
            </div>
            <button
              onClick={() => setDirection(d => d === 'ethToVara' ? 'varaToEth' : 'ethToVara')}
              className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
            >
              <ArrowLeftRight className="w-5 h-5 text-purple-400" />
            </button>
            <div className="flex-1 text-center">
              <p className="text-xs text-provn-muted mb-1">To</p>
              <p className="text-sm font-semibold">
                {direction === 'ethToVara' ? 'Vara' : 'Ethereum'}
              </p>
              <p className="text-[10px] text-provn-muted">
                {direction === 'ethToVara' ? info?.chains.vara.name : info?.chains.ethereum.name}
              </p>
            </div>
          </div>

          {/* Token selection */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Select Token</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {routes.map(route => (
                <RouteCard
                  key={route.token}
                  route={route}
                  selected={selectedToken === route.token}
                  onSelect={() => setSelectedToken(route.token)}
                />
              ))}
            </div>
          </div>

          {/* Amount input + fee preview */}
          {selectedRoute && (
            <div className="bg-provn-surface border border-provn-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold">Bridge Amount</h3>

              <div>
                <label className="block text-xs text-provn-muted mb-1">
                  Amount ({selectedRoute.symbol})
                </label>
                <div className="relative">
                  <input
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    type="number"
                    step="any"
                    min="0"
                    placeholder={`e.g. ${selectedRoute.isStablecoin ? '1000' : '0.5'}`}
                    className="w-full px-3 py-2.5 pr-20 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-provn-muted">
                    {selectedRoute.symbol}
                  </span>
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {(selectedRoute.isStablecoin ? ['100', '500', '1000', '5000'] : ['0.1', '0.5', '1', '5']).map(v => (
                    <button key={v} type="button" onClick={() => setAmount(v)}
                      className="px-2 py-0.5 rounded text-[10px] border border-provn-border/50 text-provn-muted hover:text-purple-400 hover:border-purple-500/30 transition-colors">
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source TX hash (optional) */}
              <div>
                <label className="block text-xs text-provn-muted mb-1">
                  Source Transaction Hash (optional)
                </label>
                <input
                  value={sourceTxHash}
                  onChange={e => setSourceTxHash(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-xs font-mono focus:border-purple-500/50 focus:outline-none"
                />
                <p className="text-[10px] text-provn-muted mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Enter the ETH transaction hash if you&apos;ve already initiated the bridge on Ethereum
                </p>
              </div>

              {/* Fee estimate */}
              {estimate && (
                <div className="bg-provn-bg/70 rounded-lg p-4 text-xs space-y-2 border border-provn-border/50">
                  <div className="flex justify-between">
                    <span className="text-provn-muted">Bridge Amount</span>
                    <span className="font-mono font-medium">{estimate.amount} {estimate.token}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-provn-muted">Bridge Fee ({estimate.feePercent})</span>
                    <span className="font-mono text-amber-400">-{estimate.fee} {estimate.token}</span>
                  </div>
                  <div className="border-t border-provn-border/50 pt-2 flex justify-between">
                    <span className="text-provn-muted font-medium">You&apos;ll Receive</span>
                    <span className={`font-mono font-bold ${selectedTok?.color || 'text-emerald-400'}`}>
                      {estimate.netAmount} {estimate.token}
                    </span>
                  </div>
                  <div className="flex justify-between text-provn-muted">
                    <span>Estimated Time</span>
                    <span className="font-mono">~{estimate.estimatedTimeMinutes} min</span>
                  </div>
                  <div className="flex justify-between text-provn-muted">
                    <span>Required Confirmations</span>
                    <span className="font-mono">{estimate.estimatedConfirmations} blocks</span>
                  </div>
                </div>
              )}

              {estimating && (
                <div className="flex items-center gap-2 text-xs text-provn-muted">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Estimating fees...
                </div>
              )}

              <button
                onClick={handleBridge}
                disabled={initiating || !amount || parseFloat(amount) <= 0}
                className="w-full py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {initiating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Initiating Bridge...</>
                ) : (
                  <><ArrowRight className="w-4 h-4" /> Bridge {selectedRoute.symbol}</>
                )}
              </button>
            </div>
          )}

          {/* How it works + info panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-provn-surface border border-provn-border rounded-xl p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-purple-400" /> How Bridging Works
              </h3>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0">1</div>
                  <div>
                    <p className="text-xs font-medium">Approve ERC-20</p>
                    <p className="text-[10px] text-provn-muted mt-0.5">
                      Approve the bridge contract to spend your tokens on Ethereum
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400 shrink-0">2</div>
                  <div>
                    <p className="text-xs font-medium">Lock on Ethereum</p>
                    <p className="text-[10px] text-provn-muted mt-0.5">
                      Tokens are locked in the bridge contract on Ethereum
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500/15 flex items-center justify-center text-[10px] font-bold text-purple-400 shrink-0">3</div>
                  <div>
                    <p className="text-xs font-medium">Wait for Confirmations</p>
                    <p className="text-[10px] text-provn-muted mt-0.5">
                      Bridge relayers verify the transaction ({info?.timing.minConfirmations || 12} confirmations)
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0">4</div>
                  <div>
                    <p className="text-xs font-medium">Receive VFT on Vara</p>
                    <p className="text-[10px] text-provn-muted mt-0.5">
                      Wrapped VFT tokens are minted to your Vara address
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-provn-surface border border-provn-border rounded-xl p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Wallet className="w-4 h-4 text-emerald-400" /> Token Addresses
              </h3>
              <div className="space-y-2.5">
                {routes.map(route => {
                  const tok = getToken(route.token);
                  return (
                    <div key={route.token} className="bg-provn-bg/50 rounded-lg p-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        {tok && <TokenIcon token={tok} size="sm" />}
                        <span className="text-xs font-semibold">{route.symbol}</span>
                      </div>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-provn-muted w-8">ETH:</span>
                          <span className="font-mono truncate">{route.source.address}</span>
                          {route.source.explorer && (
                            <a href={route.source.explorer} target="_blank" rel="noopener noreferrer"
                              className="text-provn-muted hover:text-purple-400 transition-colors shrink-0">
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-provn-muted w-8">Vara:</span>
                          <span className="font-mono truncate">{route.destination.address}</span>
                          {route.destination.explorer && (
                            <a href={route.destination.explorer} target="_blank" rel="noopener noreferrer"
                              className="text-provn-muted hover:text-purple-400 transition-colors shrink-0">
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Faucets & guides */}
          {info && (
            <div className="bg-provn-surface border border-provn-border rounded-xl p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-blue-400" /> Testnet Resources
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <a href={info.faucets.holesky} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-provn-bg/50 border border-provn-border hover:border-blue-500/30 transition-colors">
                  <Wallet className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-xs font-medium">ETH Faucet</p>
                    <p className="text-[10px] text-provn-muted">Holesky testnet</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-provn-muted ml-auto" />
                </a>
                <a href={info.faucets.vara} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-provn-bg/50 border border-provn-border hover:border-emerald-500/30 transition-colors">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-xs font-medium">VARA Faucet</p>
                    <p className="text-[10px] text-provn-muted">Vara testnet</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-provn-muted ml-auto" />
                </a>
                <a href={info.guides.bridging} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-provn-bg/50 border border-provn-border hover:border-purple-500/30 transition-colors">
                  <Globe className="w-4 h-4 text-purple-400" />
                  <div>
                    <p className="text-xs font-medium">Bridge Guide</p>
                    <p className="text-[10px] text-provn-muted">Documentation</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-provn-muted ml-auto" />
                </a>
                <a href={info.guides.testnetTokens} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-provn-bg/50 border border-provn-border hover:border-amber-500/30 transition-colors">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="text-xs font-medium">Get Tokens</p>
                    <p className="text-[10px] text-provn-muted">Token info</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-provn-muted ml-auto" />
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

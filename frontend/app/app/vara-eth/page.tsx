'use client';

import { useEvmWallet } from '@/contexts/EvmWalletContext';
import VaraEthStreamDashboard from '@/components/v3/VaraEthStreamDashboard';
import { Zap, Wallet, AlertTriangle, ArrowLeftRight, Loader2 } from 'lucide-react';

export default function VaraEthPage() {
  const { address, isConnected, isConnecting, isCorrectChain, connect, switchToVaraEth, error } =
    useEvmWallet();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" />
            Vara.eth Streams
          </h1>
          <p className="text-xs text-provn-muted mt-0.5">
            EVM-native token streaming powered by Vara.eth on Hoodi testnet
          </p>
        </div>

        {/* EVM wallet connect / chain switch */}
        <div className="flex items-center gap-2">
          {!isConnected ? (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
            >
              {isConnecting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</>
                : <><Wallet className="w-3.5 h-3.5" /> Connect EVM Wallet</>}
            </button>
          ) : !isCorrectChain ? (
            <button
              onClick={switchToVaraEth}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 text-xs font-medium hover:bg-yellow-500/25 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Switch to Vara.eth
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {address!.slice(0, 6)}…{address!.slice(-4)}
            </div>
          )}
        </div>
      </div>

      {/* EVM wallet error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Wrong chain banner */}
      {isConnected && !isCorrectChain && (
        <div className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          You are on the wrong network. Click <strong className="ml-1">Switch to Vara.eth</strong> to continue.
        </div>
      )}

      {/* Main dashboard — pass EVM address only when on correct chain */}
      <VaraEthStreamDashboard evmAddress={isConnected && isCorrectChain ? address! : undefined} />
    </div>
  );
}

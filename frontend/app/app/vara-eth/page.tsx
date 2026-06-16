'use client';

import { useEffect } from 'react';
import { useEvmWallet } from '@/contexts/EvmWalletContext';
import { useNetworkMode } from '@/contexts/NetworkModeContext';
import VaraEthStreamDashboard from '@/components/v3/VaraEthStreamDashboard';
import { Zap, AlertTriangle, ArrowLeftRight } from 'lucide-react';

export default function VaraEthPage() {
  const { address, isConnected, isCorrectChain, switchToVaraEth, error } = useEvmWallet();
  const { mode, setMode } = useNetworkMode();

  // Auto-sync sidebar to Vara.eth mode when navigating here directly
  useEffect(() => {
    if (mode !== 'vara-eth') setMode('vara-eth');
  }, [mode, setMode]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-400" />
          Vara.eth Streams
        </h1>
        <p className="text-xs text-provn-muted mt-0.5">
          EVM-native token streaming powered by Vara.eth on Hoodi testnet
        </p>
      </div>

      {/* EVM wallet error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Wrong chain banner with switch button */}
      {isConnected && !isCorrectChain && (
        <div className="flex items-center justify-between text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            You are on the wrong network.
          </div>
          <button
            onClick={switchToVaraEth}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-yellow-500/20 text-yellow-400 text-xs font-medium hover:bg-yellow-500/30 transition-colors"
          >
            <ArrowLeftRight className="w-3 h-3" />
            Switch to Vara.eth
          </button>
        </div>
      )}

      {/* Main dashboard */}
      <VaraEthStreamDashboard evmAddress={isConnected && isCorrectChain ? address! : undefined} />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Wallet } from '@gear-js/wallet-connect';
import { useApi } from '@gear-js/react-hooks';
import { Waves, Wallet as WalletIcon, Zap } from 'lucide-react';
import { useEvmWallet } from '@/contexts/EvmWalletContext';

type WalletMode = 'substrate' | 'evm';

export default function WalletConnect() {
  const { isApiReady } = useApi();
  const { connect: connectEvm, isConnecting: evmConnecting, isConnected: evmConnected, address: evmAddress, isCorrectChain, switchToVaraEth, error: evmError } = useEvmWallet();
  const [mode, setMode] = useState<WalletMode>('substrate');

  return (
    <div className="min-h-screen bg-provn-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-4">
            <Waves className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-provn-text mb-2">GrowStreams</h1>
          <p className="text-provn-muted text-sm">
            Connect your wallet to start streaming tokens
          </p>
        </div>

        {/* Mode selector */}
        <div className="flex rounded-xl border border-white/10 bg-white/5 p-1 mb-6">
          <button
            onClick={() => setMode('substrate')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'substrate'
                ? 'bg-emerald-500 text-white shadow'
                : 'text-provn-muted hover:text-provn-text'
            }`}
          >
            <WalletIcon className="w-4 h-4" />
            Polkadot wallet
          </button>
          <button
            onClick={() => setMode('evm')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'evm'
                ? 'bg-emerald-500 text-white shadow'
                : 'text-provn-muted hover:text-provn-text'
            }`}
          >
            <Zap className="w-4 h-4" />
            MetaMask · Vara.eth
          </button>
        </div>

        {/* Substrate / Vara native */}
        {mode === 'substrate' && (
          <div className="flex justify-center">
            {isApiReady ? (
              <Wallet theme="vara" displayBalance />
            ) : (
              <p className="text-provn-muted text-sm animate-pulse">
                Connecting to Vara network...
              </p>
            )}
          </div>
        )}

        {/* EVM / Vara.eth */}
        {mode === 'evm' && (
          <div className="space-y-3">
            {evmConnected ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                <p className="text-emerald-400 text-xs font-mono mb-1">Connected</p>
                <p className="text-provn-text text-sm font-mono truncate">{evmAddress}</p>
                {!isCorrectChain && (
                  <button
                    onClick={switchToVaraEth}
                    className="mt-3 w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 text-sm hover:bg-amber-500/30 transition-colors"
                  >
                    Switch to Vara.eth network
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={connectEvm}
                disabled={evmConnecting}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                {evmConnecting ? 'Connecting...' : 'Connect MetaMask'}
              </button>
            )}
            {evmError && (
              <p className="text-red-400 text-xs text-center">{evmError}</p>
            )}
            <p className="text-center text-xs text-provn-muted">
              Uses Vara.eth (Hoodi Testnet) · Chain ID 560048
            </p>
          </div>
        )}

        <p className="text-center text-xs text-provn-muted mt-6">
          {mode === 'substrate' ? 'Vara Testnet' : 'Vara.eth · Hoodi Testnet'}
        </p>
      </div>
    </div>
  );
}

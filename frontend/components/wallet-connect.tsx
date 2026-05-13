'use client';

import { Wallet } from '@gear-js/wallet-connect';
import { useApi } from '@gear-js/react-hooks';
import { Waves } from 'lucide-react';

export default function WalletConnect() {
  const { isApiReady } = useApi();

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

        <div className="flex flex-col items-center gap-4">
          {isApiReady ? (
            <div className="gear-wallet-override w-full">
              <Wallet theme="vara" displayBalance />
            </div>
          ) : (
            <p className="text-provn-muted text-sm animate-pulse">
              Connecting to Vara network...
            </p>
          )}
          <p className="text-xs text-provn-muted text-center">
            Don&apos;t have a wallet?{' '}
            <a
              href="https://www.subwallet.app/download.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 underline font-medium"
            >
              Install SubWallet
            </a>
            {' '}— the recommended Polkadot wallet for Vara Network.
          </p>
        </div>

        <p className="text-center text-xs text-provn-muted mt-6">Vara Testnet</p>
      </div>
    </div>
  );
}

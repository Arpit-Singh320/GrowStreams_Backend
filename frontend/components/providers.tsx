'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { EvmWalletProvider } from '@/contexts/EvmWalletContext';
import { WalletConnectProvider } from '@/contexts/WalletConnectContext';
import { NetworkModeProvider } from '@/contexts/NetworkModeContext';
import { hydrateProgramIds } from '@/lib/program-ids';

const VaraProviders = dynamic(
  () => import('@/contexts/VaraContext').then((mod) => mod.VaraProviders),
  { ssr: false }
);

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Pull authoritative program IDs from the backend so a contract redeploy
    // never silently desyncs the frontend's hardcoded fallbacks.
    hydrateProgramIds();
  }, []);

  if (!mounted) {
    return (
      <QueryClientProvider client={queryClient}>
        <EvmWalletProvider>
          <div className="flex items-center justify-center min-h-screen bg-provn-bg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
              <p className="text-provn-muted">Connecting to Vara...</p>
            </div>
          </div>
        </EvmWalletProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <NetworkModeProvider>
        <EvmWalletProvider>
          <VaraProviders>
            <WalletConnectProvider>
              {children}
              <Toaster position="top-right" richColors />
            </WalletConnectProvider>
          </VaraProviders>
        </EvmWalletProvider>
      </NetworkModeProvider>
    </QueryClientProvider>
  );
}
'use client';

import { useAccount } from '@gear-js/react-hooks';
import AppLayout from '@/components/app-layout';
import WalletConnect from '@/components/wallet-connect';

const DEV_WALLET = process.env.NEXT_PUBLIC_DEV_WALLET;

export default function AppRootLayout({ children }: { children: React.ReactNode }) {
  const { account } = useAccount();

  if (!account && !DEV_WALLET) {
    return <WalletConnect />;
  }

  return <AppLayout>{children}</AppLayout>;
}

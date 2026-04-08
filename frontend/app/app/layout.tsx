'use client';

import AppLayout from '@/components/app-layout';

export default function AppRootLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}

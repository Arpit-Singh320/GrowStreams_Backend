'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { Wallet as GearWallet } from '@gear-js/wallet-connect';
import {
  LayoutDashboard, Waves, Vault, GitFork, Shield,
  Trophy, Fingerprint, Wallet, LogOut, Menu, Coins,
  Medal, Zap, Smartphone, Sprout, ArrowLeftRight,
  Activity, Wallet2,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useWalletConnect } from '@/contexts/WalletConnectContext';
import { useNetworkMode } from '@/contexts/NetworkModeContext';
import { useEvmWallet } from '@/contexts/EvmWalletContext';

const PixelBlast = dynamic(() => import('@/components/ui/PixelBlast'), { ssr: false });
const RisingLines = dynamic(() => import('@/components/ui/RisingLines'), { ssr: false });

const comingSoonRoutes = ['/app/splits', '/app/bounties', '/app/identity', '/app/permissions'];

const varaNavItems = [
  { href: '/app',            label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/app/streams',    label: 'Streams',     icon: Waves },
  { href: '/app/grow',       label: 'GROW Token',  icon: Coins,        soon: true },
  { href: '/app/vault',      label: 'Vault',       icon: Vault },
  { href: '/app/bridge',     label: 'Bridge',      icon: ArrowLeftRight },
  { href: '/app/campaign',   label: 'Campaign',    icon: Zap },
  { href: '/app/quests',     label: 'Earn',        icon: Sprout },
  { href: '/app/leaderboard',label: 'Leaderboard', icon: Medal },
  { href: '/app/splits',     label: 'Splits',      icon: GitFork,      soon: true },
  { href: '/app/bounties',   label: 'Bounties',    icon: Trophy,       soon: true },
  { href: '/app/identity',   label: 'Identity',    icon: Fingerprint,  soon: true },
  { href: '/app/permissions',label: 'Permissions', icon: Shield,       soon: true },
];

const varaEthNavItems = [
  { href: '/app/vara-eth',   label: 'EVM Streams', icon: Activity },
  { href: '/app/campaign',   label: 'Campaign',    icon: Zap },
  { href: '/app/quests',     label: 'Earn',        icon: Sprout },
  { href: '/app/leaderboard',label: 'Leaderboard', icon: Medal },
];

function shortenAddress(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const { account, logout } = useAccount();
  const { isApiReady } = useApi();
  const { isConnected: isWCConnected, isConnecting: isWCConnecting, connect: wcConnect, disconnect: wcDisconnect } = useWalletConnect();
  const { address: evmAddress, isConnected: evmConnected, connect: evmConnect } = useEvmWallet();
  const { mode, isVaraEth, toggle } = useNetworkMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isComingSoon = comingSoonRoutes.some(r => pathname.startsWith(r));
  const navItems     = isVaraEth ? varaEthNavItems : varaNavItems;

  // Sync mode with URL on mount — if user lands on /app/vara-eth set mode automatically
  useEffect(() => {
    if (pathname.startsWith('/app/vara-eth') && mode !== 'vara-eth') {
      // don't call toggle — just leave; user can toggle manually
    }
  }, [pathname, mode]);

  function handleToggle() {
    toggle();
    if (!isVaraEth) {
      router.push('/app/vara-eth');
    } else {
      router.push('/app');
    }
  }

  return (
    <div className="flex h-screen bg-provn-bg text-provn-text overflow-hidden relative">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
        {isComingSoon ? (
          <RisingLines
            color="#10b981"
            horizonColor="#10b981"
            haloColor="#34d399"
            riseSpeed={0.08}
            flowSpeed={0.15}
            riseIntensity={0.6}
            flowIntensity={0.4}
            haloIntensity={5.0}
            brightness={0.8}
            horizonHeight={-0.5}
            circleScale={0.3}
          />
        ) : (
          <PixelBlast
            variant="square"
            pixelSize={4}
            color="#10b981"
            patternScale={2}
            patternDensity={1}
            pixelSizeJitter={0}
            enableRipples
            rippleSpeed={0.4}
            rippleThickness={0.12}
            rippleIntensityScale={1.5}
            speed={0.3}
            edgeFade={0.25}
            transparent
            globalMouseTracking
          />
        )}
      </div>
      <div className="fixed inset-0 pointer-events-none z-[5] bg-black/40 backdrop-blur-sm" />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-provn-surface/95 backdrop-blur-sm border-r border-provn-border flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo + network toggle */}
        <div className="p-4 border-b border-provn-border space-y-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="GrowStreams" width={130} height={32} className="h-8 w-auto" priority />
          </Link>

          {/* Network mode toggle — full switch like vara.network */}
          <div className="flex items-center rounded-full border border-provn-border bg-provn-bg/60 p-0.5 text-[11px] font-bold">
            <button
              onClick={() => { if (isVaraEth) handleToggle(); }}
              className={`flex-1 py-1.5 rounded-full transition-all duration-200 text-center ${
                !isVaraEth
                  ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/40'
                  : 'text-provn-muted hover:text-provn-text'
              }`}
            >
              VARA
            </button>
            <button
              onClick={() => { if (!isVaraEth) handleToggle(); }}
              className={`flex-1 py-1.5 rounded-full transition-all duration-200 text-center ${
                isVaraEth
                  ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/40'
                  : 'text-provn-muted hover:text-provn-text'
              }`}
            >
              VARA.ETH
            </button>
          </div>

          {/* Active network badge */}
          <div className="flex items-center gap-1.5 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-provn-muted">
              {isVaraEth ? 'Hoodi Testnet (EVM)' : 'Vara Mainnet'}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon, soon }: { href: string; label: string; icon: React.ElementType; soon?: boolean }) => {
            const active = pathname === href || (href !== '/app' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : soon
                    ? 'text-provn-muted hover:text-provn-muted hover:bg-provn-border/20'
                    : 'text-provn-muted hover:text-provn-text hover:bg-provn-border/30'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${soon ? 'opacity-50' : ''}`} />
                <span className="flex-1">{label}</span>
                {soon && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-provn-border/40 text-provn-muted">Soon</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Wallet footer — shows Vara wallet on Vara mode, EVM on Vara.eth */}
        {isVaraEth ? (
          evmConnected && evmAddress ? (
            <div className="p-3 border-t border-provn-border">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-provn-bg/50">
                <Wallet2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-mono text-provn-muted truncate">
                  {shortenAddress(evmAddress)}
                </span>
                <span className="ml-auto text-[9px] text-emerald-400/70 font-medium">EVM</span>
              </div>
            </div>
          ) : null
        ) : (
          account && (
            <div className="p-3 border-t border-provn-border">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-provn-bg/50">
                <Wallet className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-mono text-provn-muted truncate">
                  {shortenAddress(account.address)}
                </span>
                <button
                  onClick={() => { if (isWCConnected) wcDisconnect(); else logout(); }}
                  className="ml-auto text-provn-muted hover:text-red-400 transition-colors"
                  title="Disconnect"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        )}
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-provn-border flex items-center px-4 lg:px-6 bg-provn-surface/80 backdrop-blur-sm flex-shrink-0 relative z-10">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden mr-3 p-1.5 rounded-lg hover:bg-provn-border/30">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            {/* Vara mode: show Gear wallet + WalletConnect */}
            {!isVaraEth && (
              <>
                {isApiReady && (
                  <div className="gear-wallet-override">
                    <GearWallet theme="vara" displayBalance />
                  </div>
                )}
                {isApiReady && !account && (
                  <button
                    onClick={wcConnect}
                    disabled={isWCConnecting}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
                    title="Connect mobile wallet via WalletConnect"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isWCConnecting ? 'Connecting...' : 'Mobile'}</span>
                  </button>
                )}
              </>
            )}

            {/* Vara.eth mode: show MetaMask connect */}
            {isVaraEth && !evmConnected && (
              <button
                onClick={evmConnect}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              >
                <Wallet2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Connect EVM Wallet</span>
              </button>
            )}
            {isVaraEth && evmConnected && evmAddress && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-mono">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {evmAddress.slice(0, 6)}…{evmAddress.slice(-4)}
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}

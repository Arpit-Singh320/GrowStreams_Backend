'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

export type NetworkMode = 'vara' | 'vara-eth';

const STORAGE_KEY = 'gs:network-mode';

interface NetworkModeState {
  mode: NetworkMode;
  isVaraEth: boolean;
  setMode: (m: NetworkMode) => void;
  toggle: () => void;
}

const NetworkModeContext = createContext<NetworkModeState>({
  mode: 'vara',
  isVaraEth: false,
  setMode: () => {},
  toggle: () => {},
});

/** Resolve the initial mode synchronously so there's no flicker on refresh. */
function resolveInitialMode(): NetworkMode {
  if (typeof window === 'undefined') return 'vara';
  // The URL is the source of truth — being on the vara-eth route means vara-eth.
  if (window.location.pathname.startsWith('/app/vara-eth')) return 'vara-eth';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'vara-eth' ? 'vara-eth' : 'vara';
}

export function NetworkModeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mode, setModeState] = useState<NetworkMode>(resolveInitialMode);

  const setMode = useCallback((m: NetworkMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* localStorage may be unavailable (private mode) — ignore */
    }
  }, []);

  const toggle = useCallback(
    () => setMode(mode === 'vara' ? 'vara-eth' : 'vara'),
    [mode, setMode],
  );

  // Keep the mode in sync with the URL: landing on /app/vara-eth (refresh,
  // deep link, back/forward) always reflects vara-eth in the UI.
  useEffect(() => {
    if (pathname?.startsWith('/app/vara-eth')) {
      setMode('vara-eth');
    } else if (pathname?.startsWith('/app')) {
      setMode('vara');
    }
  }, [pathname, setMode]);

  return (
    <NetworkModeContext.Provider
      value={{ mode, isVaraEth: mode === 'vara-eth', setMode, toggle }}
    >
      {children}
    </NetworkModeContext.Provider>
  );
}

export function useNetworkMode() {
  return useContext(NetworkModeContext);
}

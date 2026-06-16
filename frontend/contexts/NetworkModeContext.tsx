'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type NetworkMode = 'vara' | 'vara-eth';

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

export function NetworkModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<NetworkMode>('vara');

  const setMode = useCallback((m: NetworkMode) => setModeState(m), []);
  const toggle  = useCallback(() => setModeState(m => m === 'vara' ? 'vara-eth' : 'vara'), []);

  return (
    <NetworkModeContext.Provider value={{ mode, isVaraEth: mode === 'vara-eth', setMode, toggle }}>
      {children}
    </NetworkModeContext.Provider>
  );
}

export function useNetworkMode() {
  return useContext(NetworkModeContext);
}

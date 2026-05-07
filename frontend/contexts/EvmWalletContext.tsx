'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Vara.eth Hoodi testnet chain params for wallet_addEthereumChain
// ---------------------------------------------------------------------------
const VARA_ETH_CHAIN = {
  chainId: '0x88bb0',
  chainName: 'Vara.eth (Hoodi Testnet)',
  nativeCurrency: { name: 'Hoodi Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://hoodi-reth-rpc.gear-tech.io'],
  blockExplorerUrls: ['https://hoodi.etherscan.io'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EvmWalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  isCorrectChain: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToVaraEth: () => Promise<void>;
  error: string | null;
}

const EvmWalletContext = createContext<EvmWalletState>({
  address: null,
  isConnected: false,
  isConnecting: false,
  chainId: null,
  isCorrectChain: false,
  connect: async () => {},
  disconnect: () => {},
  switchToVaraEth: async () => {},
  error: null,
});

export const useEvmWallet = () => useContext(EvmWalletContext);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function EvmWalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetChainId = parseInt(VARA_ETH_CHAIN.chainId, 16);
  const isConnected = !!address;
  const isCorrectChain = chainId === targetChainId;

  const getEthereum = () => {
    if (typeof window === 'undefined') return null;
    return (window as any).ethereum || null;
  };

  // Restore previously connected account on mount
  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;

    eth.request({ method: 'eth_accounts' })
      .then((accounts: string[]) => {
        if (accounts.length > 0) setAddress(accounts[0].toLowerCase());
      })
      .catch(() => {});

    eth.request({ method: 'eth_chainId' })
      .then((id: string) => setChainId(parseInt(id, 16)))
      .catch(() => {});

    const onAccountsChanged = (accounts: string[]) => {
      setAddress(accounts.length > 0 ? accounts[0].toLowerCase() : null);
    };
    const onChainChanged = (id: string) => {
      setChainId(parseInt(id, 16));
    };

    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);

    return () => {
      eth.removeListener('accountsChanged', onAccountsChanged);
      eth.removeListener('chainChanged', onChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) {
      setError('MetaMask not detected. Install MetaMask to use the EVM wallet path.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts.length === 0) throw new Error('No accounts returned');
      setAddress(accounts[0].toLowerCase());

      const id: string = await eth.request({ method: 'eth_chainId' });
      setChainId(parseInt(id, 16));
    } catch (err: any) {
      if (err.code !== 4001) {
        setError(err.message || 'MetaMask connection failed');
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
  }, []);

  const switchToVaraEth = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;

    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: VARA_ETH_CHAIN.chainId }],
      });
    } catch (switchErr: any) {
      // Chain not added yet — add it
      if (switchErr.code === 4902) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [VARA_ETH_CHAIN],
          });
        } catch (addErr: any) {
          setError(addErr.message || 'Failed to add Vara.eth network');
        }
      } else {
        setError(switchErr.message || 'Failed to switch network');
      }
    }
  }, []);

  return (
    <EvmWalletContext.Provider
      value={{
        address,
        isConnected,
        isConnecting,
        chainId,
        isCorrectChain,
        connect,
        disconnect,
        switchToVaraEth,
        error,
      }}
    >
      {children}
    </EvmWalletContext.Provider>
  );
}

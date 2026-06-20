'use client';

import { useEffect } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api, setApiWallet } from '@/lib/growstreams-api';

// Tracks which wallets we've already attempted to register this session so we
// don't spam POST /api/users/register on every account change / re-render.
const registered = new Set<string>();

/**
 * Keeps the API client's connected-wallet in sync with the Gear account, and
 * lazily registers the wallet in the backend `users` table.
 *
 * Backend routes guarded by `requireAuth` (stream/vault/splits creation, etc.)
 * reject requests whose wallet is missing OR not present in the users table.
 * The API client now sends the wallet as an `x-wallet` header (see
 * setApiWallet), and this component ensures the wallet actually exists in the
 * table by firing an idempotent registration on connect. A 409 "already
 * registered" is the expected happy-path on repeat connects and is ignored.
 *
 * Renders nothing.
 */
export function ApiWalletSync() {
  const { account } = useAccount();

  useEffect(() => {
    const wallet = account?.decodedAddress || null;
    setApiWallet(wallet);

    if (!wallet || registered.has(wallet)) return;
    registered.add(wallet);

    api.users.register({ wallet }).catch((err: unknown) => {
      // 409 = already registered (expected). Anything else is non-fatal:
      // the worst case is a later 401 the user will see surfaced normally.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already registered/i.test(msg)) {
        console.warn('[api-wallet-sync] register failed:', msg);
      }
    });
  }, [account?.decodedAddress]);

  return null;
}

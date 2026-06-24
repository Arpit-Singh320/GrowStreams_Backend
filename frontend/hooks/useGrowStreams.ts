'use client';

import { useState, useCallback } from 'react';
import { useApi, useAccount } from '@gear-js/react-hooks';
// Dynamic import to avoid SSR "window is not defined" crash
const getExtensionDapp = () => import('@polkadot/extension-dapp');
import { decodeAddress } from '@gear-js/api';
import { api as gsApi, type PayloadResult, type TxResult } from '@/lib/growstreams-api';

// Program IDs are owned by the backend and hydrated at app startup from
// /api/config/program-ids. Imported for local use and re-exported so existing
// imports (`from '@/hooks/useGrowStreams'`) keep working unchanged.
import { PROGRAM_IDS, hydrateProgramIds } from '@/lib/program-ids';
export { PROGRAM_IDS, hydrateProgramIds };

interface SendResult {
  blockHash: string;
  success: boolean;
}

function isPayload(r: TxResult | PayloadResult): r is PayloadResult {
  return 'payload' in r;
}

function getPayload(res: TxResult | PayloadResult): string {
  if (!isPayload(res)) throw new Error('Expected payload from API');
  const p = res.payload;
  if (typeof p === 'string' && p.startsWith('0x')) return p;
  return p;
}

function toHex(address: string): string {
  if (address.startsWith('0x') && address.length === 66) return address;
  try {
    return decodeAddress(address);
  } catch {
    return address;
  }
}

// Decode the real reason out of a System.ExtrinsicFailed event so the user sees
// e.g. "On-chain error: balances.InsufficientBalance — ..." instead of a generic
// "Check contract parameters". The dispatchError is the first event argument.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeDispatchError(api: any, failedEvent: any): string {
  try {
    const dispatchError = failedEvent?.event?.data?.[0] ?? failedEvent?.event?.data?.dispatchError;
    if (dispatchError?.isModule) {
      const decoded = api.registry.findMetaError(dispatchError.asModule);
      const { section, name, docs } = decoded;
      const doc = Array.isArray(docs) ? docs.join(' ').trim() : '';
      return `On-chain error: ${section}.${name}${doc ? ` — ${doc}` : ''}`;
    }
    if (dispatchError?.isToken) {
      return `On-chain token error: ${dispatchError.asToken.type}`;
    }
    if (dispatchError) {
      return `Transaction failed on-chain: ${dispatchError.toString()}`;
    }
  } catch {
    // fall through to generic message
  }
  return 'Transaction failed on-chain. Check contract parameters.';
}

export function useGearSign() {
  const { api } = useApi();
  const { account } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getOrIssueVoucher = async (wallet: string): Promise<string | null> => {
    try {
      const res = await gsApi.voucher.active(wallet) as { hasVoucher: boolean; voucher: { voucherId: string } | null };
      if (res.hasVoucher && res.voucher?.voucherId) {
        return res.voucher.voucherId;
      }
      // No active voucher — request one from the backend relayer
      const issued = await gsApi.voucher.issue(wallet) as { voucherId: string };
      return issued.voucherId || null;
    } catch (err) {
      console.warn('[gasless] Could not obtain voucher, falling back to user gas:', err);
      return null;
    }
  };

  const signAndSend = useCallback(
    async (contractOrProgramId: keyof typeof PROGRAM_IDS | string, payloadHex: string, value: string | number = 0): Promise<SendResult> => {
      if (!api) throw new Error('Gear API not connected. Please wait for the network connection.');
      if (!account) throw new Error('Wallet not connected. Please connect your Vara wallet first.');

      setLoading(true);
      setError(null);

      try {
        const programId = (contractOrProgramId.startsWith('0x')
          ? contractOrProgramId
          : PROGRAM_IDS[contractOrProgramId]) as `0x${string}`;

        const { web3Enable, web3FromSource, web3FromAddress } = await getExtensionDapp();
        await web3Enable('GrowStreams');

        let injector;
        try {
          injector = await web3FromSource(account.meta.source);
        } catch {
          injector = await web3FromAddress(account.address);
        }
        if (!injector?.signer) {
          throw new Error('Could not access wallet signer. Please reconnect your wallet.');
        }

        const FIXED_GAS = '50000000000';       // 50B — safe for simple calls
        const ASYNC_GAS  = '100000000000';      // 100B — fallback cap for async cross-contract calls
        // Convert value to string for API compatibility
        const valueStr = typeof value === 'string' ? value : String(value);
        const hasValue = BigInt(valueStr) > BigInt(0);

        const isAsyncCall = programId === PROGRAM_IDS.streamCore;
        const isGvaraCall = programId === PROGRAM_IDS.gvaraToken;

        // Always estimate gas to minimize gearBank reservation (avoids InsufficientBalance).
        // For gVARA wrap we pass the actual value so Gear accounts for remaining balance.
        // Only skip estimation if it's impossible (no fallback needed — we use caps).
        let gasLimit = isAsyncCall ? ASYNC_GAS : FIXED_GAS;
        try {
          const gas = await api.program.calculateGas.handle(
            account.decodedAddress as `0x${string}`,
            programId,
            payloadHex as `0x${string}`,
            hasValue ? valueStr : 0,
            true,
          );
          const minGas = BigInt(gas.min_limit.toString());
          const estimated = (minGas * BigInt(6) / BigInt(5)).toString();
          // For async calls, use the estimate but cap at ASYNC_GAS to be safe
          if (isAsyncCall) {
            gasLimit = BigInt(estimated) < BigInt(ASYNC_GAS) ? estimated : ASYNC_GAS;
          } else {
            gasLimit = estimated;
          }
        } catch {
          // Estimation failed — keep the safe fallback
          gasLimit = isAsyncCall ? ASYNC_GAS : FIXED_GAS;
        }

        // Skip voucher for gVARA contract — UnwrapNative sends VARA back via msg::send,
        // which is incompatible with voucher-wrapped calls on Vara mainnet.
        // Try to get a gasless voucher (but skip if sending value or calling gVARA)
        const voucherId = (hasValue || isGvaraCall) ? null : await getOrIssueVoucher(account.decodedAddress);

        return new Promise((resolve, reject) => {
          let tx;
          if (voucherId) {
            // Gasless path: wrap the message in a voucher call
            const messageTx = api.message.send({
              destination: programId,
              payload: payloadHex as `0x${string}`,
              gasLimit,
              value: valueStr,
            });
            tx = api.voucher.call(voucherId as `0x${string}`, { SendMessage: messageTx });
          } else {
            // Fallback: user pays gas normally
            tx = api.message.send({
              destination: programId,
              payload: payloadHex as `0x${string}`,
              gasLimit,
              value: valueStr,
            });
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tx.signAndSend(account.address, { signer: injector.signer as any }, ({ status, events }: any) => {
            if (status.isInBlock) {
              const failedEvent = events?.find((e: any) =>
                api.events.system.ExtrinsicFailed.is(e.event)
              );
              if (failedEvent) {
                reject(new Error(decodeDispatchError(api, failedEvent)));
              } else {
                resolve({ blockHash: status.asInBlock.toHex(), success: true });
              }
            } else if (status.isFinalized) {
              resolve({ blockHash: status.asFinalized.toHex(), success: true });
            } else if (status.isInvalid) {
              reject(new Error('Transaction invalid — it may have been dropped by the network.'));
            }
          }).catch((err: any) => {
            if (err?.message?.includes('Cancelled') || err?.message?.includes('Rejected')) {
              reject(new Error('Transaction was cancelled by the user.'));
            } else {
              reject(err);
            }
          });
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Transaction failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api, account],
  );

  return { signAndSend, loading, error, account };
}

export function useStreamActions() {
  const { signAndSend, loading, error, account } = useGearSign();

  const createStream = async (receiver: string, token: string, flowRate: string, initialDeposit: string) => {
    const res = await gsApi.streams.create({ receiver: toHex(receiver), token: toHex(token), flowRate, initialDeposit, mode: 'payload', raw: true });
    return signAndSend('streamCore', getPayload(res));
  };

  const pauseStream = async (id: number) => {
    const res = await gsApi.streams.pause(id, 'payload');
    return signAndSend('streamCore', getPayload(res));
  };

  const resumeStream = async (id: number) => {
    const res = await gsApi.streams.resume(id, 'payload');
    return signAndSend('streamCore', getPayload(res));
  };

  const depositToStream = async (id: number, amount: string) => {
    const res = await gsApi.streams.deposit(id, { amount, mode: 'payload' });
    return signAndSend('streamCore', getPayload(res));
  };

  const withdrawFromStream = async (id: number) => {
    const res = await gsApi.streams.withdraw(id, 'payload');
    return signAndSend('streamCore', getPayload(res));
  };

  const stopStream = async (id: number) => {
    const res = await gsApi.streams.stop(id, 'payload');
    return signAndSend('streamCore', getPayload(res));
  };

  const updateStream = async (id: number, flowRate: string) => {
    const res = await gsApi.streams.update(id, { flowRate, mode: 'payload' });
    return signAndSend('streamCore', getPayload(res));
  };

  const liquidateStream = async (id: number) => {
    const res = await gsApi.streams.liquidate(id, 'payload');
    return signAndSend('streamCore', getPayload(res));
  };

  return {
    createStream, pauseStream, resumeStream, depositToStream,
    withdrawFromStream, stopStream, updateStream, liquidateStream,
    loading, error, account,
  };
}

export function useVaultActions() {
  const { signAndSend, loading, error } = useGearSign();

  const depositTokens = async (token: string, amountRaw: string) => {
    const res = await gsApi.vault.deposit({ token, amountRaw, mode: 'payload' });
    return signAndSend('tokenVault', getPayload(res));
  };

  const withdrawTokens = async (token: string, amountRaw: string) => {
    const res = await gsApi.vault.withdraw({ token, amountRaw, mode: 'payload' });
    return signAndSend('tokenVault', getPayload(res));
  };

  const depositNative = async (amount: string) => {
    const res = await gsApi.vault.depositNative({ amount, mode: 'payload' });
    return signAndSend('tokenVault', getPayload(res), Number(amount));
  };

  const withdrawNative = async (amount: string) => {
    const res = await gsApi.vault.withdrawNative({ amount, mode: 'payload' });
    return signAndSend('tokenVault', getPayload(res));
  };

  return { depositTokens, withdrawTokens, depositNative, withdrawNative, loading, error };
}

export function useSplitsActions() {
  const { signAndSend, loading, error } = useGearSign();

  const createGroup = async (recipients: { address: string; weight: number }[]) => {
    const mapped = recipients.map(r => ({ ...r, address: toHex(r.address) }));
    const res = await gsApi.splits.create({ recipients: mapped, mode: 'payload' });
    return signAndSend('splitsRouter', getPayload(res));
  };

  const distribute = async (id: number, token: string, amount: string) => {
    const res = await gsApi.splits.distribute(id, { token, amount, mode: 'payload' });
    return signAndSend('splitsRouter', getPayload(res));
  };

  const deleteGroup = async (id: number) => {
    return gsApi.splits.delete(id);
  };

  return { createGroup, distribute, deleteGroup, loading, error };
}

export function useBountyActions() {
  const { signAndSend, loading, error } = useGearSign();

  const createBounty = async (title: string, token: string, maxFlowRate: string, minScore: number, totalBudget: string) => {
    const res = await gsApi.bounty.create({ title, token, maxFlowRate, minScore, totalBudget, mode: 'payload' });
    return signAndSend('bountyAdapter', getPayload(res));
  };

  const claimBounty = async (id: number) => {
    const res = await gsApi.bounty.claim(id, 'payload');
    return signAndSend('bountyAdapter', getPayload(res));
  };

  const completeBounty = async (id: number) => {
    const res = await gsApi.bounty.complete(id, 'payload');
    return signAndSend('bountyAdapter', getPayload(res));
  };

  return { createBounty, claimBounty, completeBounty, loading, error };
}

export function usePermissionActions() {
  const { signAndSend, loading, error } = useGearSign();

  const grantPermission = async (grantee: string, scope: string) => {
    const res = await gsApi.permissions.grant({ grantee: toHex(grantee), scope, mode: 'payload' });
    return signAndSend('permissionManager', getPayload(res));
  };

  const revokePermission = async (grantee: string, scope: string) => {
    const res = await gsApi.permissions.revoke({ grantee: toHex(grantee), scope, mode: 'payload' });
    return signAndSend('permissionManager', getPayload(res));
  };

  return { grantPermission, revokePermission, loading, error };
}

export function useGrowTokenActions() {
  const { signAndSend, loading, error } = useGearSign();

  const approve = async (spender: string, amount: string) => {
    const res = await gsApi.growToken.approve({ spender: toHex(spender), amount, mode: 'payload' });
    return signAndSend('growToken', getPayload(res));
  };

  const transfer = async (to: string, amount: string) => {
    const res = await gsApi.growToken.transfer({ to: toHex(to), amount, mode: 'payload' });
    return signAndSend('growToken', getPayload(res));
  };

  const mint = async (to: string, amount: string) => {
    const res = await gsApi.growToken.mint({ to: toHex(to), amount, mode: 'payload' });
    return signAndSend('growToken', getPayload(res));
  };

  return { approve, transfer, mint, loading, error };
}

export function useIdentityActions() {
  const { signAndSend, loading, error } = useGearSign();

  const bindIdentity = async (actorId: string, githubUsername: string, proofHash: string, score: number) => {
    const res = await gsApi.identity.bind({ actorId: toHex(actorId), githubUsername, proofHash, score, mode: 'payload' });
    return signAndSend('identityRegistry', getPayload(res));
  };

  return { bindIdentity, loading, error };
}

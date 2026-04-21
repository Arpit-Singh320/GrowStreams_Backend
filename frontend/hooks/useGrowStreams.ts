'use client';

import { useState, useCallback } from 'react';
import { useApi, useAccount } from '@gear-js/react-hooks';
// Dynamic import to avoid SSR "window is not defined" crash
const getExtensionDapp = () => import('@polkadot/extension-dapp');
import { decodeAddress } from '@gear-js/api';
import { api as gsApi, type PayloadResult, type TxResult } from '@/lib/growstreams-api';

export const PROGRAM_IDS: Record<string, string> = {
  streamCore: '0x0998ba27a7b2a0d8a383dc23054164bac1fc2e4b64694f0d7ec4db3bd6265957',
  tokenVault: '0xc7647e6e6b47ab9390f081dff1373e58733c698ef0b9ce582dca8ebe9af66588',
  growToken: '0x8c3cc925e34285243619fcb07fcd6622a9148426354c144819bf52b93de885bf',
  splitsRouter: '0x8f9fcabb24ae57404b6c3a9fde57331a32e457326652fc535e773389d90b4395',
  permissionManager: '0x467b350648690279e9bbf16fbc7c0525d8e5628d967382a36253c1c095fa4a0f',
  bountyAdapter: '0xc34b86ada8fcbb18c2b6efcd4f9299592e4d909bc7b803ed047ba5cfaf76eb32',
  identityRegistry: '0xd07d3da386ad769e8ef37923666cb22efef479d2d5b32c1bbbd01e37c3cdeff7',
};

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

export function useGearSign() {
  const { api } = useApi();
  const { account } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signAndSend = useCallback(
    async (contractOrProgramId: keyof typeof PROGRAM_IDS | string, payloadHex: string, value = 0): Promise<SendResult> => {
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

        const gas = await api.program.calculateGas.handle(
          account.decodedAddress as `0x${string}`,
          programId,
          payloadHex as `0x${string}`,
          value,
          true,
        );

        const minGas = BigInt(gas.min_limit.toString());
        const gasLimit = (minGas * BigInt(6) / BigInt(5)).toString();

        return new Promise((resolve, reject) => {
          const tx = api.message.send({
            destination: programId,
            payload: payloadHex as `0x${string}`,
            gasLimit,
            value,
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tx.signAndSend(account.address, { signer: injector.signer as any }, ({ status, events }) => {
            if (status.isInBlock) {
              const failed = events?.some((e) =>
                api.events.system.ExtrinsicFailed.is(e.event)
              );
              if (failed) {
                reject(new Error('Transaction failed on-chain. Check contract parameters.'));
              } else {
                resolve({ blockHash: status.asInBlock.toHex(), success: true });
              }
            } else if (status.isFinalized) {
              resolve({ blockHash: status.asFinalized.toHex(), success: true });
            } else if (status.isInvalid) {
              reject(new Error('Transaction invalid — it may have been dropped by the network.'));
            }
          }).catch((err) => {
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
    const res = await gsApi.streams.create({ receiver: toHex(receiver), token: toHex(token), flowRate, initialDeposit, mode: 'payload' });
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

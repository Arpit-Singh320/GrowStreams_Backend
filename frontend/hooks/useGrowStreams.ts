'use client';

import { useState, useCallback } from 'react';
import { useApi, useAccount } from '@gear-js/react-hooks';
// Dynamic import to avoid SSR "window is not defined" crash
const getExtensionDapp = () => import('@polkadot/extension-dapp');
import { decodeAddress } from '@gear-js/api';
import { api as gsApi, type PayloadResult, type TxResult } from '@/lib/growstreams-api';

export const PROGRAM_IDS: Record<string, string> = {
  streamCore: '0x7faee98f78cb710ab2d5ada7b364e2b8eb7513e4cd1e769d109b83fe7872329d',
  tokenVault: '0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef',
  growToken: '0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163',
  splitsRouter: '0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45',
  permissionManager: '0x52f4299e964dab5e97c91cdd10e2d6e635b19696ab8389889aabceba3de9e581',
  bountyAdapter: '0x7697bb2e8655e6cd7294389a0289355f48fd5459914d2a735c9966dad548bd4f',
  identityRegistry: '0x6f413156308663798a77507cf0ea6e79bdbf53add3579ccd4317fc320acf7f29',
  questSeeds: '0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d',
  wvara: '0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d',
  gvaraToken: '0x71de1ef1f4dec1a4fe862aa6c92747c8499bbf1af128625749027392709f4a72',
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

        const FIXED_GAS = '50000000000'; // 50B — safe fallback
        // Convert value to string for API compatibility
        const valueStr = typeof value === 'string' ? value : String(value);
        const hasValue = BigInt(valueStr) > BigInt(0);

        let gasLimit = FIXED_GAS;
        if (!hasValue) {
          // Only estimate gas for zero-value messages — gas estimation with value is unreliable on Vara mainnet
          try {
            const gas = await api.program.calculateGas.handle(
              account.decodedAddress as `0x${string}`,
              programId,
              payloadHex as `0x${string}`,
              0,
              true,
            );
            const minGas = BigInt(gas.min_limit.toString());
            gasLimit = (minGas * BigInt(6) / BigInt(5)).toString();
          } catch {
            gasLimit = FIXED_GAS;
          }
        }

        // Skip voucher for gVARA contract — UnwrapNative sends VARA back via msg::send,
        // which is incompatible with voucher-wrapped calls on Vara mainnet.
        const isGvaraCall = programId === PROGRAM_IDS.gvaraToken;
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
              const failed = events?.some((e: any) =>
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

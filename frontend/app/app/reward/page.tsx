'use client';

import { useEffect, useState } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api } from '@/lib/growstreams-api';
import {
  Gift, CheckCircle2, Loader2, ArrowRight, Coins,
  Vault, Waves, ExternalLink, Zap, ChevronRight,
  Sparkles, Lock, CircleDollarSign,
} from 'lucide-react';
import Link from 'next/link';

type RewardStatus = {
  claimed: boolean;
  claimed_at: string | null;
  tx_hash: string | null;
  amount: string | null;
};

const STEPS = [
  {
    step: 1,
    icon: CircleDollarSign,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    title: 'Claim 50 VARA',
    desc: 'Click the Claim button below to receive 50 VARA tokens directly to your connected wallet. One-time only.',
    href: null,
    linkLabel: null,
    screenshot: null,
  },
  {
    step: 2,
    icon: Vault,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    title: 'Wrap VARA → gVARA on Vault',
    desc: 'Go to the Vault page. In the "Wrap VARA ↔ gVARA" section, enter the amount of VARA you want to wrap and click Wrap. 1 VARA = 1 gVARA instantly.',
    href: '/app/vault',
    linkLabel: 'Open Vault',
    screenshot: '/screenshots/vault-wrap.png',
  },
  {
    step: 3,
    icon: Waves,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    title: 'Create a Stream with gVARA',
    desc: 'Go to the Streams page, click New Stream. gVARA is the default streaming token. Enter a receiver address (or use kGiaMA7wophBP4BuJRyCUPTrkrgMfYFL78KaZmAF44WYjuPM2 for testing), flow rate and deposit amount, then create your first stream.',
    href: '/app/streams',
    linkLabel: 'Open Streams',
    screenshot: '/screenshots/create-stream.png',
  },
];

function StepCard({ step, index, total }: { step: typeof STEPS[0]; index: number; total: number }) {
  const Icon = step.icon;
  return (
    <div className={`relative bg-provn-surface border ${step.border} rounded-xl p-5 overflow-hidden`}>
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-5 ${step.bg.replace('/10', '/30')}`} />
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${step.bg} border ${step.border}`}>
          <Icon className={`w-5 h-5 ${step.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${step.color} opacity-70`}>
              Step {step.step} / {total}
            </span>
          </div>
          <h3 className="font-semibold text-sm mb-1">{step.title}</h3>
          <p className="text-xs text-provn-muted leading-relaxed">{step.desc}</p>
          {step.href && (
            <Link
              href={step.href}
              className={`inline-flex items-center gap-1.5 mt-3 text-xs font-medium ${step.color} hover:opacity-80 transition-opacity`}
            >
              {step.linkLabel} <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
      {index < total - 1 && (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10">
          <ArrowRight className="w-4 h-4 text-provn-muted/40 rotate-90" />
        </div>
      )}
    </div>
  );
}

function ExplorerLink({ txHash }: { txHash: string }) {
  const url = `https://vara.subscan.io/extrinsic/${txHash}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
    >
      <ExternalLink className="w-3 h-3" />
      View on Subscan
    </a>
  );
}

export default function RewardPage() {
  const { account } = useAccount();
  const [status, setStatus] = useState<RewardStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');
  const [justClaimed, setJustClaimed] = useState(false);
  const [faucetBalance, setFaucetBalance] = useState<string | null>(null);

  const wallet = account?.address || null;

  useEffect(() => {
    api.reward.walletBalance()
      .then(b => setFaucetBalance(b.balance))
      .catch(() => setFaucetBalance(null));
  }, []);

  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    api.reward.status(wallet)
      .then(s => setStatus(s))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [wallet]);

  const handleClaim = async () => {
    if (!wallet) return;
    setClaiming(true);
    setError('');
    try {
      const result = await api.reward.claim(wallet);
      setStatus({
        claimed: true,
        claimed_at: new Date().toISOString(),
        tx_hash: result.tx_hash,
        amount: result.amount.toString(),
      });
      setJustClaimed(true);
      // Refresh faucet balance
      api.reward.walletBalance()
        .then(b => setFaucetBalance(b.balance))
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim failed. Try again.');
    } finally {
      setClaiming(false);
    }
  };

  const claimed = status?.claimed ?? false;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 text-emerald-400" />
            Reward
          </h1>
          <p className="text-provn-muted text-sm mt-1">Claim your starter VARA tokens and start streaming</p>
        </div>
        {faucetBalance && (
          <div className="text-right">
            <p className="text-xs text-provn-muted uppercase tracking-wider">Faucet Balance</p>
            <p className="text-lg font-bold text-emerald-400">{parseFloat(faucetBalance).toLocaleString()} VARA</p>
          </div>
        )}
      </div>

      {/* Hero Claim Card */}
      <div className="relative bg-gradient-to-br from-emerald-500/10 via-provn-surface to-teal-500/5 border border-emerald-500/20 rounded-2xl p-6 overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-emerald-400/70 uppercase tracking-widest font-medium">One-time reward</p>
              <h2 className="text-3xl font-bold text-emerald-400">50 VARA</h2>
            </div>
          </div>

          <p className="text-sm text-provn-muted mb-5 leading-relaxed">
            Get <span className="text-white font-medium">50 VARA</span> tokens sent directly to your wallet.
            Wrap them to <span className="text-teal-400 font-medium">gVARA</span> on the Vault page, then use them to create real-time money streams.
          </p>

          {!wallet ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-provn-bg border border-provn-border text-sm text-provn-muted">
              <Lock className="w-4 h-4" />
              Connect your Vara wallet to claim
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-provn-muted">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking claim status...
            </div>
          ) : claimed ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-400">
                    {justClaimed ? '🎉 50 VARA successfully sent to your wallet!' : 'Reward already claimed'}
                  </p>
                  {status?.claimed_at && (
                    <p className="text-xs text-provn-muted mt-0.5">
                      Claimed on {new Date(status.claimed_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
              {status?.tx_hash && <ExplorerLink txHash={status.tx_hash} />}
            </div>
          ) : (
            <div className="space-y-3">
              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20"
              >
                {claiming ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending VARA...</>
                ) : (
                  <><Gift className="w-4 h-4" /> Claim 50 VARA</>
                )}
              </button>
              <p className="text-[11px] text-provn-muted">
                ⚡ One-time only · Sent from GrowStreams treasury · No gas required from you
              </p>
            </div>
          )}
        </div>
      </div>

      {/* How to use — step-by-step */}
      <div>
        <h2 className="text-sm font-semibold text-provn-muted uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-400" />
          How to use your VARA
        </h2>
        <div className="space-y-4">
          {STEPS.map((step, i) => (
            <StepCard key={step.step} step={step} index={i} total={STEPS.length} />
          ))}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-provn-surface border border-provn-border rounded-xl p-4 space-y-2">
        <h3 className="text-xs font-semibold text-provn-muted uppercase tracking-wider flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5 text-teal-400" /> About gVARA
        </h3>
        <p className="text-xs text-provn-muted leading-relaxed">
          <span className="text-teal-400 font-medium">gVARA</span> is the GrowStreams Super Token built on top of native VARA.
          It enables real-time per-second streaming — your balance updates every block. Wrap VARA to gVARA on the
          Vault page (1 VARA = 1 gVARA, no fees), then deposit into the vault to start streaming.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/app/vault"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/15 transition-colors"
          >
            <Vault className="w-3.5 h-3.5" /> Vault — Wrap VARA
          </Link>
          <Link
            href="/app/streams"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/15 transition-colors"
          >
            <Waves className="w-3.5 h-3.5" /> Streams — Create Stream
          </Link>
        </div>
      </div>
    </div>
  );
}

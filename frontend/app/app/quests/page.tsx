'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api, QuestData, QuestProgress } from '@/lib/growstreams-api';
import {
  Sprout, Lock, CheckCircle2, Loader2, ArrowRight, Mail,
  Twitter, Github, Ticket, Waves, Star, GitPullRequest,
  Megaphone, Clock, ExternalLink, Sparkles, Trophy,
} from 'lucide-react';

const QUEST_ICONS: Record<string, React.ElementType> = {
  twitter: Twitter,
  megaphone: Megaphone,
  star: Star,
  'git-pull-request': GitPullRequest,
  waves: Waves,
};

// External action links per quest slug
const GROWSTREAMS_X_URL = 'https://x.com/growwstreams';
const GROWSTREAMS_REPO_URL = 'https://github.com/BlockX-AI/GrowStreams_Backend';

const QUEST_LINKS: Record<string, { label: string; href: (wallet: string) => string }> = {
  'follow-x': {
    label: 'Open @growwstreams',
    href: () => GROWSTREAMS_X_URL,
  },
  'mention-x': {
    label: 'Compose tweet',
    href: (wallet) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        `Joining @growwstreams 🌱 wallet: ${wallet}`
      )}`,
  },
  'star-repo': {
    label: 'Open repo',
    href: () => GROWSTREAMS_REPO_URL,
  },
  'raise-pr': {
    label: 'Open repo',
    href: () => GROWSTREAMS_REPO_URL,
  },
  'create-stream': {
    label: 'Go to Streams',
    href: () => '/app/streams',
  },
};

function QuestIcon({ icon }: { icon: string }) {
  const Icon = QUEST_ICONS[icon] || Sprout;
  return <Icon className="w-5 h-5" />;
}

function SeedsBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400">
      <Sprout className="w-3 h-3" />
      {amount}
    </span>
  );
}

// ─── Invite Gate ─────────────────────────────────────────────────────────────
function InviteGate({ onVerified }: { onVerified: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.quests.verifyInvite(code.trim());
      onVerified(code.trim().toUpperCase());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 text-center space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
        <Ticket className="w-8 h-8 text-emerald-400" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">GrowStreams Quests</h1>
        <p className="text-provn-muted text-sm mt-2">
          This is an invite-only quest program. Enter your invite code to get started.
        </p>
      </div>
      <div className="space-y-3">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
          placeholder="GS-XXXX-XXXX"
          className="w-full bg-provn-surface border border-provn-border rounded-lg px-4 py-3 text-center text-lg font-mono tracking-widest focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/40"
          maxLength={12}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={handleVerify}
          disabled={loading || !code.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Verify Invite Code
        </button>
      </div>
    </div>
  );
}

// ─── Registration Form ───────────────────────────────────────────────────────
function RegistrationForm({ wallet, inviteCode, onRegistered }: { wallet: string; inviteCode: string; onRegistered: () => void }) {
  const [email, setEmail] = useState('');
  const [xUsername, setXUsername] = useState('');
  const [githubUsername, setGithubUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!email || !xUsername || !githubUsername) {
      setError('All fields are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.quests.register({
        wallet,
        email: email.trim(),
        x_username: xUsername.trim().replace(/^@/, ''),
        github_username: githubUsername.trim(),
        invite_code: inviteCode,
      });
      onRegistered();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
          <Sparkles className="w-6 h-6 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold">Complete Registration</h2>
        <p className="text-provn-muted text-sm">
          Link your accounts to start earning Seeds
        </p>
      </div>

      <div className="bg-provn-surface border border-provn-border rounded-xl p-5 space-y-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-provn-muted mb-1.5">
            <Mail className="w-3.5 h-3.5" /> Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@gmail.com"
            className="w-full bg-provn-bg border border-provn-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/40"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-provn-muted mb-1.5">
            <Twitter className="w-3.5 h-3.5" /> X (Twitter) Handle
          </label>
          <input
            type="text"
            value={xUsername}
            onChange={e => setXUsername(e.target.value)}
            placeholder="@yourhandle"
            className="w-full bg-provn-bg border border-provn-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/40"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-provn-muted mb-1.5">
            <Github className="w-3.5 h-3.5" /> GitHub Username
          </label>
          <input
            type="text"
            value={githubUsername}
            onChange={e => setGithubUsername(e.target.value)}
            placeholder="yourusername"
            className="w-full bg-provn-bg border border-provn-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/40"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleRegister}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
          Register & Start Questing
        </button>
      </div>

      <p className="text-center text-[10px] text-provn-muted">
        Wallet: {wallet.slice(0, 8)}...{wallet.slice(-6)}
      </p>
    </div>
  );
}

// ─── Quest Card ──────────────────────────────────────────────────────────────
function QuestCard({
  quest,
  wallet,
  onClaim,
  claiming,
}: {
  quest: QuestData;
  wallet: string;
  onClaim: (slug: string, tweetUrl?: string) => void;
  claiming: boolean;
}) {
  const isCompleted = quest.completed;
  const needsTweetUrl = quest.slug === 'follow-x' || quest.slug === 'mention-x';
  const [tweetUrl, setTweetUrl] = useState('');
  const [showInput, setShowInput] = useState(false);
  const link = QUEST_LINKS[quest.slug];

  const handleClaimClick = () => {
    if (needsTweetUrl) {
      if (!showInput) {
        setShowInput(true);
        return;
      }
      if (!tweetUrl.trim()) return;
      onClaim(quest.slug, tweetUrl.trim());
    } else {
      onClaim(quest.slug);
    }
  };

  return (
    <div className={`relative bg-provn-surface border rounded-xl p-5 transition-all ${
      isCompleted
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-provn-border hover:border-provn-muted/30'
    }`}>
      {/* Status badge */}
      <div className="absolute top-3 right-3">
        {isCompleted ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> Done
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-provn-border/40 text-provn-muted">
            <Clock className="w-3 h-3" /> Pending
          </span>
        )}
      </div>

      {/* Icon + Title */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isCompleted ? 'bg-emerald-500/15 text-emerald-400' : 'bg-provn-bg text-provn-muted'
        }`}>
          <QuestIcon icon={quest.icon} />
        </div>
        <div className="min-w-0 pr-16">
          <h3 className="font-semibold text-sm">{quest.title}</h3>
          <p className="text-xs text-provn-muted mt-0.5">{quest.description}</p>

          {/* External action link */}
          {link && !isCompleted && (
            <a
              href={link.href(wallet)}
              target={link.href(wallet).startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-400 hover:text-emerald-300"
            >
              <ExternalLink className="w-3 h-3" /> {link.label}
            </a>
          )}
        </div>
      </div>

      {/* Tweet URL input for X quests */}
      {needsTweetUrl && !isCompleted && showInput && (
        <div className="mb-3 space-y-2">
          <div className="text-[11px] text-provn-muted">
            Your tweet must include your wallet address:{' '}
            <code className="text-emerald-400 text-[10px]">{wallet.slice(0, 10)}…{wallet.slice(-6)}</code>
          </div>
          <input
            type="text"
            value={tweetUrl}
            onChange={(e) => setTweetUrl(e.target.value)}
            placeholder="https://x.com/yourhandle/status/123..."
            className="w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-xs focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
      )}

      {/* Reward + Action */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-provn-border/50">
        <div className="flex items-center gap-2">
          <SeedsBadge amount={quest.seeds_reward} />
          {quest.repeatable && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400">
              Repeatable
            </span>
          )}
        </div>

        {!isCompleted && (
          <button
            onClick={handleClaimClick}
            disabled={claiming || (needsTweetUrl && showInput && !tweetUrl.trim())}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {claiming ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Verifying</>
            ) : needsTweetUrl && !showInput ? (
              <>Submit tweet <ArrowRight className="w-3 h-3" /></>
            ) : (
              <>Claim <ArrowRight className="w-3 h-3" /></>
            )}
          </button>
        )}

        {isCompleted && quest.repeatable && (
          <button
            onClick={handleClaimClick}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
          >
            Claim Again <ArrowRight className="w-3 h-3" />
          </button>
        )}

        {isCompleted && !quest.repeatable && quest.totalEarned != null && quest.totalEarned > 0 && (
          <span className="text-xs text-provn-muted">
            +{quest.totalEarned} Seeds earned
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Quest Dashboard ─────────────────────────────────────────────────────────
function QuestDashboard({ wallet }: { wallet: string }) {
  const [progress, setProgress] = useState<QuestProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.quests.me(wallet);
      setProgress(data);
    } catch (err) {
      console.error('Failed to load quest progress:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { loadProgress(); }, [loadProgress]);

  const handleClaim = async (slug: string, tweetUrl?: string) => {
    setClaiming(slug);
    try {
      const result = await api.quests.claim(slug, wallet, tweetUrl);
      if ((result as { status?: string }).status === 'VERIFIED') {
        window.alert('✅ Quest verified and Seeds awarded!');
      }
      setTimeout(() => loadProgress(), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Claim failed';
      console.error('Claim failed:', err);
      window.alert(`❌ ${msg}`);
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!progress || !progress.registered) {
    return <p className="text-center text-provn-muted mt-20">Not registered for quests.</p>;
  }

  const completedPct = progress.questsTotal
    ? Math.round(((progress.questsCompleted || 0) / progress.questsTotal) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sprout className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">{(progress.totalSeeds || 0).toLocaleString()}</p>
          <p className="text-[10px] text-provn-muted uppercase tracking-wider mt-0.5">Total Seeds</p>
        </div>
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-2xl font-bold">
            {progress.questsCompleted || 0}<span className="text-provn-muted text-lg">/{progress.questsTotal || 0}</span>
          </p>
          <p className="text-[10px] text-provn-muted uppercase tracking-wider mt-0.5">Quests Completed</p>
        </div>
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4">
          <p className="text-xs text-provn-muted mb-2 text-center">Progress</p>
          <div className="w-full bg-provn-bg rounded-full h-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${completedPct}%` }}
            />
          </div>
          <p className="text-center text-sm font-bold mt-1.5">{completedPct}%</p>
        </div>
      </div>

      {/* On-chain indicator */}
      <div className="px-4 py-3 bg-emerald-500/5 border border-emerald-500/15 rounded-lg space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-xs text-provn-muted">
            Seeds are minted on-chain on <span className="text-emerald-400 font-medium">VARA Network</span>. Every quest completion creates a blockchain transaction.
          </p>
        </div>
        <p className="text-[10px] text-provn-muted pl-4">
          💡 Seeds are minted server-side to your wallet — no signature required. Click "View On-Chain" in Recent Activity to see proof on VARA Idea portal.
        </p>
      </div>

      {/* Quest Cards */}
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <Sprout className="w-5 h-5 text-emerald-400" /> Quests
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(progress.quests || []).map(quest => (
            <QuestCard
              key={quest.slug}
              quest={quest}
              wallet={wallet}
              onClaim={handleClaim}
              claiming={claiming === quest.slug}
            />
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      {progress.recentActivity && progress.recentActivity.length > 0 && (
        <div className="bg-provn-surface border border-provn-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-provn-border">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-provn-muted" /> Recent Activity
            </h3>
          </div>
          <div className="divide-y divide-provn-border/50">
            {progress.recentActivity.map(activity => (
              <div key={activity.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Sprout className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium text-emerald-400">+{activity.delta} Seeds</span>
                    {' — '}
                    <span className="text-provn-muted">{activity.quest_title || activity.reason}</span>
                  </p>
                  <p className="text-[10px] text-provn-muted mt-0.5">
                    {new Date(activity.created_at).toLocaleString()}
                  </p>
                </div>
                {activity.tx_hash ? (
                  <a
                    href={`https://idea.gear-tech.io/programs/0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241?node=wss://testnet.vara.network`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex-shrink-0"
                    title="View on VARA Idea portal"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>View On-Chain</span>
                  </a>
                ) : (
                  <span className="text-[10px] text-provn-muted/50 flex-shrink-0">DB only</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function QuestsPage() {
  const { account } = useAccount();
  const wallet = account?.decodedAddress || '';

  const [step, setStep] = useState<'invite' | 'register' | 'dashboard'>('invite');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(true);

  // Check if user is already registered
  useEffect(() => {
    if (!wallet) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await api.quests.me(wallet);
        if (data.registered) {
          setStep('dashboard');
        }
      } catch {
        // Not registered
      } finally {
        setLoading(false);
      }
    })();
  }, [wallet]);

  if (!wallet) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <Lock className="w-12 h-12 text-provn-muted mx-auto" />
        <h1 className="text-xl font-bold">Connect Your Wallet</h1>
        <p className="text-provn-muted text-sm">
          Connect your VARA wallet to access GrowStreams Quests.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (step === 'invite') {
    return (
      <InviteGate
        onVerified={(verifiedCode: string) => {
          setInviteCode(verifiedCode);
          setStep('register');
        }}
      />
    );
  }

  if (step === 'register') {
    return (
      <RegistrationForm
        wallet={wallet}
        inviteCode={inviteCode}
        onRegistered={() => setStep('dashboard')}
      />
    );
  }

  return <QuestDashboard wallet={wallet} />;
}

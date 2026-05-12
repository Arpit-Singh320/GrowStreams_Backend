'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api, QuestData, QuestProgress } from '@/lib/growstreams-api';
import { useSearchParams } from 'next/navigation';
import {
  Sprout, Lock, CheckCircle2, Loader2, ArrowRight, Mail,
  Twitter, Users, Waves, Star, GitPullRequest,
  Megaphone, Clock, ExternalLink, Sparkles, Trophy, Gift, Pencil, Check, X as XIcon,
  Eye, Heart,
} from 'lucide-react';

const QUEST_ICONS: Record<string, React.ElementType> = {
  twitter: Twitter,
  megaphone: Megaphone,
  star: Star,
  'git-pull-request': GitPullRequest,
  waves: Waves,
  gift: Gift,
};

// External action links per quest slug (kept only for non-X quests)
const GROWSTREAMS_X_URL = 'https://x.com/growwstreams';
const GINIE_X_URL = 'https://x.com/giniedev';
const GROWSTREAMS_REPO_URL = 'https://github.com/BlockX-AI/GrowStreams_Backend';

// X handle per quest slug (used for the "Open @handle" reference link)
const X_HANDLE_BY_SLUG: Record<string, { url: string; handle: string }> = {
  'follow-x':         { url: GROWSTREAMS_X_URL, handle: '@growwstreams' },
  'mention-x':        { url: GROWSTREAMS_X_URL, handle: '@growwstreams' },
  'follow-x-ginie':   { url: GINIE_X_URL,       handle: '@giniedev' },
  'mention-x-ginie':  { url: GINIE_X_URL,       handle: '@giniedev' },
};

const QUEST_LINKS: Record<string, { label: string; href: (wallet: string) => string }> = {
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

function XpBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400">
      <Sprout className="w-3 h-3" />
      {amount} XP
    </span>
  );
}

// ─── Registration Form (3-step: email → OTP → name) ─────────────────────────
function RegistrationForm({ wallet, onRegistered }: { wallet: string; onRegistered: () => void }) {
  const searchParams = useSearchParams();
  const refCode = searchParams.get('ref') || undefined;

  // step: 'email' | 'otp' | 'name'
  const [step, setStep]             = useState<'email' | 'otp' | 'name'>('email');
  const [email, setEmail]           = useState('');
  const [otp, setOtp]               = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSendOtp = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    setLoading(true); setError('');
    try {
      await api.quests.sendOtp(email.trim().toLowerCase());
      setStep('otp');
      setResendCooldown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) { setError('Enter the 6-digit code'); return; }
    setLoading(true); setError('');
    try {
      await api.quests.verifyOtp(email.trim().toLowerCase(), otp.trim());
      setStep('name');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!displayName.trim()) { setError('Display name is required'); return; }
    setLoading(true); setError('');
    try {
      await api.quests.register({
        wallet,
        email: email.trim(),
        display_name: displayName.trim(),
        ref_code: refCode,
      });
      onRegistered();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto mt-12 space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
          <Sparkles className="w-6 h-6 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold">Join GrowStreams Earn</h2>
        <p className="text-provn-muted text-sm">
          {step === 'email' && 'Enter your email to receive a verification code'}
          {step === 'otp'   && `Enter the 6-digit code sent to ${email}`}
          {step === 'name'  && 'Almost there — choose your display name'}
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2">
        {(['email','otp','name'] as const).map((s, i) => (
          <div key={s} className={`w-2 h-2 rounded-full transition-colors ${step === s ? 'bg-emerald-400' : i < ['email','otp','name'].indexOf(step) ? 'bg-emerald-700' : 'bg-provn-border'}`} />
        ))}
      </div>

      <div className="bg-provn-surface border border-provn-border rounded-xl p-5 space-y-4">
        {/* Step 1 — Email */}
        {step === 'email' && (
          <>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-provn-muted mb-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                placeholder="you@gmail.com"
                className="w-full bg-provn-bg border border-provn-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/40"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleSendOtp} disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send Verification Code
            </button>
          </>
        )}

        {/* Step 2 — OTP */}
        {step === 'otp' && (
          <>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-provn-muted mb-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                placeholder="123456"
                className="w-full bg-provn-bg border border-provn-border rounded-lg px-3 py-2.5 text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/40"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Verify Code
            </button>
            <button onClick={() => { setStep('email'); setOtp(''); setError(''); }}
              className="w-full text-xs text-provn-muted hover:text-provn-text transition-colors py-1">
              ← Change email
            </button>
            {resendCooldown > 0 ? (
              <p className="text-center text-xs text-provn-muted">Resend in {resendCooldown}s</p>
            ) : (
              <button onClick={handleSendOtp} disabled={loading}
                className="w-full text-xs text-emerald-400 hover:text-emerald-300 transition-colors py-1">
                Resend code
              </button>
            )}
          </>
        )}

        {/* Step 3 — Display Name */}
        {step === 'name' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              <Check className="w-3.5 h-3.5" /> Email verified: <span className="font-medium">{email}</span>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-provn-muted mb-1.5">
                <Sprout className="w-3.5 h-3.5" /> Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
                placeholder="Your name on the leaderboard"
                className="w-full bg-provn-bg border border-provn-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/40"
              />
            </div>
            {refCode && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                <Users className="w-3.5 h-3.5" />
                Referral code applied: <span className="font-mono font-bold">{refCode}</span>
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleRegister} disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
              Register & Start Earning
            </button>
          </>
        )}
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
  onClaim: (slug: string, payload?: { x_username?: string; tweet_url?: string }) => void;
  claiming: boolean;
}) {
  const isCompleted = quest.completed;
  const isPending = !!quest.pendingSubmission;
  const isRejected = !!quest.rejectedSubmission;
  const isWelcome = quest.quest_type === 'WELCOME';
  const isFollowX = quest.quest_type === 'X_FOLLOW';
  const isMentionX = quest.quest_type === 'X_MENTION';
  const isRetweet = quest.quest_type === 'X_RETWEET';
  const isTweetKeyword = quest.quest_type === 'X_TWEET_KEYWORD';
  const needsManualInput = isFollowX || isMentionX || isRetweet || isTweetKeyword;
  const needsTweetUrl = isMentionX || isRetweet || isTweetKeyword;
  const xRef = X_HANDLE_BY_SLUG[quest.slug];
  const [xUsername, setXUsername] = useState('');
  const [tweetUrl, setTweetUrl] = useState('');
  const questMeta = (quest.meta || {}) as Record<string, unknown>;
  const inputLabel = (questMeta.input_label as string) || (isFollowX ? 'Your X username' : 'Tweet URL');
  const inputPlaceholder = (questMeta.input_placeholder as string) || (isFollowX ? '@yourhandle' : 'https://x.com/yourhandle/status/123...');
  const link = QUEST_LINKS[quest.slug];

  const inputValue = isFollowX ? xUsername : tweetUrl;
  const inputValid = needsManualInput
    ? (isFollowX ? xUsername.trim().length > 0 : /^https?:\/\/(x\.com|twitter\.com)\//i.test(tweetUrl.trim()))
    : true;

  const handleClaimClick = () => {
    if (isFollowX) {
      if (!xUsername.trim()) return;
      onClaim(quest.slug, { x_username: xUsername.trim().replace(/^@/, '') });
    } else if (needsTweetUrl) {
      if (!tweetUrl.trim()) return;
      onClaim(quest.slug, { tweet_url: tweetUrl.trim() });
    } else {
      onClaim(quest.slug);
    }
  };

  const renderStatusBadge = () => {
    if (isCompleted) {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" /> Done
        </span>
      );
    }
    if (isPending) {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400">
          <Clock className="w-3 h-3" /> Under review
        </span>
      );
    }
    if (isRejected) {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400">
          Rejected — resubmit
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-provn-border/40 text-provn-muted">
        <Clock className="w-3 h-3" /> Pending
      </span>
    );
  };

  return (
    <div className={`relative bg-provn-surface border rounded-xl p-5 transition-all ${
      isCompleted
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : isPending
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'border-provn-border hover:border-provn-muted/30'
    }`}>
      {/* Status badge */}
      <div className="absolute top-3 right-3">{renderStatusBadge()}</div>

      {/* Icon + Title */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isCompleted ? 'bg-emerald-500/15 text-emerald-400' : 'bg-provn-bg text-provn-muted'
        }`}>
          <QuestIcon icon={quest.icon} />
        </div>
        <div className="min-w-0 pr-20">
          <h3 className="font-semibold text-sm">{quest.title}</h3>
          <p className="text-xs text-provn-muted mt-0.5">{quest.description}</p>

          {/* X quest reference link (read-only nav helper) */}
          {(isFollowX || isMentionX) && xRef && !isCompleted && (
            <a
              href={xRef.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-400 hover:text-emerald-300"
            >
              <ExternalLink className="w-3 h-3" /> Open {xRef.handle}
            </a>
          )}

          {/* Generic external link for other quest types */}
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

      {/* Manual review submission input */}
      {needsManualInput && !isCompleted && !isPending && (
        <div className="mb-3 space-y-2">
          {isMentionX && (
            <div className="text-[11px] text-provn-muted">
              Tweet must mention{' '}
              <span className="text-emerald-400">{(questMeta.required_mention as string) || xRef?.handle || '@GrowStreams'}</span>
              {' '}+ include your wallet:{' '}
              <code className="text-emerald-400 text-[10px]">{wallet.slice(0, 10)}…{wallet.slice(-6)}</code>
            </div>
          )}
          {isRetweet && (
            <div className="text-[11px] text-provn-muted">
              {(questMeta.original_tweet_url as string)
                ? <> Retweet <a href={questMeta.original_tweet_url as string} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">this post</a>, then paste the URL of your retweet below. </>
                : <>Retweet the campaign post, then paste the URL of <span className="text-emerald-400">your retweet</span> below.</>}
            </div>
          )}
          {isTweetKeyword && (
            <div className="text-[11px] text-provn-muted">
              Tweet must mention{' '}
              <span className="text-emerald-400">{(questMeta.required_mention as string) || '@GrowStreams'}</span>
              {(questMeta.required_keyword as string) && <> and include the word{' '}<span className="text-emerald-400 font-mono">&quot;{questMeta.required_keyword as string}&quot;</span></>}.
              {' '}Paste your tweet URL below.
            </div>
          )}
          <label className="text-[11px] font-medium text-provn-muted">{inputLabel}</label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => isFollowX ? setXUsername(e.target.value) : setTweetUrl(e.target.value)}
            placeholder={inputPlaceholder}
            className="w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-xs focus:border-emerald-500/50 focus:outline-none"
          />
          {isRejected && quest.rejectedSubmission?.proof && (quest.rejectedSubmission.proof as { reject_reason?: string }).reject_reason && (
            <p className="text-[11px] text-red-400">
              Previous submission rejected: {(quest.rejectedSubmission.proof as { reject_reason?: string }).reject_reason}
            </p>
          )}
        </div>
      )}

      {/* Pending submission preview */}
      {isPending && quest.pendingSubmission && (
        <div className="mb-3 px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-1">
          <p className="text-[11px] text-amber-400 font-medium">Awaiting admin review</p>
          {(quest.pendingSubmission.proof as { x_username?: string; tweet_url?: string })?.x_username && (
            <p className="text-[11px] text-provn-muted">
              X username: <span className="text-emerald-400">@{(quest.pendingSubmission.proof as { x_username?: string }).x_username}</span>
            </p>
          )}
          {(quest.pendingSubmission.proof as { tweet_url?: string })?.tweet_url && (
            <p className="text-[11px] text-provn-muted truncate">
              Tweet:{' '}
              <a
                href={(quest.pendingSubmission.proof as { tweet_url?: string }).tweet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 underline"
              >
                {(quest.pendingSubmission.proof as { tweet_url?: string }).tweet_url}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Reward + Action */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-provn-border/50">
        <div className="flex items-center gap-2">
          <XpBadge amount={quest.seeds_reward} />
          {quest.repeatable && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400">
              Repeatable
            </span>
          )}
        </div>

        {!isCompleted && !isPending && !isWelcome && (
          <button
            onClick={handleClaimClick}
            disabled={claiming || (needsManualInput && !inputValid)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {claiming ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Submitting</>
            ) : needsManualInput ? (
              <>Submit <ArrowRight className="w-3 h-3" /></>
            ) : (
              <>Claim <ArrowRight className="w-3 h-3" /></>
            )}
          </button>
        )}

        {!isCompleted && isWelcome && (
          <span className="text-xs text-provn-muted">Auto-awarded on join</span>
        )}

        {isPending && (
          <span className="text-xs text-amber-400">Awaiting review</span>
        )}

        {isCompleted && (
          <span className="text-xs text-provn-muted">
            {quest.repeatable ? 'Resets Monday 00:00 UTC' : 'One-time reward'}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Edit Name Widget ───────────────────────────────────────────────────────
function EditNameWidget({ wallet, currentName, onSaved }: { wallet: string; currentName: string; onSaved: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.quests.updateProfile(wallet, value.trim());
      onSaved(value.trim());
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{currentName || 'Set your display name'}</span>
        <button
          onClick={() => { setValue(currentName); setEditing(true); }}
          className="p-1 rounded hover:bg-provn-border/40 text-provn-muted hover:text-white transition-colors"
          title="Edit display name"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          className="bg-provn-bg border border-emerald-500/40 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500/70 w-48"
          placeholder="Your display name"
        />
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="p-1.5 rounded hover:bg-provn-border/40 text-provn-muted transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

// ─── Quest Dashboard ─────────────────────────────────────────────────────────
function QuestDashboard({ wallet }: { wallet: string }) {
  const [progress, setProgress] = useState<QuestProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [campaigns, setCampaigns] = useState<Array<any>>([]);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    try {
      const [data, camps] = await Promise.all([api.quests.me(wallet), api.quests.questCampaigns()]);
      setProgress(data);
      setCampaigns((camps && camps.campaigns) || []);
      const reg = data.registration as Record<string, unknown> | undefined;
      setDisplayName((reg?.display_name as string) || '');
    } catch (err) {
      console.error('Failed to load quest progress:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { loadProgress(); }, [loadProgress]);

  const handleClaim = async (slug: string, payload?: { x_username?: string; tweet_url?: string }) => {
    setClaiming(slug);
    try {
      const result = await api.quests.claim(slug, wallet, payload);
      const status = (result as { status?: string }).status;
      if (status === 'VERIFIED') {
        window.alert('✅ Quest verified and XP awarded!');
      } else if (status === 'PENDING_REVIEW') {
        window.alert('📝 Submitted! An admin will review your proof and award XP shortly.');
      }
      setTimeout(() => loadProgress(), 1500);
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
    <div className="max-w-7xl mx-auto space-y-6 px-4 md:px-0">
      {/* Profile header */}
      <div className="flex items-center justify-between">
        <EditNameWidget
          wallet={wallet}
          currentName={displayName}
          onSaved={(name) => setDisplayName(name)}
        />
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sprout className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">{(progress.totalSeeds || 0).toLocaleString()}</p>
          <p className="text-[10px] text-provn-muted uppercase tracking-wider mt-0.5">Total XP</p>
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
            XP is minted on-chain on <span className="text-emerald-400 font-medium">VARA Network</span>. Every approved quest creates a blockchain transaction.
          </p>
        </div>
        <p className="text-[10px] text-provn-muted pl-4">
          💡 XP is minted server-side to your wallet — no signature required. Click "View On-Chain" in Recent Activity to see proof on VARA Idea portal.
        </p>
      </div>

      {/* Projects / Campaigns */}
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <Sprout className="w-5 h-5 text-emerald-400" /> Projects
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {campaigns.map((camp: any) => {
            const rewardText = camp.reward_summary || (camp.total_seeds_pool ? `${camp.total_seeds_pool} Seeds` : null);
            return (
              <div key={camp.slug} className="relative bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-5 hover:shadow-2xl transition-shadow">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  {camp.status === 'ACTIVE' && <span className="text-[10px] px-2 py-1 rounded-md bg-slate-800 text-slate-200">ACTIVE</span>}
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] px-2 py-1 rounded bg-slate-800 text-slate-200">CAMPAIGN</span>
                      <span className="text-[11px] px-2 py-1 rounded bg-slate-800 text-slate-200">{(camp.difficulty || 'EASY').toUpperCase()}</span>
                    </div>
                    {/* Logo circle + title */}
                    <div className="flex items-center gap-3 mb-1">
                      {camp.meta?.logo_url ? (
                        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-slate-700 flex-shrink-0 bg-black/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={camp.meta.logo_url} alt={camp.title} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center flex-shrink-0 text-slate-400 font-bold text-sm">
                          {camp.title?.[0] || 'P'}
                        </div>
                      )}
                      <h3 className="font-semibold text-white text-lg truncate">{camp.title}</h3>
                    </div>

                    {rewardText && (
                      <div className="mt-3 p-2.5 rounded-md border border-emerald-700 bg-emerald-900/30 text-emerald-100 w-full">
                        <div className="text-[10px] text-emerald-200 uppercase tracking-wider font-semibold">REWARD</div>
                        <div className="text-sm font-mono font-semibold mt-1">{rewardText}</div>
                      </div>
                    )}

                    <p className="text-sm text-provn-muted mt-3 line-clamp-3">{camp.description}</p>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-provn-muted text-sm">
                        <div className="flex items-center gap-1.5"><Eye className="w-4 h-4" /> <span>{(camp.views || 0).toLocaleString()}</span></div>
                        <div className="flex items-center gap-1.5"><Heart className="w-4 h-4 text-rose-400" /> <span className="text-rose-200">{(camp.likes || 0).toLocaleString()}</span></div>
                        <div className="flex items-center gap-1.5"><Sprout className="w-3.5 h-3.5 text-emerald-400" /> <span>{camp.quest_count || 0}</span></div>
                      </div>
                      <a href={`/app/campaign/${camp.slug}`}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-300 text-black font-semibold shadow-md hover:bg-yellow-200 transition-colors">
                        JOIN <ArrowRight className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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

  const [step, setStep] = useState<'register' | 'dashboard'>('register');
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
        // Not registered — stay on register step
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

  if (step === 'register') {
    return (
      <RegistrationForm
        wallet={wallet}
        onRegistered={() => setStep('dashboard')}
      />
    );
  }

  return <QuestDashboard wallet={wallet} />;
}

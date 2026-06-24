'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, QuestSubmission } from '@/lib/growstreams-api';
import {
  Shield, Loader2, CheckCircle2, XCircle, ExternalLink,
  Twitter, RefreshCw, Lock, LogOut, Sprout, Plus, FolderOpen,
  ChevronDown, Link as LinkIcon, Star, GitPullRequest, Waves,
  Megaphone, Gift, Trophy, Send, Image as ImageIcon, Pencil,
  Trash2, BarChart2, Users, TrendingUp, Activity,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────
const QUEST_TYPES = [
  { value: 'X_FOLLOW',        label: 'X — Follow Account',          icon: '𝕏', hint: 'User submits their @handle' },
  { value: 'X_MENTION',       label: 'X — Mention / Tweet',         icon: '𝕏', hint: 'User submits tweet URL' },
  { value: 'X_RETWEET',       label: 'X — Retweet Post',            icon: '𝕏', hint: 'User submits retweet URL' },
  { value: 'X_TWEET_KEYWORD', label: 'X — Tweet with Keyword',      icon: '𝕏', hint: 'User submits tweet URL, admin checks keyword+mention' },
  { value: 'GITHUB_STAR',     label: 'GitHub — Star Repo',          icon: '⭐', hint: 'Auto-verified via GitHub API' },
  { value: 'GITHUB_PR',       label: 'GitHub — Open Pull Request',  icon: '🔀', hint: 'Auto-verified via GitHub API' },
  { value: 'ONCHAIN_STREAM',  label: 'On-chain — Create Stream',    icon: '⛓', hint: 'Auto-verified via VARA event' },
  { value: 'VISIT_URL',       label: 'Visit URL',                   icon: '🔗', hint: 'Auto-claimed, no proof needed' },
  { value: 'TELEGRAM_JOIN',   label: 'Telegram — Join Group',       icon: '✈️', hint: 'Auto-claimed, no proof needed' },
  { value: 'REFERRAL',        label: 'Referral',                    icon: '👥', hint: 'Auto-triggered on registration' },
  { value: 'WELCOME',         label: 'Welcome Bonus',               icon: '🎁', hint: 'One-time, auto-awarded on join' },
  { value: 'PARTNER_CONTRACT', label: 'Partner — Deploy Contract',    icon: '📄', hint: 'User pastes their Party ID + Contract ID from a partner platform (e.g. Canton/Ginie). Admin verifies on-chain.' },
  { value: 'IMAGE_UPLOAD',     label: 'Image Upload — Screenshot Proof', icon: '🖼️', hint: 'User uploads a screenshot as proof. Admin reviews the image and approves manually.' },
  { value: 'PROJECT_SUBMIT',  label: 'Project Submit — URL Review',     icon: '🔗', hint: 'User submits a project URL. Admin reviews and approves manually.' },
];

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const STATUSES     = ['ACTIVE', 'PAUSED', 'ENDED'];

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const TOKEN_STORAGE_KEY = 'growstreams_admin_token';

// ─── Token Gate ─────────────────────────────────────────────────────────────
function AdminGate({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Verify by hitting an admin endpoint
      await api.quests.adminStats(token.trim());
      localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
      onAuthed(token.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 text-center space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
        <Shield className="w-8 h-8 text-emerald-400" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">Admin: Earn Review</h1>
        <p className="text-provn-muted text-sm mt-2">
          Enter your admin token to review pending earn submissions.
        </p>
      </div>
      <div className="space-y-3">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Admin token"
          className="w-full bg-provn-surface border border-provn-border rounded-lg px-4 py-3 text-center font-mono focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/40"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading || !token.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          Authenticate
        </button>
      </div>
    </div>
  );
}

// ─── Submission Row ─────────────────────────────────────────────────────────
function SubmissionRow({
  submission,
  token,
  onAction,
}: {
  submission: QuestSubmission;
  token: string;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [error, setError] = useState('');

  const proof = (submission.proof || {}) as { x_username?: string; tweet_url?: string; party_id?: string; contract_id?: string; partner_url?: string; image_data?: string; project_url?: string };
  const isFollow = submission.quest_slug === 'follow-x';
  const isPartnerContract = submission.quest_slug?.startsWith('partner-') || (submission as any).quest_type === 'PARTNER_CONTRACT';
  const isImageUpload = (submission as any).quest_type === 'IMAGE_UPLOAD';
  const isProjectSubmit = (submission as any).quest_type === 'PROJECT_SUBMIT';

  const handleApprove = async () => {
    if (busy) return;
    setBusy('approve');
    setError('');
    try {
      await api.quests.adminApproveSubmission(token, submission.id);
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (busy) return;
    setBusy('reject');
    setError('');
    try {
      await api.quests.adminRejectSubmission(token, submission.id, rejectReason);
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-provn-surface border border-provn-border rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Twitter className="w-4 h-4 text-emerald-400" />
            {submission.quest_title}
            <span className="text-[10px] font-normal text-provn-muted">
              · #{submission.id} · {new Date(submission.created_at).toLocaleString()}
            </span>
          </h3>
          <p className="text-xs text-provn-muted mt-1">
            Reward: <span className="text-emerald-400 font-medium">{submission.seeds_reward} XP</span>
          </p>
        </div>
      </div>

      {/* User info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-provn-bg/40 rounded-lg p-3 border border-provn-border/50">
        <div>
          <p className="text-provn-muted">Wallet</p>
          <p className="font-mono break-all text-[11px]">{submission.wallet}</p>
        </div>
        <div>
          <p className="text-provn-muted">Email</p>
          <p>{submission.email || '—'}</p>
        </div>
        <div>
          <p className="text-provn-muted">Registered X</p>
          <p>@{submission.x_username || '—'}</p>
        </div>
        <div>
          <p className="text-provn-muted">GitHub</p>
          <p>{submission.github_username || '—'}</p>
        </div>
      </div>

      {/* Submitted proof */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-emerald-400 font-medium">Submitted proof</p>
        {isFollow && proof.x_username && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-provn-muted">Claims to follow @growwstreams as:</span>
            <a
              href={`https://x.com/${proof.x_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 font-medium"
            >
              @{proof.x_username} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
        {isPartnerContract && (
          <div className="space-y-2 text-sm">
            {proof.party_id && (
              <div className="flex items-center gap-2">
                <span className="text-provn-muted w-24 flex-shrink-0">Party ID:</span>
                <code className="text-emerald-400 font-mono text-xs break-all">{proof.party_id}</code>
              </div>
            )}
            {proof.contract_id && (
              <div className="flex items-center gap-2">
                <span className="text-provn-muted w-24 flex-shrink-0">Contract ID:</span>
                <code className="text-emerald-400 font-mono text-xs break-all">{proof.contract_id}</code>
              </div>
            )}
            {proof.partner_url && (
              <a
                href={proof.partner_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
              >
                <ExternalLink className="w-3 h-3" /> Verify on partner platform
              </a>
            )}
            {(!proof.party_id && !proof.contract_id) && (
              <p className="text-provn-muted text-xs">No party/contract ID submitted.</p>
            )}
          </div>
        )}
        {isImageUpload && (
          <div className="space-y-2">
            {proof.image_data ? (
              <img
                src={proof.image_data}
                alt="Submitted proof"
                className="max-h-64 rounded-lg border border-emerald-500/20 object-contain"
              />
            ) : (
              <p className="text-provn-muted text-xs">No image submitted.</p>
            )}
          </div>
        )}
        {isProjectSubmit && (
          <div className="space-y-1 text-sm">
            {proof.project_url ? (
              <div className="flex items-center gap-2">
                <span className="text-provn-muted w-24 flex-shrink-0">Project URL:</span>
                <a
                  href={proof.project_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 break-all font-mono text-xs"
                >
                  {proof.project_url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </div>
            ) : (
              <p className="text-provn-muted text-xs">No project URL submitted.</p>
            )}
          </div>
        )}
        {!isFollow && !isPartnerContract && !isImageUpload && !isProjectSubmit && proof.tweet_url && (
          <div className="flex items-start gap-2 text-sm">
            <span className="text-provn-muted">Tweet URL:</span>
            <a
              href={proof.tweet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 break-all"
            >
              {proof.tweet_url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {showRejectInput && (
        <input
          type="text"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Rejection reason (optional)"
          className="w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-xs focus:border-red-500/50 focus:outline-none"
        />
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleApprove}
          disabled={!!busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          {busy === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Approve & Mint XP
        </button>
        {!showRejectInput ? (
          <button
            onClick={() => setShowRejectInput(true)}
            disabled={!!busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-3 h-3" />
            Reject
          </button>
        ) : (
          <>
            <button
              onClick={handleReject}
              disabled={!!busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50"
            >
              {busy === 'reject' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              Confirm reject
            </button>
            <button
              onClick={() => { setShowRejectInput(false); setRejectReason(''); }}
              className="text-xs text-provn-muted hover:text-provn-text"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shared input style ──────────────────────────────────────────────────────
const inp = 'w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none placeholder:text-provn-muted/50';
const sel = `${inp} appearance-none cursor-pointer`;

// ─── Per-type meta field definitions ─────────────────────────────────────────
type MetaField = {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  type?: 'text' | 'url' | 'number';
};

const META_FIELDS: Record<string, MetaField[]> = {
  X_FOLLOW: [
    { key: 'target_handle', label: 'X Handle to Follow', placeholder: 'growstreams', hint: 'Without the @ sign. Backend auto-checks follower list.' },
  ],
  X_MENTION: [
    { key: 'required_mention', label: 'Handle they must @mention', placeholder: '@GrowStreams', hint: 'User must include this in their tweet.' },
  ],
  X_RETWEET: [
    { key: 'original_tweet_url', label: 'Original Tweet URL to Retweet', placeholder: 'https://x.com/GrowwStreams/status/...', type: 'url', hint: 'Users will retweet this exact post.' },
  ],
  X_TWEET_KEYWORD: [
    { key: 'required_keyword', label: 'Required Keyword in Tweet', placeholder: 'build', hint: 'Tweet must contain this word (case-insensitive).' },
    { key: 'required_mention', label: 'Required @Mention in Tweet', placeholder: '@GrowStreams', hint: 'Tweet must also mention this handle.' },
  ],
  GITHUB_STAR: [
    { key: 'repo', label: 'GitHub Repo to Star', placeholder: 'BlockXAI/GrowStreams_Backend', hint: 'Format: owner/repo-name. Backend verifies via GitHub API.' },
  ],
  GITHUB_PR: [
    { key: 'repo', label: 'GitHub Repo for Pull Request', placeholder: 'BlockXAI/GrowStreams_Backend', hint: 'User must open a PR on this repo.' },
  ],
  VISIT_URL: [
    { key: 'url', label: 'URL for User to Visit', placeholder: 'https://growstreams.xyz', type: 'url', hint: 'Link shown to the user. Quest auto-claims when they click.' },
  ],
  TELEGRAM_JOIN: [
    { key: 'invite_url', label: 'Telegram Group Invite Link', placeholder: 'https://t.me/+...', type: 'url', hint: 'User taps this link. Quest auto-claims immediately.' },
  ],
  ONCHAIN_STREAM: [
    { key: 'min_flow_rate', label: 'Minimum Flow Rate (tokens/sec)', placeholder: '1', type: 'number', hint: 'Backend checks the stream contract for this minimum.' },
  ],
  REFERRAL: [],
  WELCOME: [],
  PARTNER_CONTRACT: [
    { key: 'partner_name',      label: 'Partner Name',          placeholder: 'Ginie / Canton', hint: 'Shown on the quest card so users know which platform to use.' },
    { key: 'partner_url',       label: 'Partner Platform URL',  placeholder: 'https://canton.ginie.xyz', type: 'url' as const, hint: 'Users visit this to create their contract.' },
    { key: 'contract_type',     label: 'Expected Contract Type',placeholder: 'e.g. Stream, Escrow, Any', hint: 'Optional — shown to user as guidance.' },
  ],
  IMAGE_UPLOAD: [
    { key: 'instructions', label: 'Upload Instructions', placeholder: 'Take a screenshot of the app showing your completed action.', hint: 'Displayed to the user above the file picker on the quest card.' },
  ],
};

// ─── Meta Fields Builder component ───────────────────────────────────────────
function MetaFieldsBuilder({
  questType, metaValues, onChange,
}: {
  questType: string;
  metaValues: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const fields = META_FIELDS[questType] || [];

  if (fields.length === 0) {
    return (
      <div className="px-4 py-3 rounded-lg bg-provn-bg border border-provn-border/50 text-xs text-provn-muted">
        No configuration needed for this quest type — it runs automatically.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map(f => (
        <div key={f.key} className="space-y-1.5">
          <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">{f.label}</label>
          <input
            className={inp}
            type={f.type || 'text'}
            placeholder={f.placeholder}
            value={metaValues[f.key] || ''}
            onChange={e => onChange({ ...metaValues, [f.key]: e.target.value })}
          />
          {f.hint && <p className="text-[11px] text-provn-muted/70">{f.hint}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Create Quest Tab ────────────────────────────────────────────────────────
function CreateQuestTab({ token }: { token: string }) {
  const [campaigns, setCampaigns] = useState<Array<any>>([]);
  const [form, setForm] = useState({
    title: '', slug: '', description: '', quest_type: 'X_FOLLOW',
    seeds_reward: 100, icon: '', repeatable: false, active: true,
    sort_order: 99, campaign_slug: '',
  });
  const [metaValues, setMetaValues] = useState<Record<string, string>>({});
  const [userInputLabel, setUserInputLabel] = useState('');
  const [userInputPlaceholder, setUserInputPlaceholder] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [autoSlug, setAutoSlug] = useState(true);

  useEffect(() => {
    api.quests.adminListCampaigns(token).then(r => setCampaigns((r as any).campaigns || [])).catch(() => {});
  }, [token]);

  const selectedType = QUEST_TYPES.find(t => t.value === form.quest_type);

  const needsUserInput = ['X_FOLLOW', 'X_MENTION', 'X_RETWEET', 'X_TWEET_KEYWORD'].includes(form.quest_type);

  const set = (k: string, v: unknown) => setForm(f => {
    const next = { ...f, [k]: v };
    if (k === 'title' && autoSlug) (next as any).slug = slugify(String(v));
    return next;
  });

  const handleQuestTypeChange = (newType: string) => {
    set('quest_type', newType);
    setMetaValues({});
    setUserInputLabel('');
    setUserInputPlaceholder('');
  };

  const handleSubmit = async () => {
    setError(''); setSuccess('');
    const meta: Record<string, unknown> = {};
    const fields = META_FIELDS[form.quest_type] || [];
    for (const f of fields) {
      const val = (metaValues[f.key] || '').trim();
      if (val) meta[f.key] = f.type === 'number' ? Number(val) : val;
    }
    if (userInputLabel.trim()) meta.input_label = userInputLabel.trim();
    if (userInputPlaceholder.trim()) meta.input_placeholder = userInputPlaceholder.trim();

    setSaving(true);
    try {
      const res = await api.quests.adminUpsertQuest(token, {
        slug: form.slug, title: form.title, description: form.description,
        quest_type: form.quest_type, seeds_reward: Number(form.seeds_reward),
        icon: form.icon || null, repeatable: form.repeatable, active: form.active,
        sort_order: Number(form.sort_order), meta,
        campaign_slug: form.campaign_slug || null,
      });
      setSuccess(`✅ Quest "${(res as any).quest?.title}" saved!`);
      setForm(f => ({ ...f, title: '', slug: '', description: '', icon: '', campaign_slug: '' }));
      setMetaValues({});
      setUserInputLabel('');
      setUserInputPlaceholder('');
      setAutoSlug(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quest');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/15 rounded-lg">
        <Sprout className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        <p className="text-xs text-provn-muted">All approved quests mint XP on-chain via VARA Network automatically.</p>
      </div>

      {/* Quest type */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Quest Type *</label>
        <div className="relative">
          <select className={sel} value={form.quest_type} onChange={e => handleQuestTypeChange(e.target.value)}>
            {QUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 text-provn-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        {selectedType && <p className="text-[11px] text-emerald-400">{selectedType.hint}</p>}
      </div>

      {/* Project */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Assign to Project</label>
        <div className="relative">
          <select className={sel} value={form.campaign_slug} onChange={e => set('campaign_slug', e.target.value)}>
            <option value="">— No project (standalone quest) —</option>
            {campaigns.map((c: any) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 text-provn-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Title + Slug */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Title *</label>
          <input className={inp} placeholder="Follow @GrowStreams on X" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Slug *</label>
          <input className={inp} placeholder="follow-growstreams-x" value={form.slug}
            onChange={e => { setAutoSlug(false); set('slug', e.target.value); }} />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Description *</label>
        <textarea className={`${inp} h-20 resize-none`} placeholder="Describe what the user needs to do..."
          value={form.description} onChange={e => set('description', e.target.value)} />
      </div>

      {/* XP + Sort + Icon */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">XP Reward *</label>
          <input className={inp} type="number" min="0" placeholder="100" value={form.seeds_reward} onChange={e => set('seeds_reward', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Sort Order</label>
          <input className={inp} type="number" min="0" placeholder="99" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Icon name</label>
          <input className={inp} placeholder="twitter / star / waves" value={form.icon} onChange={e => set('icon', e.target.value)} />
        </div>
      </div>

      {/* ── Dynamic Meta Fields ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-provn-border bg-provn-bg/50 p-4 space-y-4">
        <p className="text-xs font-semibold text-provn-muted uppercase tracking-wider">Quest Configuration</p>
        <MetaFieldsBuilder
          questType={form.quest_type}
          metaValues={metaValues}
          onChange={setMetaValues}
        />

        {/* User input customisation — only for manual-input quest types */}
        {needsUserInput && (
          <div className="pt-3 border-t border-provn-border/50 space-y-3">
            <p className="text-xs font-semibold text-provn-muted uppercase tracking-wider">
              User Input Field
              <span className="ml-2 normal-case font-normal text-provn-muted/60">Customise the label &amp; placeholder the user sees when claiming</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Input Label</label>
                <input className={inp} placeholder="e.g. Your X username" value={userInputLabel}
                  onChange={e => setUserInputLabel(e.target.value)} />
                <p className="text-[11px] text-provn-muted/60">Shown above the input on the quest card</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Input Placeholder</label>
                <input className={inp} placeholder="e.g. @yourhandle" value={userInputPlaceholder}
                  onChange={e => setUserInputPlaceholder(e.target.value)} />
                <p className="text-[11px] text-provn-muted/60">Grey ghost text inside the input</p>
              </div>
            </div>
            {(userInputLabel || userInputPlaceholder) && (
              <div className="rounded-lg border border-provn-border bg-provn-surface p-3 space-y-1.5">
                <p className="text-[10px] text-provn-muted uppercase tracking-wider">Preview — what users see:</p>
                <p className="text-xs font-medium">{userInputLabel || 'Enter value'}</p>
                <div className="px-3 py-2 rounded bg-provn-bg border border-provn-border text-sm text-provn-muted/50">
                  {userInputPlaceholder || 'Type here…'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.repeatable} onChange={e => set('repeatable', e.target.checked)}
            className="w-4 h-4 accent-emerald-500" />
          <span className="text-sm">Weekly repeatable</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)}
            className="w-4 h-4 accent-emerald-500" />
          <span className="text-sm">Active (visible to users)</span>
        </label>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">{success}</p>}

      <button onClick={handleSubmit} disabled={saving || !form.title || !form.slug || !form.description}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Save Quest
      </button>
    </div>
  );
}

// ─── Manage Projects Tab ─────────────────────────────────────────────────────
function ManageProjectsTab({ token }: { token: string }) {
  const [campaigns, setCampaigns] = useState<Array<any>>([]);
  const [quests, setQuests] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [editingCamp, setEditingCamp] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const emptyForm = {
    slug: '', title: '', description: '', partner: '',
    banner_url: '', logo_url: '', reward_summary: '', difficulty: 'EASY',
    status: 'ACTIVE', bonus_xp: 0, sort_order: 0, meta: '{}',
  };
  const [form, setForm] = useState(emptyForm);
  const [autoSlug, setAutoSlug] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, qRes] = await Promise.all([
        api.quests.adminListCampaigns(token),
        api.quests.adminListQuests(token),
      ]);
      setCampaigns((cRes as any).campaigns || []);
      setQuests((qRes as any).quests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const setF = (k: string, v: unknown) => setForm(f => {
    const next = { ...f, [k]: v };
    if (k === 'title' && autoSlug) (next as any).slug = slugify(String(v));
    return next;
  });

  const openEdit = (camp: any) => {
    setEditingCamp(camp);
    setForm({
      slug: camp.slug, title: camp.title, description: camp.description || '',
      partner: camp.partner || '', banner_url: camp.banner_url || '',
      logo_url: camp.meta?.logo_url || '',
      reward_summary: camp.reward_summary || '', difficulty: camp.difficulty || 'EASY',
      status: camp.status || 'ACTIVE', bonus_xp: camp.bonus_xp || 0,
      sort_order: camp.sort_order || 0, meta: JSON.stringify(camp.meta || {}, null, 2),
    });
    setAutoSlug(false);
    setShowForm(true);
    setSuccess(''); setError('');
  };

  const openNew = () => {
    setEditingCamp(null);
    setForm(emptyForm);
    setAutoSlug(true);
    setShowForm(true);
    setSuccess(''); setError('');
  };

  const handleSave = async () => {
    setError(''); setSuccess('');
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(form.meta || '{}'); } catch { setError('Meta must be valid JSON'); return; }
    if (form.logo_url) meta.logo_url = form.logo_url;
    setSaving(true);
    try {
      const res = await api.quests.adminUpsertCampaign(token, {
        slug: form.slug, title: form.title, description: form.description,
        partner: form.partner || null, banner_url: form.banner_url || null,
        reward_summary: form.reward_summary || null, difficulty: form.difficulty,
        status: form.status, bonus_xp: Number(form.bonus_xp),
        sort_order: Number(form.sort_order), meta,
      });
      setSuccess(`✅ Project "${(res as any).campaign?.title}" saved!`);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDeleteCampaign = async (slug: string, title: string) => {
    if (!window.confirm(`Delete project "${title}" and ALL its quests? This cannot be undone.`)) return;
    try {
      const res = await api.quests.adminDeleteCampaign(token, slug) as any;
      const n = res.deleted_quests?.length || 0;
      setSuccess(`✅ Deleted project "${title}" and ${n} quest${n !== 1 ? 's' : ''}.`);
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  };

  const handleDeleteQuest = async (slug: string, title: string) => {
    if (!window.confirm(`Delete quest "${title}"? This cannot be undone.`)) return;
    try {
      await api.quests.adminDeleteQuest(token, slug);
      setSuccess(`✅ Quest "${title}" deleted.`);
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Existing campaigns */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-provn-muted uppercase tracking-wider">
            Projects ({campaigns.length})
          </h3>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Project
          </button>
        </div>
        {campaigns.length === 0 && <p className="text-provn-muted text-sm">No projects yet.</p>}
        <div className="space-y-2">
          {campaigns.map((c: any) => {
            const campQuests = quests.filter((q: any) => q.campaign_slug === c.slug);
            return (
              <div key={c.slug} className="bg-provn-surface border border-provn-border rounded-xl p-4 flex items-start gap-4">
                {/* Banner thumbnail */}
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-provn-bg border border-provn-border flex items-center justify-center flex-shrink-0">
                  {c.banner_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.banner_url} alt={c.title} className="w-full h-full object-cover" />
                    : <ImageIcon className="w-5 h-5 text-provn-muted" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-sm truncate">{c.title}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${c.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-provn-border text-provn-muted'}`}>{c.status}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-provn-bg text-provn-muted">{c.difficulty}</span>
                  </div>
                  <p className="text-xs text-provn-muted mt-0.5 line-clamp-1">{c.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-provn-muted">
                    <span className="flex items-center gap-1"><Trophy className="w-3 h-3" /> {campQuests.length} quests</span>
                    <span className="flex items-center gap-1"><Sprout className="w-3 h-3 text-emerald-400" /> {c.total_seeds_pool || 0} XP pool</span>
                    {c.reward_summary && <span className="text-emerald-400">{c.reward_summary}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => openEdit(c)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-provn-bg border border-provn-border hover:border-emerald-500/40 transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => handleDeleteCampaign(c.slug, c.title)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Project form */}
      {showForm && (
        <div className="bg-provn-surface border border-provn-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm">{editingCamp ? `Edit: ${editingCamp.title}` : 'New Project'}</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Title *</label>
              <input className={inp} placeholder="GrowStreams M1 Launch" value={form.title} onChange={e => setF('title', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Slug *</label>
              <input className={inp} placeholder="growstreams-m1-launch" value={form.slug}
                onChange={e => { setAutoSlug(false); setF('slug', e.target.value); }} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Description</label>
            <textarea className={`${inp} h-20 resize-none`} placeholder="What is this project about?"
              value={form.description} onChange={e => setF('description', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-provn-muted uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Banner URL <span className="text-provn-muted/50 normal-case font-normal">(1500×500, 3:1)</span>
              </label>
              <input className={inp} placeholder="https://cdn.example.com/banner.png" value={form.banner_url} onChange={e => setF('banner_url', e.target.value)} />
              {form.banner_url && (
                <div className="mt-1 rounded-lg overflow-hidden border border-provn-border" style={{ aspectRatio: '3/1' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.banner_url} alt="Banner preview" className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-provn-muted uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Logo URL <span className="text-provn-muted/50 normal-case font-normal">(square, shown on card)</span>
              </label>
              <input className={inp} placeholder="https://cdn.example.com/logo.png" value={(form as any).logo_url || ''} onChange={e => setF('logo_url', e.target.value)} />
              {(form as any).logo_url && (
                <div className="mt-1 w-14 h-14 rounded-lg overflow-hidden border border-provn-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={(form as any).logo_url} alt="Logo preview" className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Partner / Brand name</label>
              <input className={inp} placeholder="Ginie" value={form.partner} onChange={e => setF('partner', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Reward Summary</label>
              <input className={inp} placeholder="100,000 VARA · Top 5 win" value={form.reward_summary} onChange={e => setF('reward_summary', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Difficulty</label>
              <div className="relative">
                <select className={sel} value={form.difficulty} onChange={e => setF('difficulty', e.target.value)}>
                  {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-provn-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Status</label>
              <div className="relative">
                <select className={sel} value={form.status} onChange={e => setF('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-provn-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">Sort Order</label>
              <input className={inp} type="number" min="0" value={form.sort_order} onChange={e => setF('sort_order', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-provn-muted uppercase tracking-wider">
              Meta JSON
              <span className="ml-2 text-provn-muted/70 normal-case font-normal">
                Optional — e.g. {`{"verified":true,"is_new":true,"prize_pool":{"tiers":[{"rank":1,"vara":50000,"label":"1st"}]}}`}
              </span>
            </label>
            <textarea className={`${inp} h-20 resize-none font-mono text-xs`}
              value={form.meta} onChange={e => setF('meta', e.target.value)} />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {success && <p className="text-emerald-400 text-sm">{success}</p>}

          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving || !form.title || !form.slug}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {editingCamp ? 'Update Project' : 'Create Project'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-lg text-sm text-provn-muted hover:text-provn-text transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {success && <p className="text-emerald-400 text-sm">{success}</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* All quests list */}
      <div>
        <h3 className="text-sm font-semibold text-provn-muted uppercase tracking-wider mb-3">
          All Quests ({quests.length})
        </h3>
        <div className="space-y-1.5">
          {quests.map((q: any) => (
            <div key={q.slug} className="bg-provn-bg border border-provn-border/50 rounded-lg px-4 py-2.5 flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${q.active ? 'bg-emerald-400' : 'bg-provn-muted'}`} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{q.title}</span>
                <span className="ml-2 text-[10px] text-provn-muted font-mono">{q.slug}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-provn-surface border border-provn-border text-provn-muted">{q.quest_type}</span>
              <span className="text-xs text-emerald-400 font-medium flex-shrink-0">{q.seeds_reward} XP</span>
              {q.campaign_title && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 flex-shrink-0 truncate max-w-[120px]">{q.campaign_title}</span>
              )}
              <button onClick={() => handleDeleteQuest(q.slug, q.title)}
                className="flex-shrink-0 p-1.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────
function AnalyticsTab({ token }: { token: string }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const s = await api.quests.adminStats(token) as any;
      setStats(s);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!stats) return null;

  const maxReg = Math.max(...(stats.registrationsByDay?.map((d: any) => d.count) || [1]), 1);
  const maxXp  = Math.max(...(stats.xpByDay?.map((d: any) => d.xp) || [1]), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-provn-muted uppercase tracking-wider flex items-center gap-2">
          <BarChart2 className="w-4 h-4" /> Platform Analytics
        </h3>
        <button onClick={load} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-provn-surface border border-provn-border hover:border-provn-muted/40 transition-colors">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Top KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Registered Users',  value: stats.totalRegistered,     icon: <Users className="w-4 h-4 text-blue-400" />,    color: 'text-blue-400' },
          { label: 'Quest Completions', value: stats.totalCompletions,    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, color: 'text-emerald-400' },
          { label: 'XP Minted',         value: stats.totalSeedsMinted,    icon: <Sprout className="w-4 h-4 text-emerald-400" />, color: 'text-emerald-400' },
          { label: 'Pending Review',    value: stats.pendingReview,       icon: <Activity className="w-4 h-4 text-amber-400" />, color: 'text-amber-400' },
          { label: 'Active Quests',     value: stats.totalActiveQuests,   icon: <Trophy className="w-4 h-4 text-purple-400" />, color: 'text-purple-400' },
          { label: 'Active Campaigns',  value: stats.totalActiveCampaigns, icon: <FolderOpen className="w-4 h-4 text-sky-400" />, color: 'text-sky-400' },
          { label: 'Invites Used',      value: stats.invitesUsed,         icon: <Send className="w-4 h-4 text-provn-muted" />,   color: '' },
          { label: 'Invites Created',   value: stats.invitesTotal,        icon: <Plus className="w-4 h-4 text-provn-muted" />,   color: '' },
        ].map(k => (
          <div key={k.label} className="bg-provn-surface border border-provn-border rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1">{k.icon}</div>
            <p className={`text-2xl font-bold ${k.color}`}>{(k.value ?? 0).toLocaleString()}</p>
            <p className="text-[10px] text-provn-muted uppercase tracking-wider mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Registrations bar chart (last 14 days) */}
      {stats.registrationsByDay?.length > 0 && (
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-provn-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> New Registrations — last 14 days
          </h4>
          <div className="flex items-end gap-1 h-24">
            {stats.registrationsByDay.map((d: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
                <div className="w-full rounded-sm bg-blue-500/60 transition-all" style={{ height: `${Math.max(4, Math.round((d.count / maxReg) * 88))}px` }} />
                <span className="text-[9px] text-provn-muted/60 rotate-45 origin-left whitespace-nowrap hidden sm:block">
                  {new Date(d.day).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* XP minted bar chart (last 14 days) */}
      {stats.xpByDay?.length > 0 && (
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-provn-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sprout className="w-3.5 h-3.5 text-emerald-400" /> XP Minted per Day — last 14 days
          </h4>
          <div className="flex items-end gap-1 h-24">
            {stats.xpByDay.map((d: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.xp} XP`}>
                <div className="w-full rounded-sm bg-emerald-500/60 transition-all" style={{ height: `${Math.max(4, Math.round((d.xp / maxXp) * 88))}px` }} />
                <span className="text-[9px] text-provn-muted/60 rotate-45 origin-left whitespace-nowrap hidden sm:block">
                  {new Date(d.day).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-quest completion breakdown */}
      {stats.questBreakdown?.length > 0 && (
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-provn-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Quest Completions Breakdown
          </h4>
          <div className="space-y-2">
            {stats.questBreakdown.map((q: any) => {
              const max = stats.questBreakdown[0]?.completions || 1;
              return (
                <div key={q.slug} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[60%]">{q.title}</span>
                    <span className="text-provn-muted font-mono">{q.completions} completions · {q.seeds_reward} XP</span>
                  </div>
                  <div className="w-full bg-provn-bg rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.round((q.completions / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Submissions Tab (unchanged logic, updated header) ───────────────────────
function SubmissionsTab({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [submissions, setSubmissions] = useState<QuestSubmission[]>([]);
  const [stats, setStats] = useState<{ totalRegistered: number; totalCompletions: number; totalSeedsMinted: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [subRes, statRes] = await Promise.all([
        api.quests.adminListSubmissions(token),
        api.quests.adminStats(token),
      ]);
      setSubmissions(subRes.submissions);
      setStats(statRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      if (err instanceof Error && /unauthor/i.test(err.message)) onLogout();
    } finally { setLoading(false); }
  }, [token, onLogout]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-provn-surface border border-provn-border hover:border-provn-muted/40 transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </button>
      </div>
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-provn-surface border border-provn-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{stats.totalRegistered}</p>
            <p className="text-[10px] text-provn-muted uppercase tracking-wider">Registered</p>
          </div>
          <div className="bg-provn-surface border border-provn-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{stats.totalCompletions}</p>
            <p className="text-[10px] text-provn-muted uppercase tracking-wider">Completions</p>
          </div>
          <div className="bg-provn-surface border border-provn-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400 flex items-center justify-center gap-1">
              <Sprout className="w-4 h-4" />{stats.totalSeedsMinted}
            </p>
            <p className="text-[10px] text-provn-muted uppercase tracking-wider">XP Minted</p>
          </div>
        </div>
      )}
      <div>
        <h2 className="text-sm font-semibold mb-3 text-provn-muted uppercase tracking-wider">
          Pending submissions ({submissions.length})
        </h2>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {loading && submissions.length === 0 && (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>
        )}
        {!loading && submissions.length === 0 && (
          <p className="text-center text-provn-muted text-sm py-12">No pending submissions. 🎉</p>
        )}
        <div className="space-y-3">
          {submissions.map(sub => (
            <SubmissionRow key={sub.id} submission={sub} token={token} onAction={load} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Dashboard (tabs shell) ────────────────────────────────────────────
type Tab = 'submissions' | 'create-quest' | 'projects' | 'analytics';

function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('submissions');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'submissions',  label: 'Submissions',  icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'create-quest', label: 'Create Quest', icon: <Plus className="w-4 h-4" /> },
    { id: 'projects',     label: 'Projects',     icon: <FolderOpen className="w-4 h-4" /> },
    { id: 'analytics',    label: 'Analytics',    icon: <BarChart2 className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-emerald-400" />
          <h1 className="text-xl font-bold">Quest Admin</h1>
        </div>
        <button onClick={onLogout}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
          <LogOut className="w-3 h-3" /> Logout
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-provn-bg rounded-xl p-1 border border-provn-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium flex-1 justify-center transition-colors ${
              tab === t.id
                ? 'bg-provn-surface text-white border border-provn-border shadow-sm'
                : 'text-provn-muted hover:text-provn-text'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'submissions'  && <SubmissionsTab token={token} onLogout={onLogout} />}
      {tab === 'create-quest' && <CreateQuestTab token={token} />}
      {tab === 'projects'     && <ManageProjectsTab token={token} />}
      {tab === 'analytics'    && <AnalyticsTab token={token} />}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AdminQuestsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (stored) setToken(stored);
    setHydrated(true);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  };

  if (!hydrated) {
    return <div className="flex items-center justify-center h-60"><Loader2 className="w-8 h-8 text-emerald-400 animate-spin" /></div>;
  }

  if (!token) return <AdminGate onAuthed={setToken} />;
  return <AdminDashboard token={token} onLogout={handleLogout} />;
}

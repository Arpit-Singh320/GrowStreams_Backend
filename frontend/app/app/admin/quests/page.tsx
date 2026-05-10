'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, QuestSubmission } from '@/lib/growstreams-api';
import {
  Shield, Loader2, CheckCircle2, XCircle, ExternalLink,
  Twitter, RefreshCw, Lock, LogOut, Sprout,
} from 'lucide-react';

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

  const proof = (submission.proof || {}) as { x_username?: string; tweet_url?: string };
  const isFollow = submission.quest_slug === 'follow-x';

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
        {!isFollow && proof.tweet_url && (
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

// ─── Admin Dashboard ────────────────────────────────────────────────────────
function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [submissions, setSubmissions] = useState<QuestSubmission[]>([]);
  const [stats, setStats] = useState<{ totalRegistered: number; totalCompletions: number; totalSeedsMinted: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [subRes, statRes] = await Promise.all([
        api.quests.adminListSubmissions(token),
        api.quests.adminStats(token),
      ]);
      setSubmissions(subRes.submissions);
      setStats(statRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      if (err instanceof Error && /unauthor/i.test(err.message)) {
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-emerald-400" />
          <h1 className="text-xl font-bold">Quest Admin Review</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-provn-surface border border-provn-border hover:border-provn-muted/40 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="w-3 h-3" /> Logout
          </button>
        </div>
      </div>

      {/* Stats */}
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
              <Sprout className="w-4 h-4" />
              {stats.totalSeedsMinted}
            </p>
            <p className="text-[10px] text-provn-muted uppercase tracking-wider">XP Minted</p>
          </div>
        </div>
      )}

      {/* Pending Submissions */}
      <div>
        <h2 className="text-sm font-semibold mb-3 text-provn-muted uppercase tracking-wider">
          Pending submissions ({submissions.length})
        </h2>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {loading && submissions.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        )}
        {!loading && submissions.length === 0 && (
          <p className="text-center text-provn-muted text-sm py-12">
            No pending submissions. 🎉
          </p>
        )}
        <div className="space-y-3">
          {submissions.map((sub) => (
            <SubmissionRow
              key={sub.id}
              submission={sub}
              token={token}
              onAction={load}
            />
          ))}
        </div>
      </div>
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
    return (
      <div className="flex items-center justify-center h-60">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!token) {
    return <AdminGate onAuthed={setToken} />;
  }

  return <AdminDashboard token={token} onLogout={handleLogout} />;
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api, Campaign, CampaignLeaderboardEntry } from '@/lib/growstreams-api';
import {
  Trophy, GitBranch, Twitter, Zap, ArrowRight, CheckCircle,
  AlertCircle, Loader2, DollarSign, Users, Calendar, Star,
  Clock, ChevronDown, ChevronUp, Medal, Plus, X,
} from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Mock campaigns — shown when the API returns no data
// ---------------------------------------------------------------------------
const now = new Date();
const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();
const in14 = new Date(now.getTime() + 14 * 86400000).toISOString();
const in21 = new Date(now.getTime() + 21 * 86400000).toISOString();
const in30 = new Date(now.getTime() + 30 * 86400000).toISOString();
const ago7 = new Date(now.getTime() - 7 * 86400000).toISOString();
const ago30 = new Date(now.getTime() - 30 * 86400000).toISOString();

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'mock-1',
    creator_wallet: '0x0000000000000000000000000000000000000001',
    title: 'VarAIbot Sprint #2',
    description: 'Contribute PRs or create content about the VarAIbot project. Top contributors share the $500 USDC pool.',
    status: 'ACTIVE',
    pool_amount: '500',
    pool_remaining: '500',
    token: 'USDC',
    track_type: 'BOTH',
    start_date: ago7,
    end_date: in14,
    ended_at: null,
    funding_tx_hash: null,
    required_hashtags: ['#VarAIbot', '#GrowStreams'],
    required_mentions: ['GrowStreams'],
    github_repo_url: 'https://github.com/aspect-build/growstreams',
    github_issue_labels: ['campaign'],
    max_oss_contributions: 50,
    max_content_contributions: 100,
    score_threshold: 70,
    created_at: ago7,
    updated_at: ago7,
  },
  {
    id: 'mock-2',
    creator_wallet: '0x0000000000000000000000000000000000000002',
    title: 'DeFi Content Blitz',
    description: 'Create high-quality DeFi educational content on X/Twitter. Videos, threads, and infographics welcome!',
    status: 'ACTIVE',
    pool_amount: '250',
    pool_remaining: '250',
    token: 'USDC',
    track_type: 'CONTENT',
    start_date: ago7,
    end_date: in7,
    ended_at: null,
    funding_tx_hash: null,
    required_hashtags: ['#DeFi', '#GrowStreams'],
    required_mentions: ['GrowStreams'],
    github_repo_url: null,
    github_issue_labels: [],
    max_oss_contributions: null,
    max_content_contributions: 200,
    score_threshold: 65,
    created_at: ago7,
    updated_at: ago7,
  },
  {
    id: 'mock-3',
    creator_wallet: '0x0000000000000000000000000000000000000003',
    title: 'Vara SDK Bug Bounty',
    description: 'Find and fix bugs in the Vara SDK. PRs scored by AI — highest quality wins.',
    status: 'FUNDED',
    pool_amount: '1000',
    pool_remaining: '1000',
    token: 'USDC',
    track_type: 'OSS',
    start_date: in7,
    end_date: in30,
    ended_at: null,
    funding_tx_hash: null,
    required_hashtags: [],
    required_mentions: [],
    github_repo_url: 'https://github.com/aspect-build/vara-sdk',
    github_issue_labels: ['bug', 'bounty'],
    max_oss_contributions: 30,
    max_content_contributions: null,
    score_threshold: 75,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function statusColor(status: string) {
  switch (status) {
    case 'ACTIVE': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    case 'FUNDED': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    case 'ENDED': case 'SETTLING': case 'CLOSED': return 'text-red-400 bg-red-500/10 border-red-500/30';
    case 'DRAFT': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    default: return 'text-provn-muted bg-provn-bg border-provn-border';
  }
}

function trackLabel(t: string) {
  if (t === 'OSS') return { icon: GitBranch, label: 'OSS', color: 'text-emerald-400' };
  if (t === 'CONTENT') return { icon: Twitter, label: 'Content', color: 'text-blue-400' };
  return { icon: Zap, label: 'Both', color: 'text-purple-400' };
}

function daysUntil(dateStr: string) {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

function shortenWallet(w: string) {
  if (!w || w.length < 12) return w;
  return w.slice(0, 6) + '...' + w.slice(-4);
}

// ---------------------------------------------------------------------------
// Create Campaign Modal
// ---------------------------------------------------------------------------
function CreateCampaignModal({ wallet, onClose, onCreated }: { wallet: string; onClose: () => void; onCreated: (c: Campaign) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [trackType, setTrackType] = useState<'OSS' | 'CONTENT' | 'BOTH'>('BOTH');
  const [poolAmount, setPoolAmount] = useState('500');
  const [durationDays, setDurationDays] = useState('14');
  const [hashtags, setHashtags] = useState('#GrowStreams');
  const [mentions, setMentions] = useState('GrowStreams');
  const [repoUrl, setRepoUrl] = useState('');
  const [scoreThreshold, setScoreThreshold] = useState('70');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!wallet) { setError('Connect your wallet first'); return; }
    setSubmitting(true);
    setError('');

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + parseInt(durationDays) * 86400000);

    const params: Record<string, unknown> = {
      creator_wallet: wallet,
      title: title.trim(),
      description: description.trim() || null,
      track_type: trackType,
      pool_amount: parseFloat(poolAmount),
      token: 'USDC',
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      score_threshold: parseInt(scoreThreshold),
      required_hashtags: hashtags.split(',').map(h => h.trim()).filter(Boolean),
      required_mentions: mentions.split(',').map(m => m.trim().replace(/^@/, '')).filter(Boolean),
    };
    if (repoUrl.trim()) params.github_repo_url = repoUrl.trim();

    try {
      const created = await api.campaigns.create(params);
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create campaign';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-provn-surface border border-provn-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-provn-surface border-b border-provn-border px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-400" /> Create Campaign
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-provn-bg transition-colors">
            <X className="w-5 h-5 text-provn-muted" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-provn-muted">Campaign Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. VarAIbot Sprint #3"
              className="w-full bg-provn-bg border border-provn-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/50" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-provn-muted">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What is this campaign about?"
              className="w-full bg-provn-bg border border-provn-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/50 resize-none" />
          </div>

          {/* Track Type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-provn-muted">Track</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'OSS' as const, l: 'OSS', Icon: GitBranch, c: 'emerald' },
                { v: 'CONTENT' as const, l: 'Content', Icon: Twitter, c: 'blue' },
                { v: 'BOTH' as const, l: 'Both', Icon: Zap, c: 'purple' },
              ]).map(({ v, l, Icon, c }) => (
                <button key={v} onClick={() => setTrackType(v)}
                  className={`rounded-lg p-3 text-center text-sm font-medium border transition-all ${
                    trackType === v
                      ? `border-${c}-500/40 bg-${c}-500/10`
                      : 'border-provn-border bg-provn-bg/30 hover:border-provn-border/80'
                  }`}
                  style={trackType === v ? { borderColor: c === 'emerald' ? 'rgba(16,185,129,.4)' : c === 'blue' ? 'rgba(59,130,246,.4)' : 'rgba(168,85,247,.4)', backgroundColor: c === 'emerald' ? 'rgba(16,185,129,.1)' : c === 'blue' ? 'rgba(59,130,246,.1)' : 'rgba(168,85,247,.1)' } : {}}>
                  <Icon className={`w-4 h-4 mx-auto mb-1 ${trackType === v ? (c === 'emerald' ? 'text-emerald-400' : c === 'blue' ? 'text-blue-400' : 'text-purple-400') : 'text-provn-muted'}`} />
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Pool + Duration row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-provn-muted">Pool (USDC)</label>
              <input type="number" value={poolAmount} onChange={e => setPoolAmount(e.target.value)} min="1"
                className="w-full bg-provn-bg border border-provn-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-provn-muted">Duration (days)</label>
              <input type="number" value={durationDays} onChange={e => setDurationDays(e.target.value)} min="1" max="90"
                className="w-full bg-provn-bg border border-provn-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
          </div>

          {/* Hashtags + Mentions */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-provn-muted">Hashtags (comma-separated)</label>
              <input type="text" value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#GrowStreams, #DeFi"
                className="w-full bg-provn-bg border border-provn-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-provn-muted">Mentions (comma-separated)</label>
              <input type="text" value={mentions} onChange={e => setMentions(e.target.value)} placeholder="GrowStreams"
                className="w-full bg-provn-bg border border-provn-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/50" />
            </div>
          </div>

          {/* GitHub Repo (optional) */}
          {(trackType === 'OSS' || trackType === 'BOTH') && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-provn-muted">GitHub Repo URL</label>
              <input type="text" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/org/repo"
                className="w-full bg-provn-bg border border-provn-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/50" />
            </div>
          )}

          {/* Score Threshold */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-provn-muted">Minimum Score Threshold</label>
            <input type="number" value={scoreThreshold} onChange={e => setScoreThreshold(e.target.value)} min="0" max="100"
              className="w-full bg-provn-bg border border-provn-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50" />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={submitting || !wallet}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Plus className="w-4 h-4" /> Create Campaign</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function CampaignPage() {
  const { account } = useAccount();
  const wallet = account?.decodedAddress || '';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<Record<string, CampaignLeaderboardEntry[]>>({});
  const [lbLoading, setLbLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [all, userCampaigns] = await Promise.all([
        api.campaigns.list({ limit: 50 }).catch(() => ({ campaigns: [], count: 0 })),
        wallet ? api.campaigns.userCampaigns(wallet).catch(() => ({ campaigns: [], count: 0 })) : { campaigns: [], count: 0 },
      ]);
      const fetched = all.campaigns || [];
      // Use mock campaigns if the API returned nothing
      setCampaigns(fetched.length > 0 ? fetched : MOCK_CAMPAIGNS);
      const ids = new Set((userCampaigns.campaigns || []).map((c: { campaign_id: string }) => c.campaign_id));
      setEnrolledIds(ids);
    } catch {
      setCampaigns(MOCK_CAMPAIGNS);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEnroll = async (campaignId: string) => {
    if (!wallet) { setError('Connect your wallet first'); return; }
    // If it is a mock campaign, just locally mark as enrolled
    if (campaignId.startsWith('mock-')) {
      setEnrolledIds(prev => new Set(prev).add(campaignId));
      setSuccess('Enrolled! (demo mode)');
      return;
    }
    setEnrolling(campaignId);
    setError('');
    setSuccess('');
    try {
      await api.campaigns.enroll(campaignId, { wallet });
      setSuccess('Successfully enrolled!');
      setEnrolledIds(prev => new Set(prev).add(campaignId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Enrollment failed';
      setError(msg);
    } finally {
      setEnrolling(null);
    }
  };

  const toggleLeaderboard = async (campaignId: string) => {
    if (expandedId === campaignId) { setExpandedId(null); return; }
    setExpandedId(campaignId);
    if (!leaderboard[campaignId]) {
      if (campaignId.startsWith('mock-')) {
        setLeaderboard(prev => ({ ...prev, [campaignId]: [] }));
        return;
      }
      setLbLoading(campaignId);
      try {
        const res = await api.campaigns.leaderboard(campaignId, { limit: 10 });
        setLeaderboard(prev => ({ ...prev, [campaignId]: res.leaderboard || [] }));
      } catch { /* ignore */ }
      finally { setLbLoading(null); }
    }
  };

  const handleCampaignCreated = (c: Campaign) => {
    setCampaigns(prev => [c, ...prev]);
    setSuccess('Campaign created successfully!');
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
  const otherCampaigns = campaigns.filter(c => c.status !== 'ACTIVE');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Create Campaign Modal */}
      {showCreate && <CreateCampaignModal wallet={wallet} onClose={() => setShowCreate(false)} onCreated={handleCampaignCreated} />}

      {/* Header + Create Button */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-3xl font-bold">Campaigns</h1>
        <p className="text-provn-muted max-w-lg mx-auto">
          Earn XP and USDC rewards by contributing code or creating content. Enroll in active campaigns to compete.
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium px-6 py-3 rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-5 h-5" /> Create Campaign
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
          <Zap className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-emerald-400">{activeCampaigns.length}</p>
          <p className="text-[10px] text-provn-muted uppercase tracking-wider">Active</p>
        </div>
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
          <DollarSign className="w-5 h-5 text-amber-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-amber-400">
            ${campaigns.reduce((sum, c) => sum + parseFloat(c.pool_amount || '0'), 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-provn-muted uppercase tracking-wider">Total Pools</p>
        </div>
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
          <Users className="w-5 h-5 text-purple-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-purple-400">{enrolledIds.size}</p>
          <p className="text-[10px] text-provn-muted uppercase tracking-wider">Your Enrollments</p>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Active Campaigns */}
      {activeCampaigns.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" /> Active Campaigns
          </h2>
          {activeCampaigns.map(campaign => {
            const Track = trackLabel(campaign.track_type);
            const enrolled = enrolledIds.has(campaign.id);
            const expanded = expandedId === campaign.id;
            const lb = leaderboard[campaign.id];
            return (
              <div key={campaign.id} className="bg-provn-surface border border-provn-border rounded-xl overflow-hidden">
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold truncate">{campaign.title}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor(campaign.status)}`}>{campaign.status}</span>
                      </div>
                      {campaign.description && <p className="text-sm text-provn-muted line-clamp-2">{campaign.description}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-provn-bg/50 rounded-lg p-3 text-center">
                      <DollarSign className="w-4 h-4 text-emerald-400 mx-auto mb-0.5" />
                      <p className="text-lg font-bold text-emerald-400">${parseFloat(campaign.pool_amount).toLocaleString()}</p>
                      <p className="text-[9px] text-provn-muted uppercase">Pool</p>
                    </div>
                    <div className="bg-provn-bg/50 rounded-lg p-3 text-center">
                      <Track.icon className={`w-4 h-4 ${Track.color} mx-auto mb-0.5`} />
                      <p className={`text-lg font-bold ${Track.color}`}>{Track.label}</p>
                      <p className="text-[9px] text-provn-muted uppercase">Track</p>
                    </div>
                    <div className="bg-provn-bg/50 rounded-lg p-3 text-center">
                      <Clock className="w-4 h-4 text-amber-400 mx-auto mb-0.5" />
                      <p className="text-lg font-bold text-amber-400">{daysUntil(campaign.end_date)}d</p>
                      <p className="text-[9px] text-provn-muted uppercase">Remaining</p>
                    </div>
                    <div className="bg-provn-bg/50 rounded-lg p-3 text-center">
                      <Star className="w-4 h-4 text-blue-400 mx-auto mb-0.5" />
                      <p className="text-lg font-bold text-blue-400">{campaign.score_threshold}</p>
                      <p className="text-[9px] text-provn-muted uppercase">Min Score</p>
                    </div>
                  </div>

                  {campaign.required_hashtags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {campaign.required_hashtags.map(h => (
                        <span key={h} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">{h}</span>
                      ))}
                      {campaign.required_mentions?.map(m => (
                        <span key={m} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">@{m}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    {enrolled ? (
                      <div className="flex-1 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2.5">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-400">Enrolled</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEnroll(campaign.id)}
                        disabled={!wallet || enrolling === campaign.id}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                      >
                        {enrolling === campaign.id ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling...</>
                        ) : (
                          <>Enroll Now <ArrowRight className="w-4 h-4" /></>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => toggleLeaderboard(campaign.id)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-provn-border hover:bg-provn-bg/50 text-sm font-medium text-provn-muted transition-colors"
                    >
                      <Medal className="w-4 h-4" />
                      Leaderboard
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Inline Leaderboard */}
                {expanded && (
                  <div className="border-t border-provn-border bg-provn-bg/30">
                    {lbLoading === campaign.id ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" />
                      </div>
                    ) : lb && lb.length > 0 ? (
                      <div className="divide-y divide-provn-border/30">
                        <div className="grid grid-cols-[3rem_1fr_6rem] gap-2 px-5 py-2 text-[10px] text-provn-muted uppercase tracking-wider font-medium">
                          <div>Rank</div><div>Wallet</div><div className="text-right">Campaign XP</div>
                        </div>
                        {lb.map((entry) => (
                          <div key={entry.wallet} className={`grid grid-cols-[3rem_1fr_6rem] gap-2 px-5 py-2.5 items-center text-sm ${
                            entry.wallet.toLowerCase() === wallet.toLowerCase() ? 'bg-emerald-500/5' : ''
                          }`}>
                            <div className="font-bold text-provn-muted">#{entry.rank}</div>
                            <div className="font-mono text-xs truncate">{shortenWallet(entry.wallet)}</div>
                            <div className="text-right font-bold font-mono text-emerald-400">{entry.campaign_xp.toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-provn-muted">No participants yet. Be the first!</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Past / Upcoming Campaigns */}
      {otherCampaigns.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-provn-muted">
            <Calendar className="w-5 h-5" /> Upcoming & Past Campaigns
          </h2>
          {otherCampaigns.map(campaign => {
            const Track = trackLabel(campaign.track_type);
            const enrolled = enrolledIds.has(campaign.id);
            return (
              <div key={campaign.id} className="bg-provn-surface border border-provn-border rounded-xl p-4 opacity-80">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold truncate">{campaign.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor(campaign.status)}`}>{campaign.status}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium bg-provn-bg ${Track.color}`}>{Track.label}</span>
                    </div>
                    <p className="text-xs text-provn-muted">
                      ${parseFloat(campaign.pool_amount).toLocaleString()} pool &middot; {new Date(campaign.start_date).toLocaleDateString()} &ndash; {new Date(campaign.end_date).toLocaleDateString()}
                      {enrolled && <span className="ml-2 text-emerald-400">&bull; Enrolled</span>}
                    </p>
                  </div>
                  {campaign.status === 'FUNDED' && (
                    <div className="text-xs text-blue-400 font-medium">
                      Starts in {daysUntil(campaign.start_date)}d
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How XP Works */}
      <div className="bg-provn-surface border border-provn-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">How XP Works</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-provn-bg/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-emerald-400">OSS Track (GitHub)</h3>
            </div>
            <ul className="space-y-2 text-sm text-provn-muted">
              <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">1.</span>Submit a PR to the campaign&apos;s repo</li>
              <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">2.</span>AI scores your code (0-100)</li>
              <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">3.</span>Score &ge;threshold = instant XP (700-2000)</li>
              <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">4.</span>Daily XP accrual for 14 days</li>
              <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">5.</span>Merge bonus: +500 XP</li>
            </ul>
          </div>
          <div className="bg-provn-bg/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Twitter className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-blue-400">Content Track (X/Twitter)</h3>
            </div>
            <ul className="space-y-2 text-sm text-provn-muted">
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">1.</span>Post with campaign hashtags/mentions</li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">2.</span>AI scores quality + engagement</li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">3.</span>Score &ge;threshold = instant XP (500-1200)</li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">4.</span>Thread bonus: +30% for 5+ tweets</li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">5.</span>Viral bonus: +800 XP at 500+ engagements</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Payout Formula */}
      <div className="bg-provn-surface border border-provn-border rounded-xl p-6 space-y-3">
        <h2 className="text-lg font-semibold">Payout Formula</h2>
        <div className="bg-provn-bg/50 rounded-xl p-4 text-center">
          <p className="text-lg font-mono text-emerald-400">
            Your USDC = (Your Campaign XP / Total Campaign XP) &times; Pool
          </p>
        </div>
        <p className="text-sm text-provn-muted text-center">
          Each campaign distributes its pool proportionally based on XP earned within that campaign.
        </p>
      </div>

      {/* Link to global leaderboard */}
      <div className="text-center">
        <Link
          href="/app/leaderboard"
          className="inline-flex items-center gap-2 text-provn-muted hover:text-emerald-400 text-sm font-medium transition-colors"
        >
          <Trophy className="w-4 h-4" />
          View Global Leaderboard
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

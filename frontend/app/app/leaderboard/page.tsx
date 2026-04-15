'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api, Campaign, CampaignLeaderboardEntry } from '@/lib/growstreams-api';
import {
  Trophy, Medal, Users, Zap, DollarSign, GitBranch, Twitter,
  ChevronDown, ChevronUp, Clock, Star, Loader2, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

function shortenWallet(w: string) {
  if (!w || w.length < 12) return w;
  return w.slice(0, 6) + '...' + w.slice(-4);
}

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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center"><Medal className="w-3.5 h-3.5 text-amber-400" /></div>;
  if (rank === 2) return <div className="w-7 h-7 rounded-full bg-gray-400/20 flex items-center justify-center"><Medal className="w-3.5 h-3.5 text-gray-300" /></div>;
  if (rank === 3) return <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center"><Medal className="w-3.5 h-3.5 text-orange-400" /></div>;
  return <div className="w-7 h-7 rounded-full bg-provn-bg flex items-center justify-center text-[10px] font-bold text-provn-muted">#{rank}</div>;
}

export default function LeaderboardPage() {
  const { account } = useAccount();
  const wallet = account?.decodedAddress || '';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaderboards, setLeaderboards] = useState<Record<string, CampaignLeaderboardEntry[]>>({});
  const [lbLoading, setLbLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.campaigns.list({ limit: 50 });
      const all = res.campaigns || [];
      // Sort: ACTIVE first, then ENDED/CLOSED, then others
      const order: Record<string, number> = { ACTIVE: 0, ENDED: 1, SETTLING: 1, CLOSED: 2, FUNDED: 3, DRAFT: 4 };
      all.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));
      setCampaigns(all);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleLeaderboard = async (campaignId: string) => {
    if (expandedId === campaignId) { setExpandedId(null); return; }
    setExpandedId(campaignId);
    if (!leaderboards[campaignId]) {
      setLbLoading(campaignId);
      try {
        const res = await api.campaigns.leaderboard(campaignId, { limit: 20 });
        setLeaderboards(prev => ({ ...prev, [campaignId]: res.leaderboard || [] }));
      } catch {
        setLeaderboards(prev => ({ ...prev, [campaignId]: [] }));
      } finally {
        setLbLoading(null);
      }
    }
  };

  const totalPools = campaigns.reduce((sum, c) => sum + parseFloat(c.pool_amount || '0'), 0);
  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
  const endedCampaigns = campaigns.filter(c => ['ENDED', 'SETTLING', 'CLOSED'].includes(c.status));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-purple-500/20 border border-amber-500/30 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-amber-400" />
          </div>
        </div>
        <h1 className="text-3xl font-bold">Campaign Leaderboards</h1>
        <p className="text-provn-muted max-w-lg mx-auto text-sm">
          View rankings for each campaign. Expand any campaign to see its leaderboard.
        </p>
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
          <p className="text-2xl font-bold text-amber-400">${totalPools.toLocaleString()}</p>
          <p className="text-[10px] text-provn-muted uppercase tracking-wider">Total Pools</p>
        </div>
        <div className="bg-provn-surface border border-provn-border rounded-xl p-4 text-center">
          <Users className="w-5 h-5 text-purple-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-purple-400">{campaigns.length}</p>
          <p className="text-[10px] text-provn-muted uppercase tracking-wider">Campaigns</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16 text-provn-muted">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="mb-2">No campaigns yet</p>
          <Link href="/app/campaign" className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm font-medium">
            Go to Campaigns <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <>
          {/* Active Campaigns */}
          {activeCampaigns.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-400" /> Active Campaign Leaderboards
              </h2>
              {activeCampaigns.map(c => (
                <CampaignLeaderboardCard
                  key={c.id}
                  campaign={c}
                  expanded={expandedId === c.id}
                  onToggle={() => toggleLeaderboard(c.id)}
                  leaderboard={leaderboards[c.id]}
                  lbLoading={lbLoading === c.id}
                  myWallet={wallet}
                />
              ))}
            </div>
          )}

          {/* Ended Campaigns */}
          {endedCampaigns.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-provn-muted">
                <Clock className="w-5 h-5" /> Past Campaign Leaderboards
              </h2>
              {endedCampaigns.map(c => (
                <CampaignLeaderboardCard
                  key={c.id}
                  campaign={c}
                  expanded={expandedId === c.id}
                  onToggle={() => toggleLeaderboard(c.id)}
                  leaderboard={leaderboards[c.id]}
                  lbLoading={lbLoading === c.id}
                  myWallet={wallet}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Link to campaigns */}
      <div className="text-center">
        <Link
          href="/app/campaign"
          className="inline-flex items-center gap-2 text-provn-muted hover:text-emerald-400 text-sm font-medium transition-colors"
        >
          <Zap className="w-4 h-4" />
          View All Campaigns & Enroll
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

function CampaignLeaderboardCard({
  campaign, expanded, onToggle, leaderboard, lbLoading, myWallet,
}: {
  campaign: Campaign;
  expanded: boolean;
  onToggle: () => void;
  leaderboard?: CampaignLeaderboardEntry[];
  lbLoading: boolean;
  myWallet: string;
}) {
  const Track = trackLabel(campaign.track_type);
  const isActive = campaign.status === 'ACTIVE';

  return (
    <div className="bg-provn-surface border border-provn-border rounded-xl overflow-hidden">
      {/* Campaign Header — clickable to expand */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-provn-bg/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold truncate">{campaign.title}</h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor(campaign.status)}`}>{campaign.status}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-provn-muted">
            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${parseFloat(campaign.pool_amount).toLocaleString()}</span>
            <span className={`flex items-center gap-1 ${Track.color}`}><Track.icon className="w-3 h-3" />{Track.label}</span>
            {isActive && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{daysUntil(campaign.end_date)}d left</span>}
            <span className="flex items-center gap-1"><Star className="w-3 h-3" />Min {campaign.score_threshold}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-provn-muted">
          <Medal className="w-4 h-4" />
          <span className="text-xs font-medium">Leaderboard</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Leaderboard */}
      {expanded && (
        <div className="border-t border-provn-border bg-provn-bg/30">
          {lbLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            </div>
          ) : leaderboard && leaderboard.length > 0 ? (
            <div>
              <div className="grid grid-cols-[3rem_1fr_6rem] gap-2 px-5 py-2 text-[10px] text-provn-muted uppercase tracking-wider font-medium border-b border-provn-border/30">
                <div>Rank</div><div>Participant</div><div className="text-right">Campaign XP</div>
              </div>
              <div className="divide-y divide-provn-border/20">
                {leaderboard.map((entry, i) => {
                  const isMe = entry.wallet.toLowerCase() === myWallet.toLowerCase();
                  return (
                    <div
                      key={entry.wallet}
                      className={`grid grid-cols-[3rem_1fr_6rem] gap-2 px-5 py-2.5 items-center text-sm ${
                        isMe ? 'bg-emerald-500/5' : ''
                      }`}
                    >
                      <div><RankBadge rank={i + 1} /></div>
                      <div className="min-w-0">
                        <p className="font-mono text-xs truncate">
                          {shortenWallet(entry.wallet)}
                          {isMe && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/15 text-emerald-400">You</span>}
                        </p>
                      </div>
                      <div className="text-right font-bold font-mono text-emerald-400">{(entry.campaign_xp || 0).toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-provn-muted">
              No participants yet. Be the first to enroll and contribute!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

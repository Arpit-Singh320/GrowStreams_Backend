'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { useParams, useRouter } from 'next/navigation';
import { api, QuestData } from '@/lib/growstreams-api';
import {
  Sprout, CheckCircle2, Loader2, ArrowRight, Clock, ExternalLink,
  Trophy, ChevronLeft, Users, Star, Mail, Twitter, Megaphone,
  GitPullRequest, Waves, Gift, Lock, ArrowLeft,
} from 'lucide-react';

const QUEST_ICONS: Record<string, React.ElementType> = {
  twitter: Twitter, megaphone: Megaphone, star: Star,
  'git-pull-request': GitPullRequest, waves: Waves, gift: Gift,
};

function QuestIcon({ icon }: { icon: string }) {
  const Icon = QUEST_ICONS[icon] || Sprout;
  return <Icon className="w-5 h-5" />;
}

// Parses [label](url) markdown links and bare http(s) URLs into safe anchors.
// Each newline becomes its own line, so step-by-step descriptions render as a list.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  let i = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const label = m[1] ?? m[3];
    const href = m[2] ?? m[3];
    nodes.push(
      <a
        key={`${keyBase}-l${i++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-violet-400 underline underline-offset-2 hover:text-violet-300 break-all"
      >
        {label}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  return (
    <div className={className}>
      {lines.map((line, idx) =>
        line.trim() === '' ? (
          <div key={idx} className="h-2" />
        ) : (
          <p key={idx}>{renderInline(line, `ln${idx}`)}</p>
        ),
      )}
    </div>
  );
}

function XpBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-500/15 text-violet-400">
      <Star className="w-3 h-3" />
      {amount} XP
    </span>
  );
}

function StatusBadge({ quest }: { quest: QuestData }) {
  if (quest.completed) return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> Done
    </span>
  );
  if (quest.pendingSubmission) return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400">
      <Clock className="w-3 h-3" /> Under review
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-provn-border/40 text-provn-muted">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

interface SpecialProject {
  id: number;
  slug: string;
  title: string;
  description: string;
  banner_url?: string;
  badge_label?: string;
  status: string;
  sort_order: number;
  quest_count?: number;
}

interface LeaderboardRow {
  wallet: string;
  display_name?: string;
  total_xp: number;
  quests_completed: number;
}

export default function ProjectPage() {
  const { account } = useAccount();
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const wallet = account?.address ?? '';

  const [data, setData] = useState<{ project: SpecialProject; quests: QuestData[]; projectXp: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<{ slug: string; text: string; ok: boolean } | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!wallet || !slug) return;
    try {
      const [prog, lb] = await Promise.all([
        api.projects.progress(slug, wallet),
        api.projects.leaderboard(slug),
      ]);
      setData(prog as unknown as { project: SpecialProject; quests: QuestData[]; projectXp: number });
      setLeaderboard((lb.leaderboard || []) as unknown as LeaderboardRow[]);
    } catch {
      // project not found
    } finally {
      setLoading(false);
    }
  }, [wallet, slug]);

  useEffect(() => { load(); }, [load]);

  const handleClaim = async (quest: QuestData) => {
    if (!wallet) return;
    setClaiming(quest.slug);
    setClaimMsg(null);
    try {
      const payload: Record<string, string> = {};
      const input = inputs[quest.slug] || '';
      if (quest.quest_type === 'X_FOLLOW') payload.x_username = input.replace(/^@/, '');
      else if (quest.quest_type === 'PROJECT_SUBMIT') payload.project_url = input;
      else if (['X_MENTION', 'X_RETWEET', 'X_TWEET_KEYWORD'].includes(quest.quest_type)) payload.tweet_url = input;

      const res = await api.quests.claim(quest.slug, wallet, payload as any);
      setClaimMsg({ slug: quest.slug, text: res.message || 'Submitted!', ok: true });
      await load();
    } catch (err: unknown) {
      setClaimMsg({ slug: quest.slug, text: err instanceof Error ? err.message : 'Failed', ok: false });
    } finally {
      setClaiming(null);
    }
  };

  const needsInput = (q: QuestData) =>
    ['X_FOLLOW', 'X_MENTION', 'X_RETWEET', 'X_TWEET_KEYWORD', 'PROJECT_SUBMIT'].includes(q.quest_type);

  const inputPlaceholder = (q: QuestData) => {
    if (q.quest_type === 'X_FOLLOW') return '@yourhandle';
    if (q.quest_type === 'PROJECT_SUBMIT') return 'https://your-project.com';
    return 'https://x.com/...';
  };

  const inputValid = (q: QuestData) => {
    if (!needsInput(q)) return true;
    const val = (inputs[q.slug] || '').trim();
    if (q.quest_type === 'X_FOLLOW') return val.length > 0;
    if (q.quest_type === 'PROJECT_SUBMIT') return /^https?:\/\//i.test(val);
    return /^https?:\/\/(x\.com|twitter\.com)\//i.test(val);
  };

  if (!wallet) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-provn-muted">Connect your wallet to view this project.</p>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-provn-muted">Project not found.</p>
    </div>
  );

  const { project, quests, projectXp } = data;
  const completedCount = quests.filter(q => q.completed).length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6 px-4">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-xs text-provn-muted hover:text-provn-text transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      {/* Header */}
      <div className="bg-provn-surface border border-provn-border rounded-2xl overflow-hidden space-y-0">
        {/* Banner */}
        {project.banner_url && (
          <div className="w-full" style={{ aspectRatio: '3/1' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={project.banner_url} alt={project.title as string} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-6 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              {project.badge_label && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-400 uppercase tracking-wider">
                  {project.badge_label as string}
                </span>
              )}
              <h1 className="text-2xl font-bold">{project.title as string}</h1>
              <RichText text={project.description as string} className="text-sm text-provn-muted space-y-0.5" />
            </div>
            <div className="text-right flex-shrink-0 space-y-1">
              <div className="text-2xl font-bold text-violet-400">{projectXp}</div>
              <div className="text-xs text-provn-muted">Project XP</div>
              <div className="text-xs text-provn-muted">{completedCount}/{quests.length} quests</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quests */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-provn-muted uppercase tracking-wider">Quests</h2>
          {quests.length === 0 && (
            <div className="bg-provn-surface border border-provn-border rounded-xl p-8 text-center text-provn-muted text-sm">
              No quests available yet.
            </div>
          )}
          {quests.map(quest => (
            <div key={quest.slug} className={`relative bg-provn-surface border rounded-xl p-5 transition-all ${
              quest.completed ? 'border-emerald-500/30 bg-emerald-500/5'
              : quest.pendingSubmission ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-provn-border hover:border-provn-muted/30'
            }`}>
              <div className="absolute top-3 right-3"><StatusBadge quest={quest} /></div>

              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  quest.completed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-provn-bg text-provn-muted'
                }`}>
                  <QuestIcon icon={quest.icon} />
                </div>
                <div className="min-w-0 pr-20">
                  <h3 className="font-semibold text-sm">{quest.title}</h3>
                  <RichText text={quest.description} className="text-xs text-provn-muted mt-0.5 space-y-0.5" />
                </div>
              </div>

              {/* Input for quests that need it */}
              {needsInput(quest) && !quest.completed && !quest.pendingSubmission && (
                <input
                  type={quest.quest_type === 'PROJECT_SUBMIT' ? 'url' : 'text'}
                  value={inputs[quest.slug] || ''}
                  onChange={e => setInputs(p => ({ ...p, [quest.slug]: e.target.value }))}
                  placeholder={inputPlaceholder(quest)}
                  className="w-full mb-3 px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-xs focus:border-violet-500/50 focus:outline-none"
                />
              )}

              {claimMsg?.slug === quest.slug && (
                <p className={`text-xs mb-2 ${claimMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{claimMsg.text}</p>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-provn-border/50">
                <XpBadge amount={quest.seeds_reward} />
                {!quest.completed && !quest.pendingSubmission && quest.quest_type !== 'WELCOME' && (
                  <button
                    onClick={() => handleClaim(quest)}
                    disabled={claiming === quest.slug || !inputValid(quest)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {claiming === quest.slug
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Submitting</>
                      : needsInput(quest)
                      ? <>Submit <ArrowRight className="w-3 h-3" /></>
                      : <>Claim <ArrowRight className="w-3 h-3" /></>}
                  </button>
                )}
                {quest.pendingSubmission && (
                  <span className="text-xs text-amber-400">Awaiting review</span>
                )}
                {quest.completed && (
                  <span className="text-xs text-provn-muted">{quest.repeatable ? 'Resets Monday' : 'Completed'}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-provn-muted uppercase tracking-wider flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-violet-400" /> Leaderboard
          </h2>
          <div className="bg-provn-surface border border-provn-border rounded-xl overflow-hidden">
            {leaderboard.length === 0 ? (
              <div className="p-6 text-center text-xs text-provn-muted">No participants yet.</div>
            ) : (
              <div className="divide-y divide-provn-border/50">
                {leaderboard.slice(0, 20).map((row, i) => (
                  <div key={row.wallet as string} className={`flex items-center gap-3 px-4 py-3 ${
                    (row.wallet as string) === wallet ? 'bg-violet-500/5' : ''
                  }`}>
                    <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${
                      i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-provn-muted'
                    }`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">
                        {(row.display_name as string) || `${(row.wallet as string).slice(0,6)}…${(row.wallet as string).slice(-4)}`}
                        {(row.wallet as string) === wallet && <span className="ml-1 text-[9px] text-violet-400">(you)</span>}
                      </p>
                      <p className="text-[10px] text-provn-muted">{row.quests_completed as number} quests</p>
                    </div>
                    <span className="text-xs font-bold text-violet-400 flex-shrink-0">{row.total_xp as number} XP</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

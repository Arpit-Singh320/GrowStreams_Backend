'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { api } from '@/lib/growstreams-api';
import {
  Crown, Medal, Trophy, Sprout, Loader2, Search, Github,
  Flame, Sparkles, RefreshCw,
} from 'lucide-react';

interface LbRow {
  wallet: string;
  display_name: string;
  github_username: string;
  registered_at: string;
  total_xp: number;
  quests_completed: number;
  last_completed_at: string | null;
  onchain_xp?: number | null;
}

// Level system: every 200 XP = 1 level (Lv 1 = 0–199 XP, Lv 2 = 200–399, ...)
function calcLevel(xp: number) {
  return Math.max(1, Math.floor(xp / 200) + 1);
}

function levelTitle(level: number) {
  if (level >= 20) return 'LEGEND';
  if (level >= 15) return 'GOVERNOR';
  if (level >= 10) return 'ARCHITECT';
  if (level >= 5)  return 'BUILDER';
  if (level >= 3)  return 'CONTRIBUTOR';
  return 'SPROUT';
}

function levelColor(level: number) {
  if (level >= 20) return { text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/30' };
  if (level >= 15) return { text: 'text-amber-300',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30' };
  if (level >= 10) return { text: 'text-rose-300',    bg: 'bg-rose-500/15',    border: 'border-rose-500/30' };
  if (level >= 5)  return { text: 'text-sky-300',     bg: 'bg-sky-500/15',     border: 'border-sky-500/30' };
  if (level >= 3)  return { text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' };
  return { text: 'text-provn-muted', bg: 'bg-provn-bg', border: 'border-provn-border' };
}

// Deterministic avatar gradient from wallet hash
function avatarGradient(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 70% 55%), hsl(${hue2} 70% 45%))`;
}

function shortWallet(w: string) {
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

function rankBadge(rank: number) {
  if (rank === 1) return { icon: <Crown className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' };
  if (rank === 2) return { icon: <Medal className="w-4 h-4" />, color: 'text-gray-300',  bg: 'bg-gray-400/15 border-gray-400/30' };
  if (rank === 3) return { icon: <Medal className="w-4 h-4" />, color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' };
  return { icon: null, color: 'text-provn-muted', bg: '' };
}

// ─── Top Podium ─────────────────────────────────────────────────────────────
function Podium({ rows }: { rows: LbRow[] }) {
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) return null;
  // Order for display: 2nd, 1st, 3rd (1st in middle, slightly elevated)
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {podiumOrder.map((row) => {
        const rank = top3.indexOf(row) + 1;
        const lvl = calcLevel(row.total_xp);
        const color = levelColor(lvl);
        return (
          <div
            key={row.wallet}
            className={`relative rounded-2xl p-4 border-2 text-center ${
              rank === 1 ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent sm:-translate-y-2' :
              rank === 2 ? 'border-gray-400/40 bg-gradient-to-br from-gray-400/10 to-transparent' :
                           'border-orange-500/40 bg-gradient-to-br from-orange-500/10 to-transparent'
            }`}
          >
            {rank === 1 && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-amber-950 shadow-lg">
                <Crown className="w-3 h-3" /> CHAMPION
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full ring-2 ring-provn-bg shadow-md flex items-center justify-center text-white font-bold text-lg"
                style={{ background: avatarGradient(row.wallet) }}
              >
                {(row.display_name || row.github_username || row.wallet).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 w-full">
                <p className="font-bold text-sm truncate">
                  {row.display_name || row.github_username || shortWallet(row.wallet)}
                </p>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 rounded text-[9px] font-bold ${color.bg} ${color.text} border ${color.border}`}>
                  Lv {lvl} · {levelTitle(lvl)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-emerald-400 font-bold">
                <Sprout className="w-4 h-4" />{(row.onchain_xp ?? row.total_xp).toLocaleString()} XP
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Leaderboard Row ────────────────────────────────────────────────────────
function Row({
  row,
  rank,
  isMe,
}: {
  row: LbRow;
  rank: number;
  isMe: boolean;
}) {
  const lvl = calcLevel(row.total_xp);
  const lvlNext = lvl + 1;
  const xpInLevel = row.total_xp % 200;
  const pct = Math.round((xpInLevel / 200) * 100);
  const color = levelColor(lvl);
  const badge = rankBadge(rank);

  // Streak proxy: days since last completion
  const daysSinceLast = row.last_completed_at
    ? Math.max(0, Math.floor((Date.now() - new Date(row.last_completed_at).getTime()) / 86400000))
    : null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-provn-border/40 last:border-b-0 transition-colors ${
        isMe ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'hover:bg-provn-bg/40'
      }`}
    >
      {/* Rank */}
      <div className={`w-9 flex-shrink-0 flex items-center justify-center ${badge.color}`}>
        {badge.icon ? (
          <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${badge.bg}`}>
            {badge.icon}
          </div>
        ) : (
          <span className="text-sm font-mono text-provn-muted">{rank}</span>
        )}
      </div>

      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
        style={{ background: avatarGradient(row.wallet) }}
      >
        {(row.display_name || row.github_username || row.wallet).slice(0, 2).toUpperCase()}
      </div>

      {/* Identity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm truncate">
            {row.display_name || row.github_username || shortWallet(row.wallet)}
          </p>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${color.text}`}>
            {levelTitle(lvl)}
          </span>
          {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">YOU</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-provn-muted">
          {row.github_username && (
            <span className="inline-flex items-center gap-1">
              <Github className="w-3 h-3" /> {row.github_username}
            </span>
          )}
          <span className="font-mono">{shortWallet(row.wallet)}</span>
        </div>
      </div>

      {/* Level + XP bar */}
      <div className="hidden sm:flex flex-col items-end w-32 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs">
          <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${color.bg} ${color.text} border ${color.border}`}>
            Lv {lvl}
          </span>
          <span className="text-emerald-400 font-bold">
            {(row.onchain_xp ?? row.total_xp).toLocaleString()}
          </span>
          <Sprout className="w-3 h-3 text-emerald-400" />
          {row.onchain_xp !== null && row.onchain_xp !== undefined && (
            <span className="text-[9px] text-provn-muted">on-chain</span>
          )}
        </div>
        <div className="w-full h-1 bg-provn-bg rounded-full mt-1 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[9px] text-provn-muted mt-0.5">{xpInLevel}/200 to Lv {lvlNext}</p>
      </div>

      {/* Compact XP for mobile */}
      <div className="sm:hidden flex flex-col items-end flex-shrink-0">
        <div className="flex items-center gap-1 text-emerald-400 font-bold text-xs">
          <Sprout className="w-3 h-3" />
          {(row.onchain_xp ?? row.total_xp).toLocaleString()}
        </div>
        <span className={`text-[9px] font-bold ${color.text}`}>Lv {lvl}</span>
      </div>

      {/* Quests + streak */}
      <div className="hidden md:flex items-center gap-3 flex-shrink-0 text-[11px] text-provn-muted">
        <div className="flex items-center gap-1">
          <Trophy className="w-3 h-3 text-amber-400" />
          <span className="text-provn-text font-medium">{row.quests_completed}</span>
        </div>
        {daysSinceLast !== null && daysSinceLast <= 7 && (
          <div className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-orange-400" />
            <span className="text-provn-text font-medium">{daysSinceLast === 0 ? 'today' : `${daysSinceLast}d`}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function LeaderboardPage() {
  const { account } = useAccount();
  const myWallet = account?.decodedAddress || '';

  const [rows, setRows] = useState<LbRow[]>([]);
  const [onchainTotal, setOnchainTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.quests.leaderboard();
      setRows(res.leaderboard);
      if (res.onchain_total_xp !== null && res.onchain_total_xp !== undefined) {
        setOnchainTotal(res.onchain_total_xp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.wallet.toLowerCase().includes(q) ||
      r.display_name?.toLowerCase().includes(q) ||
      r.github_username?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const totalXP = rows.reduce((s, r) => s + r.total_xp, 0);
    const totalCompletions = rows.reduce((s, r) => s + r.quests_completed, 0);
    return { totalXP, totalCompletions, totalUsers: rows.length };
  }, [rows]);

  const myRank = useMemo(() => {
    if (!myWallet) return null;
    const idx = rows.findIndex(r => r.wallet === myWallet);
    return idx === -1 ? null : idx + 1;
  }, [rows, myWallet]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-500/10 via-provn-surface to-amber-500/5 border border-emerald-500/20 rounded-2xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            Quest XP Leaderboard
            <Sparkles className="w-4 h-4 text-amber-400" />
          </h1>
          <p className="text-xs text-provn-muted mt-0.5">
            All invite-code-registered builders ranked by on-chain XP minted on VARA Network.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-provn-surface border border-provn-border hover:border-provn-muted/40 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-provn-surface border border-provn-border rounded-xl p-3 text-center">
          <p className="text-xs text-provn-muted">Builders</p>
          <p className="text-2xl font-bold mt-0.5">{totals.totalUsers}</p>
        </div>
        <div className="bg-provn-surface border border-provn-border rounded-xl p-3 text-center">
          <p className="text-xs text-provn-muted">XP Minted</p>
          <p className="text-2xl font-bold text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
            <Sprout className="w-4 h-4" />
            {(onchainTotal ?? totals.totalXP).toLocaleString()}
          </p>
          {onchainTotal !== null && <p className="text-[10px] text-provn-muted mt-0.5">on-chain</p>}
        </div>
        <div className="bg-provn-surface border border-provn-border rounded-xl p-3 text-center">
          <p className="text-xs text-provn-muted">Completions</p>
          <p className="text-2xl font-bold text-amber-400 mt-0.5 flex items-center justify-center gap-1">
            <Trophy className="w-4 h-4" />
            {totals.totalCompletions}
          </p>
        </div>
      </div>

      {/* Podium */}
      {!loading && rows.length > 0 && <Podium rows={rows} />}

      {/* Your rank pill */}
      {myRank && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2 flex items-center justify-between text-sm">
          <span className="text-provn-muted">Your rank</span>
          <span className="font-bold text-emerald-400">
            #{myRank} of {rows.length}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-provn-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by handle, GitHub, or wallet..."
          className="w-full pl-9 pr-4 py-2.5 bg-provn-surface border border-provn-border rounded-lg text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-provn-muted/50"
        />
      </div>

      {/* Table */}
      <div className="bg-provn-surface border border-provn-border rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-provn-border bg-provn-bg/30 flex items-center text-[10px] uppercase tracking-wider text-provn-muted font-semibold">
          <span className="w-9 text-center">#</span>
          <span className="w-10 ml-3">User</span>
          <span className="flex-1 ml-3">Builder</span>
          <span className="hidden sm:block w-32 text-right">Level / XP</span>
          <span className="hidden md:block ml-3">Quests · Streak</span>
        </div>
        {loading && rows.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        )}
        {error && (
          <p className="text-red-400 text-sm px-4 py-3">{error}</p>
        )}
        {!loading && filtered.length === 0 && !error && (
          <p className="text-center text-provn-muted text-sm py-12">
            {search ? 'No builders match your search.' : 'No builders yet — be the first to claim a quest!'}
          </p>
        )}
        {filtered.map((row) => {
          const rank = rows.findIndex(r => r.wallet === row.wallet) + 1;
          return (
            <Row
              key={row.wallet}
              row={row}
              rank={rank}
              isMe={row.wallet === myWallet}
            />
          );
        })}
      </div>

      <p className="text-center text-[10px] text-provn-muted">
        XP is minted on-chain on VARA Network · 200 XP = 1 Level · Updated in real-time
      </p>
    </div>
  );
}


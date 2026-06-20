"use client"

import React, { useState, useEffect } from "react"
import {
  DollarSign, Users, Activity, BarChart3, ExternalLink, Loader2, AlertCircle,
  Layers, Coins, Award, Network,
} from "lucide-react"
import { api } from "@/lib/growstreams-api"
import { NavigationV2 } from "@/components/v2/navigation-v2"
import { FooterV2 } from "@/components/v2/footer-v2"
import { GradientText } from "@/components/v2/gradient-text"
import {
  Card, KpiCard, SectionTitle, ExplorerLink, formatUsd, formatNumber, formatTimestamp, shortHash,
} from "@/components/analytics/shared"
import { TimeSeriesChart, type SeriesPoint } from "@/components/analytics/TimeSeriesChart"
import { TransactionsTable } from "@/components/analytics/TransactionsTable"
import { WalletsTable } from "@/components/analytics/WalletsTable"

type TabId = "overview" | "onchain" | "platform" | "transactions" | "wallets"

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "onchain", label: "On-chain", icon: Coins },
  { id: "platform", label: "Platform", icon: Users },
  { id: "transactions", label: "Transactions", icon: Activity },
  { id: "wallets", label: "Wallets", icon: Network },
]

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<any>(null)
  const [tvlHistory, setTvlHistory] = useState<any[]>([])
  const [activityHistory, setActivityHistory] = useState<any[]>([])
  const [explorerLinks, setExplorerLinks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>("overview")

  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true)
        const [s, tvlH, actH, links] = await Promise.all([
          api.analytics.summary(30),
          api.analytics.tvlHistory(30),
          api.analytics.activityHistory(30),
          api.analytics.explorerLinks(),
        ])
        setSummary(s)
        setTvlHistory(tvlH.points || [])
        setActivityHistory(actH.points || [])
        setExplorerLinks(links.links || [])
        setError(null)
      } catch (err) {
        console.error("Failed to fetch analytics:", err)
        setError("Failed to load analytics data")
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
    const interval = setInterval(fetchAll, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <NavigationV2 />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-12 h-12 animate-spin text-emerald-400" />
        </div>
        <FooterV2 />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-black text-white">
        <NavigationV2 />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-gray-400">{error || "No data available"}</p>
          </div>
        </div>
        <FooterV2 />
      </div>
    )
  }

  const kpis = summary.kpis || {}
  const onchain = summary.onchain || {}
  const platform = summary.platform || {}

  // Build chart series from history.
  const tvlSeries: SeriesPoint[] = tvlHistory.map((p) => ({ date: p.date, value: Number(p.tvl_usd || 0) }))
  const volumeSeries: SeriesPoint[] = activityHistory.map((p) => ({ date: p.date, value: Number(p.onchain_volume_usd || 0) }))
  const walletSeries: SeriesPoint[] = activityHistory.map((p) => ({ date: p.date, value: Number(p.onchain_unique_wallets || 0) }))
  const mauSeries: SeriesPoint[] = activityHistory.map((p) => ({ date: p.date, value: Number(p.onchain_mau || 0) }))

  return (
    <div className="min-h-screen bg-black text-white">
      <NavigationV2 />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">
            <GradientText>Protocol Analytics</GradientText>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Real-time, on-chain-verifiable metrics for GrowStreams on Vara Network
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-10 border-b border-white/10 pb-4">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* ── Overview ─────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard icon={DollarSign} label="TVL (USD)" value={formatUsd(kpis.tvlUsd)} sublabel="Live on-chain vault balances" />
              <KpiCard icon={BarChart3} label="Streaming Volume" value={formatUsd(kpis.onchainVolumeUsd)} sublabel={`${formatNumber(kpis.totalStreams)} streams`} />
              <KpiCard icon={Users} label="On-chain Wallets" value={formatNumber(kpis.onchainActiveWallets)} sublabel={`MAU ${formatNumber(kpis.onchainMau)} · DAU ${formatNumber(kpis.onchainDau)}`} />
              <KpiCard icon={Award} label="Platform Users" value={formatNumber(kpis.totalDistinctWallets)} sublabel={`${formatNumber(kpis.questParticipants)} quest participants`} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TimeSeriesChart title="TVL" subtitle="Total value locked (USD), daily" data={tvlSeries} valuePrefix="$" />
              <TimeSeriesChart title="Streaming Volume" subtitle="Cumulative streamed value (USD), daily" data={volumeSeries} valuePrefix="$" color="#60a5fa" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TimeSeriesChart title="Unique On-chain Wallets" subtitle="Distinct wallets with on-chain activity" data={walletSeries} color="#a78bfa" />
              <TimeSeriesChart title="Monthly Active Users" subtitle="30-day trailing on-chain MAU" data={mauSeries} color="#fbbf24" />
            </div>
          </div>
        )}

        {/* ── On-chain ─────────────────────────────────────────── */}
        {tab === "onchain" && (
          <div className="space-y-10">
            <SectionTitle title="On-chain (DeFi)" subtitle="Source of truth: Vara mainnet. Volume/wallets reconstructed from StreamCore state." />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard label="TVL" value={formatUsd(kpis.tvlUsd)} />
              <KpiCard label="Total Streams" value={formatNumber(kpis.totalStreams)} sublabel={`${formatNumber(kpis.activeStreams)} active`} />
              <KpiCard label="Streaming Volume" value={formatUsd(kpis.onchainVolumeUsd)} />
              <KpiCard label="Stream Wallets" value={formatNumber(kpis.uniqueStreamWallets)} sublabel="created/received streams" />
            </div>

            {/* TVL by token */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">TVL by Token</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-white/10">
                      <th className="px-3 py-2 font-medium">Token</th>
                      <th className="px-3 py-2 font-medium">Balance</th>
                      <th className="px-3 py-2 font-medium">Price</th>
                      <th className="px-3 py-2 font-medium">USD</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.tvl?.tokens || []).map((t: any) => (
                      <tr key={t.key} className="border-b border-white/5">
                        <td className="px-3 py-2 text-white">{t.symbol}</td>
                        <td className="px-3 py-2 text-gray-300">{formatNumber(t.balanceDisplay)}</td>
                        <td className="px-3 py-2 text-gray-400">{t.price != null ? `$${t.price}` : "—"}</td>
                        <td className="px-3 py-2 text-gray-300">{formatUsd(t.estimatedUsd)}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs ${t.deployed === false ? "text-amber-400" : "text-emerald-400"}`}>
                            {t.deployed === false ? "not deployed" : t.pricingSource || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Contracts with explorer links (REQ 1) */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Contracts (verifiable on-chain)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {explorerLinks.map((c: any) => (
                  <div key={c.key} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div>
                      <div className="text-white text-sm font-medium">{c.name}</div>
                      <div className="text-gray-500 font-mono text-xs">{shortHash(c.address, 10, 8)}</div>
                    </div>
                    <a href={c.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── Platform ─────────────────────────────────────────── */}
        {tab === "platform" && (
          <div className="space-y-10">
            <SectionTitle title="Platform (off-chain)" subtitle="GrowStreams app activity: users, quests, campaigns, engagement." />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard icon={Users} label="Total Distinct Wallets" value={formatNumber(platform.users?.totalDistinctWallets)} sublabel="all systems, deduped" />
              <KpiCard label="Quest Participants" value={formatNumber(platform.users?.bySystem?.questParticipants)} />
              <KpiCard label="App (Campaign) Users" value={formatNumber(platform.users?.bySystem?.campaignUsers)} />
              <KpiCard label="Contributors" value={formatNumber(platform.users?.bySystem?.contributors)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <MetricBlock title="Quests" icon={Award} metrics={[
                ["Registrations", formatNumber(platform.quests?.registrations)],
                ["Completions", formatNumber(platform.quests?.completions)],
                ["XP / Seeds distributed", formatNumber(platform.quests?.seedsDistributed)],
                ["Active quests", `${formatNumber(platform.quests?.activeQuests)} / ${formatNumber(platform.quests?.totalQuests)}`],
              ]} />
              <MetricBlock title="Campaigns" icon={Layers} metrics={[
                ["Participants", formatNumber(platform.campaigns?.participants)],
                ["Payouts", formatNumber(platform.campaigns?.payouts)],
                ["Active", `${formatNumber(platform.campaigns?.activeCampaigns)} / ${formatNumber(platform.campaigns?.totalCampaigns)}`],
                ["Likes", formatNumber(platform.campaigns?.likes)],
              ]} />
              <MetricBlock title="Engagement" icon={Activity} metrics={[
                ["Invites created", formatNumber(platform.engagement?.invitesCreated)],
                ["Invites used", formatNumber(platform.engagement?.invitesUsed)],
                ["Referrals", formatNumber(platform.engagement?.referrals)],
                ["Vouchers issued", formatNumber(platform.engagement?.vouchersIssued)],
              ]} />
            </div>
          </div>
        )}

        {tab === "transactions" && <TransactionsTable />}
        {tab === "wallets" && <WalletsTable />}

        {/* Coverage notes footer */}
        {summary.coverage?.notes && (
          <div className="mt-12 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Methodology & Coverage</h4>
            <ul className="text-xs text-gray-500 space-y-1">
              {summary.coverage.notes.map((n: string, i: number) => <li key={i}>• {n}</li>)}
            </ul>
            <p className="text-xs text-gray-600 mt-3">Last updated: {formatTimestamp(summary.freshness?.lastUpdatedAt)}</p>
          </div>
        )}
      </main>
      <FooterV2 />
    </div>
  )
}

function MetricBlock({
  title, icon: Icon, metrics,
}: { title: string; icon: React.ComponentType<{ className?: string }>; metrics: [string, string][] }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-emerald-400" />
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      <div className="space-y-2">
        {metrics.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-gray-400">{label}</span>
            <span className="text-white font-medium">{value}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

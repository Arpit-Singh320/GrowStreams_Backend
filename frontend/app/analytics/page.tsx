"use client"

import React, { useState, useEffect } from "react"
import {
  DollarSign, Users, Activity, BarChart3, ExternalLink, Loader2, AlertCircle,
  Layers, Coins, Award, Network, Percent, Repeat,
} from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { api } from "@/lib/growstreams-api"
import { NavigationV2 } from "@/components/v2/navigation-v2"
import { FooterV2 } from "@/components/v2/footer-v2"
import { GradientText } from "@/components/v2/gradient-text"
import {
  Card, KpiCard, SectionTitle, formatUsd, formatNumber, formatTimestamp, shortHash,
} from "@/components/analytics/shared"
import { TransactionsTable } from "@/components/analytics/TransactionsTable"
import { WalletsTable } from "@/components/analytics/WalletsTable"

type TabId = "overview" | "onchain" | "platform" | "transactions" | "wallets"
type ChartRangeId = "24h" | "7d" | "30d"
type ChartPoint = {
  label: string
  value: number
}

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "onchain", label: "On-chain", icon: Coins },
  { id: "platform", label: "Platform", icon: Users },
  { id: "transactions", label: "Transactions", icon: Activity },
  { id: "wallets", label: "Wallets", icon: Network },
]
const CHART_RANGES: ChartRangeId[] = ["24h", "7d", "30d"]

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<any>(null)
  const [tvlHistory, setTvlHistory] = useState<any[]>([])
  const [activityHistory, setActivityHistory] = useState<any[]>([])
  const [hourlyHistory, setHourlyHistory] = useState<any[]>([])
  const [explorerLinks, setExplorerLinks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>("overview")
  const [chartRange, setChartRange] = useState<ChartRangeId>("30d")

  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true)
        const [s, tvlH, actH, hourH, links] = await Promise.all([
          api.analytics.summary(30),
          api.analytics.tvlHistory(30),
          api.analytics.activityHistory(30),
          api.analytics.history(24),
          api.analytics.explorerLinks(),
        ])
        setSummary(s)
        setTvlHistory(tvlH.points || [])
        setActivityHistory(actH.points || [])
        setHourlyHistory(hourH.snapshots || [])
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
  const fees = onchain.fees || {}
  const retention = onchain.retention || {}

  const numberValue = (value: unknown) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const formatUsdPrecise = (value: number | string | undefined | null) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0)
    if (!Number.isFinite(parsed)) return "$0"
    const abs = Math.abs(parsed)
    const maximumFractionDigits = abs > 0 && abs < 1 ? 4 : 2
    return `$${parsed.toLocaleString(undefined, { maximumFractionDigits })}`
  }
  const formatPrice = (value: number | string | undefined | null) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0)
    if (!Number.isFinite(parsed)) return "—"
    return `$${parsed.toLocaleString(undefined, { maximumFractionDigits: 8, minimumFractionDigits: parsed > 0 && parsed < 1 ? 4 : 2 })}`
  }
  const sliceDailySeries = (series: ChartPoint[], range: ChartRangeId) => {
    if (range === "7d") return series.slice(-7)
    return series.slice(-30)
  }
  const tvlDailySeries: ChartPoint[] = tvlHistory.map((p) => ({ label: p.date, value: numberValue(p.tvl_usd) }))
  const volumeDailySeries: ChartPoint[] = activityHistory.map((p) => ({ label: p.date, value: numberValue(p.onchain_volume_usd) }))
  const streamsDailySeries: ChartPoint[] = activityHistory.map((p) => ({ label: p.date, value: numberValue(p.total_streams) }))
  const mauDailySeries: ChartPoint[] = activityHistory.map((p) => ({ label: p.date, value: numberValue(p.onchain_mau) }))
  const dauDailySeries: ChartPoint[] = activityHistory.map((p) => ({ label: p.date, value: numberValue(p.onchain_dau) }))
  const hourlyTvlSeries: ChartPoint[] = hourlyHistory
    .filter((p) => numberValue(p.estimated_tvl_usd) > 0)
    .map((p) => ({ label: p.snapped_at, value: numberValue(p.estimated_tvl_usd) }))
  const _hourlyVolAll: ChartPoint[] = hourlyHistory.map((p) => ({
    label: p.snapped_at,
    value: numberValue(p.volume_24h_usd),
  }))
  const _lastVol = [..._hourlyVolAll].reverse().find((p) => p.value > 0)?.value ?? 0
  const hourlyVolumeSeries: ChartPoint[] = _lastVol > 0
    ? _hourlyVolAll.filter((p) => p.value >= _lastVol * 0.05 && p.value <= _lastVol * 50)
    : _hourlyVolAll
  const hourlyStreamsSeries: ChartPoint[] = hourlyHistory.map((p) => ({ label: p.snapped_at, value: numberValue(p.total_streams) }))
  const selectedTvlSeries = chartRange === "24h" ? hourlyTvlSeries : sliceDailySeries(tvlDailySeries, chartRange)
  const selectedVolumeSeries = chartRange === "24h" ? hourlyVolumeSeries : sliceDailySeries(volumeDailySeries, chartRange)
  const selectedStreamsSeries = chartRange === "24h" ? hourlyStreamsSeries : sliceDailySeries(streamsDailySeries, chartRange)
  const selectedMauSeries = chartRange === "24h" ? mauDailySeries.slice(-2) : sliceDailySeries(mauDailySeries, chartRange)
  const varaPrice = numberValue(summary?.onchain?.tvl?.pricing?.varaPriceUsd)
  const _feeFallback = (fees.byToken || []).reduce((acc: number, t: any) => {
    const price = numberValue(t.price) || varaPrice
    return acc + numberValue(t.amountDisplay) * price
  }, 0)
  const _feeTotal = numberValue(fees.totalFeesUsd) > 0 ? numberValue(fees.totalFeesUsd) : _feeFallback
  const _fee24h = numberValue(fees.last24hUsd) > 0 ? numberValue(fees.last24hUsd)
    : (numberValue(fees.last24hEvents) / Math.max(numberValue(fees.totalEvents), 1)) * _feeTotal
  const _fee7d = numberValue(fees.last7dUsd) > 0 ? numberValue(fees.last7dUsd) : _feeTotal
  const _fee30d = numberValue(fees.last30dUsd) > 0 ? numberValue(fees.last30dUsd) : _feeTotal
  const feeSeries: ChartPoint[] = [
    { label: "24h", value: _fee24h },
    { label: "7d", value: _fee7d },
    { label: "30d", value: _fee30d },
  ]
  const feeHourlySeries: ChartPoint[] = (fees.hourlySeries || []).map((p: any) => ({
    label: p.snapped_at,
    value: numberValue(p.fee_usd),
  }))
  const feeDailySeries: ChartPoint[] = (fees.dailySeries || []).map((p: any) => ({
    label: p.date,
    value: numberValue(p.fee_usd),
  }))
  const selectedFeeSeries: ChartPoint[] = fees.hourlySeries
    ? chartRange === "24h"
      ? feeHourlySeries
      : chartRange === "7d"
      ? feeDailySeries.slice(-7)
      : feeDailySeries
    : feeSeries

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
              <KpiCard icon={DollarSign} label="TVL (USD)" value={formatUsdPrecise(kpis.tvlUsd)} sublabel="Live on-chain vault balances" />
              <KpiCard icon={BarChart3} label="Streaming Volume" value={formatUsdPrecise(kpis.onchainVolumeUsd)} sublabel={`${formatNumber(kpis.totalStreams)} streams`} />
              <KpiCard icon={Users} label="MAU" value={formatNumber(kpis.onchainMau)} sublabel="30-day trailing on-chain users" />
              <KpiCard icon={Activity} label="Total Streams" value={formatNumber(kpis.totalStreams)} sublabel={`${formatNumber(kpis.activeStreams)} active`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard icon={Percent} label="Protocol Fees (USD)" value={formatUsdPrecise(_feeTotal)} sublabel={`${fees.feePercent ?? 2.5}% entry fee · all-time`} />
              <KpiCard icon={DollarSign} label="Fees (30d)" value={formatUsdPrecise(_fee30d)} sublabel={`24h ${formatUsdPrecise(_fee24h)}`} />
              <KpiCard icon={Users} label="Platform Users" value={formatNumber(kpis.totalDistinctWallets)} sublabel={`${formatNumber(kpis.questParticipants)} quest participants`} />
              <KpiCard icon={Activity} label="On-chain DAU" value={formatNumber(kpis.onchainDau)} sublabel={`MAU ${formatNumber(kpis.onchainMau)}`} />
            </div>
            <Card className="p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">Protocol Charts</h3>
                  <p className="text-sm text-gray-400">Switch between 24h, 7d, and 30d for TVL, volume, streams, and fees.</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-1">
                  {CHART_RANGES.map((range) => (
                    <button
                      key={range}
                      onClick={() => setChartRange(range)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        chartRange === range ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <AnalyticsAreaChart title="TVL (USD)" subtitle={chartRange === "24h" ? "Hourly snapshots for the last 24h" : `Daily snapshots for the last ${chartRange}`} data={selectedTvlSeries} valuePrefix="$" />
                <AnalyticsAreaChart title="Streaming Volume" subtitle={chartRange === "24h" ? "Rolling 24h volume by hourly snapshot" : `Daily volume for the last ${chartRange}`} data={selectedVolumeSeries} valuePrefix="$" color="#60a5fa" />
                <AnalyticsAreaChart title="Total Streams" subtitle={chartRange === "24h" ? "Hourly stream counts for the last 24h" : `Daily stream counts for the last ${chartRange}`} data={selectedStreamsSeries} color="#a78bfa" />
                <AnalyticsAreaChart title="Protocol Fees" subtitle={chartRange === "24h" ? "Hourly fee revenue for the last 24h" : `Daily fee revenue for the last ${chartRange}`} data={selectedFeeSeries} color="#fb7185" valuePrefix="$" valueDecimals={4} />
              </div>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AnalyticsAreaChart title="On-chain DAU" subtitle="Daily active on-chain wallets" data={dauDailySeries.slice(-30)} color="#34d399" />
              <AnalyticsAreaChart title="MAU" subtitle="Monthly active on-chain wallets (30d)" data={mauDailySeries.slice(-30)} color="#fbbf24" />
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

            {/* Protocol fee revenue (2.5% entry fee, on-chain FeeCollected events) */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Protocol Fee Revenue</h3>
                <span className="text-xs text-gray-500">{fees.feePercent ?? 2.5}% entry fee · vault/native paths</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <KpiCard label="Total (USD)" value={formatUsdPrecise(fees.totalFeesUsd)} />
                <KpiCard label="30d" value={formatUsdPrecise(fees.last30dUsd)} />
                <KpiCard label="7d" value={formatUsdPrecise(fees.last7dUsd)} />
                <KpiCard label="24h" value={formatUsdPrecise(fees.last24hUsd)} />
              </div>
              <div className="mb-6">
                <AnalyticsAreaChart title="Fees Window Trend" subtitle="Current aggregated fee windows" data={feeSeries} color="#fb7185" valuePrefix="$" valueDecimals={4} height={220} />
              </div>
              {fees.byToken && fees.byToken.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-white/10">
                        <th className="px-3 py-2 font-medium">Token</th>
                        <th className="px-3 py-2 font-medium">Fees Collected</th>
                        <th className="px-3 py-2 font-medium">Price</th>
                        <th className="px-3 py-2 font-medium">USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fees.byToken.map((t: any) => (
                        <tr key={t.symbol} className="border-b border-white/5">
                          <td className="px-3 py-2 text-white">{t.symbol}</td>
                          <td className="px-3 py-2 text-gray-300">{formatNumber(t.amountDisplay)}</td>
                          <td className="px-3 py-2 text-gray-400">{formatPrice(t.price)}</td>
                          <td className="px-3 py-2 text-gray-300">{formatUsdPrecise(t.feesUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No protocol fees collected yet. Fees accrue on new streams created on the fee-bearing contracts.</p>
              )}
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

            {/* Retention cohorts (30-day, on-chain first-seen) */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-lg font-semibold text-white">Retention ({retention.windowDays ?? 30}-day)</h3>
                </div>
                <span className="text-2xl font-bold text-emerald-300">{formatNumber(retention.retentionRate)}%</span>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Share of wallets that return for more on-chain activity 24h–{retention.windowDays ?? 30}d after their first stream/vault action.
              </p>
              {retention.cohorts && retention.cohorts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-white/10">
                        <th className="px-3 py-2 font-medium">Cohort (week)</th>
                        <th className="px-3 py-2 font-medium">Wallets</th>
                        <th className="px-3 py-2 font-medium">Retained</th>
                        <th className="px-3 py-2 font-medium">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retention.cohorts.map((c: any) => (
                        <tr key={c.cohortWeek} className="border-b border-white/5">
                          <td className="px-3 py-2 text-gray-300">{formatTimestamp(c.cohortWeek)?.slice(0, 10) || c.cohortWeek}</td>
                          <td className="px-3 py-2 text-gray-300">{formatNumber(c.cohortSize)}</td>
                          <td className="px-3 py-2 text-gray-300">{formatNumber(c.retainedCount)}</td>
                          <td className="px-3 py-2 text-emerald-300 font-medium">{formatNumber(c.retentionRate)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Not enough on-chain history yet to compute completed retention cohorts.</p>
              )}
            </Card>
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

 function formatChartLabel(label: string) {
  const parsed = new Date(label)
  if (!Number.isNaN(parsed.getTime())) {
    if (label.includes("T")) {
      // Midnight UTC timestamps are daily snapshots — show date, not time
      if (parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0) {
        return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      }
      return parsed.toLocaleTimeString(undefined, { hour: "numeric" })
    }
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }
  return label
 }

 function formatChartValue(value: number, valuePrefix = "", valueSuffix = "", valueDecimals = 2) {
  return `${valuePrefix}${(value || 0).toLocaleString(undefined, { maximumFractionDigits: valueDecimals })}${valueSuffix}`
 }

 function AnalyticsAreaChart({
  title,
  subtitle,
  data,
  color = "#34d399",
  valuePrefix = "",
  valueSuffix = "",
  valueDecimals = 2,
  height = 260,
 }: {
  title: string
  subtitle?: string
  data: ChartPoint[]
  color?: string
  valuePrefix?: string
  valueSuffix?: string
  valueDecimals?: number
  height?: number
 }) {
  const hasData = data && data.length > 0

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {subtitle ? <p className="text-sm text-gray-400">{subtitle}</p> : null}
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${title.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tickFormatter={formatChartLabel} stroke="#6b7280" fontSize={11} />
            <YAxis tickFormatter={(v) => formatChartValue(Number(v), valuePrefix, valueSuffix, valueDecimals)} stroke="#6b7280" fontSize={11} width={80} />
            <Tooltip
              contentStyle={{ background: "#0b0b0f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
              labelStyle={{ color: "#9ca3af" }}
              labelFormatter={(label) => formatChartLabel(String(label))}
              formatter={((value: unknown) => [formatChartValue(Number(value), valuePrefix, valueSuffix, valueDecimals), title]) as never}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#grad-${title.replace(/\s/g, "")})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center text-gray-500 text-sm" style={{ height }}>
          No historical data yet.
        </div>
      )}
    </Card>
  )
 }

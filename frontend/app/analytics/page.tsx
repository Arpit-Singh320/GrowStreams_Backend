"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  DollarSign,
  Users,
  Activity,
  ExternalLink,
  BarChart3,
  Clock,
  Shield,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import {
  api,
  type AnalyticsSummaryResponse,
  type AnalyticsTvlHistoryPoint,
  type AnalyticsVolumeHistoryPoint,
} from '@/lib/growstreams-api'
import { NavigationV2 } from "@/components/v2/navigation-v2"
import { FooterV2 } from "@/components/v2/footer-v2"
import { GradientText } from "@/components/v2/gradient-text"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
}

function formatUsd(value: number | undefined) {
  return `$${(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString()
}

function VolumeSourceCard({
  title,
  value,
  description,
  icon,
}: {
  title: string
  value: string
  description: string
  icon: string
}) {
  return (
    <div className="p-6 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center">
          <Activity className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h4 className="text-white font-semibold">{title}</h4>
          <p className="text-xs text-gray-500">{icon}</p>
        </div>
      </div>
      <div className="mb-2">
        <div className="text-2xl font-bold text-white">{value}</div>
      </div>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  )
}

function ExpandableSection({
  title,
  description,
  isExpanded,
  onToggle,
  children,
  custom,
}: {
  title: string
  description: string
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
  custom?: number
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      custom={custom}
      className="mb-12 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full p-6 border-b border-white/10 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
      >
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      )}
    </motion.div>
  )
}

function buildPath(points: number[], width: number, height: number) {
  if (points.length === 0) return ''
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = Math.max(max - min, 1)

  return points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
      const y = height - ((point - min) / range) * height
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummaryResponse | null>(null)
  const [tvlHistory, setTvlHistory] = useState<AnalyticsTvlHistoryPoint[]>([])
  const [volumeHistory, setVolumeHistory] = useState<AnalyticsVolumeHistoryPoint[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [wallets, setWallets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [txPage, setTxPage] = useState(1)
  const [walletPage, setWalletPage] = useState(1)
  const itemsPerPage = 10
  const [expandedSections, setExpandedSections] = useState({
    tvl: false,
    volume: false,
    walletActivity: false,
    contracts: false,
    transactions: false,
    wallets: false,
  })

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setLoading(true)
        const [summary, tvl, volume, txData, walletData] = await Promise.all([
          api.analytics.summary(30),
          api.analytics.tvlHistory(30),
          api.analytics.volumeHistory(30),
          api.analytics.transactions(50),
          api.analytics.wallets(50),
        ])
        setData(summary)
        setTvlHistory(tvl.points)
        setVolumeHistory(volume.points)
        setTransactions(txData.transactions || [])
        setWallets(walletData.wallets || [])
        setError(null)
      } catch (err) {
        console.error('Failed to fetch analytics:', err)
        setError('Failed to load analytics data')
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
    // Refresh every 5 minutes
    const interval = setInterval(fetchAnalytics, 5 * 60 * 1000)
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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black text-white">
        <NavigationV2 />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-gray-400">{error || 'No data available'}</p>
          </div>
        </div>
        <FooterV2 />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <NavigationV2 />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0}
          className="text-center mb-16"
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-4">
            <GradientText>Protocol Analytics</GradientText>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Real-time KPI metrics for GrowStreams on Vara Network
          </p>
        </motion.div>

        {/* Coverage Notice */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={1}
          className="mb-12 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20"
        >
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-400 mb-1">Data Coverage Notes</h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• <strong>TVL:</strong> On-chain vault balances (authoritative). Pricing: {data.tvl.pricing.coverage} via {data.tvl.pricing.source}</li>
                <li>• <strong>Activity:</strong> On-chain event indexing (authoritative). Captures payload-signed transactions via {data.activity.source}</li>
                <li>• <strong>Volume:</strong> Stablecoin withdrawals only (partial coverage). Non-stablecoin volume not yet priced</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <KPICard
            icon={DollarSign}
            label="TVL (USD)"
            value={formatUsd(data.kpis?.tvlUsd ?? data.tvl.totals.estimatedUsd)}
            sublabel={`Stablecoins priced via ${data.tvl.pricing.source}`}
            delay={2}
          />
          <KPICard
            icon={BarChart3}
            label="Volume (24h / 7d / 30d)"
            value={formatUsd(data.kpis?.volumeUsd?.last24h ?? data.activity.volumeUsd?.last24h)}
            sublabel={`${formatUsd(data.kpis?.volumeUsd?.last7d ?? data.activity.volumeUsd?.last7d)} / ${formatUsd(data.kpis?.volumeUsd?.last30d ?? data.activity.volumeUsd?.last30d)}`}
            delay={3}
          />
          <KPICard
            icon={Activity}
            label="DAU"
            value={(data.kpis?.dau ?? data.activity.dau ?? 0).toLocaleString()}
            sublabel={`UTC day active wallets`}
            delay={4}
          />
          <KPICard
            icon={Activity}
            label="Total Transactions (TX)"
            value={(data.kpis?.totalTransactions ?? data.activity.totalTransactions ?? 0).toLocaleString()}
            sublabel={`Since genesis across streams, vault, bridge`}
            delay={5}
          />
          <KPICard
            icon={Users}
            label="Unique Wallets (All-time)"
            value={(data.kpis?.uniqueWalletsAllTime ?? data.activity.uniqueWalletsAllTime ?? 0).toLocaleString()}
            sublabel={`All deduplicated protocol participants`}
            delay={6}
          />
          <KPICard
            icon={Users}
            label="Total Registered Users"
            value={(data.kpis?.totalRegisteredUsers ?? data.users?.totalRegistered ?? 0).toLocaleString()}
            sublabel={`Registered users from users table`}
            delay={7}
          />
          <KPICard
            icon={Shield}
            label="Quest Registrations"
            value={(data.kpis?.questRegistrations ?? data.quests?.registrations ?? 0).toLocaleString()}
            sublabel={`${(data.kpis?.questCompletions ?? data.quests?.completions ?? 0).toLocaleString()} completions`}
            delay={8}
          />
          <KPICard
            icon={Shield}
            label="Contributors"
            value={(data.kpis?.contributorCount ?? data.contributors?.participants ?? 0).toLocaleString()}
            sublabel={`${data.contributors?.contributions ?? 0} contributions`}
            delay={9}
          />
          <KPICard
            icon={Clock}
            label="Last Updated"
            value={data.freshness?.lastUpdatedAt ? new Date(data.freshness.lastUpdatedAt).toLocaleTimeString() : 'N/A'}
            sublabel={data.freshness?.isStale ? 'Stale data warning' : 'Backend freshness OK'}
            delay={10}
          />
        </div>

        {/* Detailed TVL Breakdown */}
        <ExpandableSection
          title="TVL Breakdown by Token"
          description="On-chain vault balances with pricing source transparency"
          isExpanded={expandedSections.tvl}
          onToggle={() => setExpandedSections(prev => ({ ...prev, tvl: !prev.tvl }))}
          custom={8}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">USD Est.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Pricing Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {data.tvl.tokens.map((token) => (
                  <tr key={token.key} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center text-xs font-bold text-emerald-400">
                          {token.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-white font-medium">{token.symbol}</div>
                          <div className="text-xs text-gray-500">{token.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-white font-mono text-sm">
                      {token.balanceDisplay}
                    </td>
                    <td className="px-6 py-4 text-right text-white font-mono text-sm">
                      {token.estimatedUsd !== null ? formatUsd(token.estimatedUsd) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {token.pricingSource || 'Not priced'}
                    </td>
                    <td className="px-6 py-4">
                      {token.error ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
                          Error
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/10 bg-white/5">
                <tr>
                  <td className="px-6 py-4 text-white font-semibold">Total</td>
                  <td className="px-6 py-4 text-right text-white font-mono">
                    {data.tvl.tokens.reduce((sum, t) => sum + Number(t.balanceDisplay || 0), 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right text-white font-mono font-semibold">
                    {formatUsd(data.tvl.totals.estimatedUsd)}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-400">
                    {data.tvl.pricing.source}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400">
                      Authoritative
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </ExpandableSection>

        {/* Volume Breakdown */}
        <ExpandableSection
          title="Volume Breakdown by Source"
          description="Transparent volume accounting across protocol activities"
          isExpanded={expandedSections.volume}
          onToggle={() => setExpandedSections(prev => ({ ...prev, volume: !prev.volume }))}
          custom={9}
        >
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <VolumeSourceCard
              title="Stream Withdrawals"
              value={formatUsd(data.activity.observedWithdrawVolumeUsd)}
              description="Stablecoin withdrawals from active streams"
              icon="Stream"
            />
            <VolumeSourceCard
              title="Bridge Transfers"
              value={data.activity.bridgeTransactionCount ? `${data.activity.bridgeTransactionCount} TX` : 'N/A'}
              description="Completed ETH ↔ Vara bridge transfers"
              icon="Bridge"
            />
            <VolumeSourceCard
              title="Total Volume"
              value={formatUsd(data.kpis?.volumeUsd?.last30d || data.activity.volumeUsd?.last30d || 0)}
              description="Combined 30-day volume (all sources)"
              icon="Total"
            />
          </div>
        </ExpandableSection>

        {/* History */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={10}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12"
        >
          <HistoryCard
            title="TVL History (30d)"
            subtitle="Daily snapshot points from on-chain vault balances"
            points={tvlHistory.map((point) => Number(point.tvl_usd || 0))}
            labels={tvlHistory.map((point) => point.date)}
            formatter={formatUsd}
          />
          <HistoryCard
            title="Volume History (30d)"
            subtitle="Stablecoin stream withdrawals + completed bridge transfers"
            points={volumeHistory.map((point) => Number(point.volumeUsd || 0))}
            labels={volumeHistory.map((point) => point.date)}
            formatter={formatUsd}
          />
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={11}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12"
        >
          <ExpandableSection
            title="Wallet Activity Breakdown"
            description="Detailed wallet activity metrics across protocol components"
            isExpanded={expandedSections.walletActivity}
            onToggle={() => setExpandedSections(prev => ({ ...prev, walletActivity: !prev.walletActivity }))}
            custom={11}
          >
            <div className="p-6">
              <MetricCard
                title=""
                metrics={[
                  { label: "Stream Events (30d)", value: data.activity.streamEventCount.toLocaleString() },
                  { label: "Vault Events (30d)", value: data.activity.vaultEventCount.toLocaleString() },
                  { label: "Bridge Transactions (30d)", value: data.activity.bridgeTransactionCount?.toLocaleString() || 'N/A' },
                  { label: "Unique Wallets (30d)", value: data.activity.uniqueWallets.toLocaleString() },
                  { label: "DAU (UTC day)", value: (data.kpis?.dau ?? data.activity.dau ?? 0).toLocaleString() },
                  { label: "Unique Wallets (All-time)", value: (data.kpis?.uniqueWalletsAllTime ?? data.activity.uniqueWalletsAllTime ?? 0).toLocaleString() },
                ]}
              />
            </div>
          </ExpandableSection>
          <ExpandableSection
            title="Protocol State"
            description="Current protocol status and indexer information"
            isExpanded={expandedSections.contracts}
            onToggle={() => setExpandedSections(prev => ({ ...prev, contracts: !prev.contracts }))}
            custom={12}
          >
            <div className="p-6">
              <MetricCard
                title=""
                metrics={[
                  { label: "Active Streams", value: data.protocol.activeStreams.toLocaleString() },
                  { label: "Total Streams", value: data.protocol.totalStreams.toLocaleString() },
                  { label: "Event Source", value: data.activity.source },
                  { label: "Payload-signed TX captured", value: data.activity.capturesPayloadSignedTransactions ? 'Yes' : 'No' },
                  { label: "Last Observed Activity", value: formatTimestamp(data.activity.lastObservedActivityAt) },
                  { label: "Indexer Running", value: data.freshness?.indexerRunning ? 'Yes' : 'No' },
                ]}
              />
            </div>
          </ExpandableSection>
        </motion.div>

        <ExpandableSection
          title="Metric Coverage & Data Sources"
          description="Transparency notes for independent verification"
          isExpanded={false}
          onToggle={() => {}}
          custom={13}
        >
          <div className="p-6">
            <div className="space-y-3">
              {data.coverage.notes.map((note, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                  <Shield className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-300">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </ExpandableSection>

        <ExpandableSection
          title="Contract Verification Links"
          description="Public program links for independent verification on Vara Network"
          isExpanded={expandedSections.contracts}
          onToggle={() => setExpandedSections(prev => ({ ...prev, contracts: !prev.contracts }))}
          custom={14}
        >
          <div className="divide-y divide-white/10">
            {Object.entries(data.contracts).map(([key, address]) => (
              <a
                key={key}
                href={address ? `https://idea.gear-tech.io/programs/${address}?node=${encodeURIComponent('wss://rpc.vara.network')}` : '#'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-white/5 transition-colors"
              >
                <div>
                  <div className="text-white font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                  <div className="text-xs text-gray-500 break-all font-mono">{address || 'Not deployed'}</div>
                </div>
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <span>{address ? 'Verify' : 'N/A'}</span>
                  {address && <ExternalLink className="w-4 h-4" />}
                </div>
              </a>
            ))}
          </div>
        </ExpandableSection>

        {/* Recent Transactions */}
        <ExpandableSection
          title="Recent Protocol Transactions"
          description="On-chain transaction hashes for independent verification"
          isExpanded={expandedSections.transactions}
          onToggle={() => setExpandedSections(prev => ({ ...prev, transactions: !prev.transactions }))}
          custom={15}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Hash</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Wallet</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Verify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {transactions.length > 0 ? transactions.slice((txPage - 1) * itemsPerPage, txPage * itemsPerPage).map((tx, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        tx.source === 'stream' ? 'bg-blue-500/10 text-blue-400' :
                        tx.source === 'vault' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-orange-500/10 text-orange-400'
                      }`}>
                        {tx.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-white">{tx.event_type || tx.status || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500 break-all font-mono">
                        {tx.extrinsic_hash || tx.tx_hash || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500 break-all font-mono">
                        {tx.sender || tx.wallet || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-white font-mono">
                      {tx.amount ? `${Number(tx.amount).toFixed(4)} ${tx.token_symbol || tx.token || ''}` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      {tx.explorerUrl ? (
                        <a
                          href={tx.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-400 text-sm hover:text-emerald-300"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View
                        </a>
                      ) : (
                        <span className="text-gray-500 text-sm">N/A</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                      No transactions available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {transactions.length > itemsPerPage && (
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
              <div className="text-sm text-gray-400">
                Showing {((txPage - 1) * itemsPerPage) + 1} to {Math.min(txPage * itemsPerPage, transactions.length)} of {transactions.length} transactions
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTxPage(Math.max(1, txPage - 1))}
                  disabled={txPage === 1}
                  className="px-3 py-1 rounded bg-white/5 text-white text-sm hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-white text-sm">
                  Page {txPage} of {Math.ceil(transactions.length / itemsPerPage)}
                </span>
                <button
                  onClick={() => setTxPage(Math.min(Math.ceil(transactions.length / itemsPerPage), txPage + 1))}
                  disabled={txPage === Math.ceil(transactions.length / itemsPerPage)}
                  className="px-3 py-1 rounded bg-white/5 text-white text-sm hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </ExpandableSection>

        {/* Active Wallets */}
        <ExpandableSection
          title="Active Wallet Addresses"
          description="Wallet addresses participating in the protocol"
          isExpanded={expandedSections.wallets}
          onToggle={() => setExpandedSections(prev => ({ ...prev, wallets: !prev.wallets }))}
          custom={16}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Wallet Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Display Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">GitHub</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">X Handle</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Stream TX</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Vault TX</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Bridge TX</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Total Streamed</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Total Deposited</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Total Bridged</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {wallets.length > 0 ? wallets.slice((walletPage - 1) * itemsPerPage, walletPage * itemsPerPage).map((wallet, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500 break-all font-mono">{wallet.wallet}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-white">{wallet.displayName || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm text-white">{wallet.githubHandle || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm text-white">{wallet.xHandle || 'N/A'}</td>
                    <td className="px-6 py-4 text-right text-sm text-white">{wallet.streamCount || 0}</td>
                    <td className="px-6 py-4 text-right text-sm text-white">{wallet.vaultCount || 0}</td>
                    <td className="px-6 py-4 text-right text-sm text-white">{wallet.bridgeCount || 0}</td>
                    <td className="px-6 py-4 text-right text-sm text-white font-mono">
                      {wallet.totalStreamed ? Number(wallet.totalStreamed).toFixed(4) : '0'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-white font-mono">
                      {wallet.totalDeposited ? Number(wallet.totalDeposited).toFixed(4) : '0'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-white font-mono">
                      {wallet.totalBridged ? Number(wallet.totalBridged).toFixed(4) : '0'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {wallet.lastActivity ? new Date(wallet.lastActivity).toLocaleString() : 'N/A'}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={11} className="px-6 py-8 text-center text-gray-400">
                      No wallet data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {wallets.length > itemsPerPage && (
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
              <div className="text-sm text-gray-400">
                Showing {((walletPage - 1) * itemsPerPage) + 1} to {Math.min(walletPage * itemsPerPage, wallets.length)} of {wallets.length} wallets
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setWalletPage(Math.max(1, walletPage - 1))}
                  disabled={walletPage === 1}
                  className="px-3 py-1 rounded bg-white/5 text-white text-sm hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-white text-sm">
                  Page {walletPage} of {Math.ceil(wallets.length / itemsPerPage)}
                </span>
                <button
                  onClick={() => setWalletPage(Math.min(Math.ceil(wallets.length / itemsPerPage), walletPage + 1))}
                  disabled={walletPage === Math.ceil(wallets.length / itemsPerPage)}
                  className="px-3 py-1 rounded bg-white/5 text-white text-sm hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </ExpandableSection>

        {/* Last Updated */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={11}
          className="text-center text-sm text-gray-500"
        >
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            <span>Last updated: {formatTimestamp(data.freshness?.lastUpdatedAt || data.generatedAt)}</span>
          </div>
        </motion.div>
      </main>

      <FooterV2 />
    </div>
  )
}

function KPICard({
  icon: Icon,
  label,
  value,
  sublabel,
  delay
}: {
  icon: any
  label: string
  value: string
  sublabel: string
  delay: number
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      custom={delay}
      className="p-6 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 hover:border-white/20 transition-colors"
    >
      <Icon className="w-8 h-8 text-emerald-400 mb-4" />
      <h3 className="text-sm text-gray-400 mb-2">{label}</h3>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </motion.div>
  )
}

function MetricCard({
  title,
  metrics
}: {
  title: string
  metrics: { label: string; value: string }[]
}) {
  return (
    <div className="p-6 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="space-y-3">
        {metrics.map((metric, idx) => (
          <div key={idx} className="flex justify-between items-start gap-4">
            <span className="text-gray-400">{metric.label}</span>
            <span className="text-white font-medium text-right max-w-[60%]">{metric.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoryCard({
  title,
  subtitle,
  points,
  labels,
  formatter,
}: {
  title: string
  subtitle: string
  points: number[]
  labels: string[]
  formatter: (value: number) => string
}) {
  const latest = points.length ? points[points.length - 1] : 0
  const path = buildPath(points, 420, 120)

  return (
    <div className="p-6 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-400">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Latest</div>
          <div className="text-white font-semibold">{formatter(latest)}</div>
        </div>
      </div>

      <div className="rounded-lg bg-black/30 border border-white/5 p-4">
        {points.length > 1 ? (
          <svg viewBox="0 0 420 120" className="w-full h-32">
            <path d={path} fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          <div className="h-32 flex items-center justify-center text-gray-500 text-sm">Not enough history yet</div>
        )}
        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
          <span>{labels[0] || 'Start'}</span>
          <span>{labels[labels.length - 1] || 'Today'}</span>
        </div>
      </div>
    </div>
  )
}

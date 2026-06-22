"use client"

import React, { useEffect, useState, useCallback } from "react"
import { ExternalLink } from "lucide-react"
import { api } from "@/lib/growstreams-api"
import { Card, SectionTitle, ExplorerLink, Pagination, formatTimestamp, shortHash } from "./shared"

const STREAM_CORE_GEAR_URL =
  "https://idea.gear-tech.io/programs/0xfbd656f8082749bc4d8949718d539b5affd76f3004857f889d73fba61013cfe4?node=wss://rpc.vara.network"

function normaliseSymbol(raw: string | undefined | null): string {
  if (!raw) return "—"
  if (raw.toLowerCase() === "wvara") return "gVARA"
  return raw
}

function formatAmount(amount: string | number | null | undefined, source: string): string {
  if (amount == null || amount === "") return "—"
  const n = Number(amount)
  if (isNaN(n)) return String(amount)
  if (source === "xp_mint") return n.toLocaleString()
  const display = n / 1e12
  if (display === 0) return "0"
  if (display < 0.0001) return display.toExponential(3)
  return display.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

const SOURCE_STYLES: Record<string, string> = {
  xp_mint: "bg-purple-500/15 text-purple-300",
  stream: "bg-emerald-500/15 text-emerald-300",
  vault: "bg-blue-500/15 text-blue-300",
  bridge: "bg-amber-500/15 text-amber-300",
}

const PAGE = 25

/**
 * Recent transactions feed with on-chain explorer links (REQ 1) and server-side
 * pagination (REQ 3). Includes on-chain XP mints alongside stream/vault/bridge.
 */
export function TransactionsTable() {
  const [rows, setRows] = useState<any[]>([])
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (off: number) => {
    setLoading(true)
    try {
      const res = await api.analytics.transactions(PAGE, off)
      setRows(res.transactions || [])
      setTotal(res.total || 0)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(offset)
  }, [offset, load])

  return (
    <div>
      <SectionTitle
        title="Transactions"
        subtitle="On-chain activity with verifiable explorer links. Includes XP mints, streams, vault and bridge events."
      />
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-white/10">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Wallet</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Proof</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No transactions found.</td></tr>
              ) : (
                rows.map((tx, i) => (
                  <tr key={`${tx.source}-${tx.id}-${i}`} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SOURCE_STYLES[tx.source] || "bg-white/10 text-gray-300"}`}>
                        {tx.source}{tx.event_type ? `:${tx.event_type}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{shortHash(tx.wallet || tx.sender || tx.receiver)}</td>
                    <td className="px-4 py-3 text-gray-300">{formatAmount(tx.amount, tx.source)}</td>
                    <td className="px-4 py-3 text-gray-400">{normaliseSymbol(tx.token_symbol || tx.token)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatTimestamp(tx.timestamp)}</td>
                    <td className="px-4 py-3">
                      {tx.explorerUrl
                        ? <ExplorerLink url={tx.explorerUrl} />
                        : (tx.source === 'stream' || tx.source === 'vault')
                          ? <a href={STREAM_CORE_GEAR_URL} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">
                              verify <ExternalLink className="w-3 h-3" />
                            </a>
                          : <span className="text-gray-600">—</span>
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination
            offset={offset}
            limit={PAGE}
            total={total}
            onPrev={() => setOffset(Math.max(0, offset - PAGE))}
            onNext={() => setOffset(offset + PAGE)}
          />
        </div>
      </Card>
    </div>
  )
}

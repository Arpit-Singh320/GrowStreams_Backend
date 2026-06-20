"use client"

import React, { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/growstreams-api"
import { Card, SectionTitle, Pagination, formatTimestamp, shortHash, formatNumber } from "./shared"

const PAGE = 25

/** Active wallets list with server-side pagination. */
export function WalletsTable() {
  const [rows, setRows] = useState<any[]>([])
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (off: number) => {
    setLoading(true)
    try {
      const res = await api.analytics.wallets(PAGE, off)
      setRows(res.wallets || [])
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
      <SectionTitle title="Wallets" subtitle="Registered wallets and their on-chain activity. Test/QA accounts excluded." />
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-white/10">
                <th className="px-4 py-3 font-medium">Wallet</th>
                <th className="px-4 py-3 font-medium">Identity</th>
                <th className="px-4 py-3 font-medium">Streams</th>
                <th className="px-4 py-3 font-medium">Vault</th>
                <th className="px-4 py-3 font-medium">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No wallets found.</td></tr>
              ) : (
                rows.map((w, i) => (
                  <tr key={`${w.wallet}-${i}`} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{shortHash(w.wallet)}</td>
                    <td className="px-4 py-3 text-gray-400">{w.displayName || w.githubHandle || w.xHandle || "—"}</td>
                    <td className="px-4 py-3 text-gray-300">{formatNumber(w.streamCount)}</td>
                    <td className="px-4 py-3 text-gray-300">{formatNumber(w.vaultCount)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatTimestamp(w.lastActivity)}</td>
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

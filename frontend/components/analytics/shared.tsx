"use client"

import React from "react"
import { ExternalLink } from "lucide-react"

// ── Formatting helpers ────────────────────────────────────────
export function formatUsd(value: number | string | undefined | null) {
  const n = typeof value === "string" ? Number.parseFloat(value) : value
  return `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export function formatNumber(value: number | string | undefined | null) {
  const n = typeof value === "string" ? Number.parseFloat(value) : value
  return (n || 0).toLocaleString()
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) return "N/A"
  return new Date(value).toLocaleString()
}

export function shortHash(value: string | null | undefined, lead = 8, tail = 6) {
  if (!value) return "—"
  if (value.length <= lead + tail + 3) return value
  return `${value.slice(0, lead)}…${value.slice(-tail)}`
}

// ── Card primitives ───────────────────────────────────────────
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 ${className}`}>
      {children}
    </div>
  )
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sublabel?: string
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-2">
        {Icon ? <Icon className="w-4 h-4 text-emerald-400" /> : null}
        <h3 className="text-sm text-gray-400">{label}</h3>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {sublabel ? <p className="text-xs text-gray-500 mt-2">{sublabel}</p> : null}
    </Card>
  )
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-white">{title}</h2>
      {subtitle ? <p className="text-sm text-gray-400 mt-1">{subtitle}</p> : null}
    </div>
  )
}

// ── On-chain explorer link (REQ 1: verifiable proof) ──────────
export function ExplorerLink({ url, label }: { url: string | null | undefined; label?: string }) {
  if (!url) return <span className="text-gray-600">—</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-mono text-xs"
    >
      {label || "verify"}
      <ExternalLink className="w-3 h-3" />
    </a>
  )
}

// ── Pagination control (server-driven) ────────────────────────
export function Pagination({
  offset,
  limit,
  total,
  onPrev,
  onNext,
}: {
  offset: number
  limit: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + limit, total)
  const canPrev = offset > 0
  const canNext = offset + limit < total
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
      <span>
        {from}–{to} of {formatNumber(total)}
      </span>
      <div className="flex gap-2">
        <button
          onClick={onPrev}
          disabled={!canPrev}
          className="px-3 py-1 rounded-lg border border-white/10 disabled:opacity-30 hover:bg-white/5 transition-colors"
        >
          Prev
        </button>
        <button
          onClick={onNext}
          disabled={!canNext}
          className="px-3 py-1 rounded-lg border border-white/10 disabled:opacity-30 hover:bg-white/5 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}

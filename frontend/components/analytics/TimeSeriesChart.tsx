"use client"

import React from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { Card } from "./shared"

export interface SeriesPoint {
  date: string
  value: number
}

/**
 * Reusable time-series area chart for historical metrics (TVL, volume, DAU...).
 * Renders an empty-state message when there is no data yet.
 */
export function TimeSeriesChart({
  title,
  subtitle,
  data,
  color = "#34d399",
  valuePrefix = "",
  valueSuffix = "",
  height = 260,
}: {
  title: string
  subtitle?: string
  data: SeriesPoint[]
  color?: string
  valuePrefix?: string
  valueSuffix?: string
  height?: number
}) {
  const hasData = data && data.length > 0
  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    } catch {
      return d
    }
  }
  const fmtValue = (v: number) =>
    `${valuePrefix}${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}${valueSuffix}`

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
            <XAxis dataKey="date" tickFormatter={fmtDate} stroke="#6b7280" fontSize={11} />
            <YAxis tickFormatter={fmtValue} stroke="#6b7280" fontSize={11} width={70} />
            <Tooltip
              contentStyle={{ background: "#0b0b0f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
              labelStyle={{ color: "#9ca3af" }}
              labelFormatter={(d) => fmtDate(String(d))}
              formatter={((v: unknown) => [fmtValue(Number(v)), title]) as never}
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
          No historical data yet — accumulates as hourly snapshots are recorded.
        </div>
      )}
    </Card>
  )
}

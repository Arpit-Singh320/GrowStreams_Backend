"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Zap, ArrowRight, Clock, AlertCircle } from "lucide-react"
import { useTokenList, useFlowRate } from "@/hooks/useTokens"
import { useStreamActionsV3 } from "@/hooks/useGrowStreams"
import { TokenSelector } from "./TokenSelector"
import type { TokenMeta } from "@/lib/growstreams-api"

const INTERVALS = [
  { value: "second", label: "/sec" },
  { value: "minute", label: "/min" },
  { value: "hour", label: "/hr" },
  { value: "day", label: "/day" },
  { value: "month", label: "/mo" },
]

interface CreateStreamProps {
  className?: string
}

export function CreateStream({ className = "" }: CreateStreamProps) {
  const { tokens } = useTokenList()
  const { createStream, loading: txLoading, account } = useStreamActionsV3()

  const [selectedToken, setSelectedToken] = useState<TokenMeta | null>(null)
  const [receiver, setReceiver] = useState("")
  const [amount, setAmount] = useState("")
  const [interval, setInterval] = useState("month")
  const [initialDeposit, setInitialDeposit] = useState("")
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const { breakdown, perSecondRaw, loading: rateLoading } = useFlowRate(
    selectedToken?.symbol || "",
    amount,
    interval
  )

  const handleCreate = async () => {
    if (!selectedToken || !receiver || !amount || !initialDeposit) return
    setStatus(null)

    try {
      await createStream(receiver, selectedToken.symbol, amount, interval, initialDeposit)
      setStatus({ type: "success", message: `Stream created! Streaming ${amount} ${selectedToken.displaySymbol}/${interval} to ${receiver.slice(0, 10)}...` })
      setReceiver("")
      setAmount("")
      setInitialDeposit("")
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to create stream" })
    }
  }

  const depositNum = parseFloat(initialDeposit) || 0
  const monthlyRate = parseFloat(breakdown?.perMonth || "0")
  const bufferMonths = monthlyRate > 0 ? (depositNum / monthlyRate).toFixed(1) : "—"

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-provn-accent" />
        <h2 className="text-lg font-semibold">Create Stream</h2>
      </div>

      <div className="space-y-4 p-5 rounded-xl bg-provn-surface border border-provn-border">
        {/* Token Selection */}
        <TokenSelector
          tokens={tokens}
          selected={selectedToken}
          onSelect={setSelectedToken}
          label="Token"
        />

        {/* Receiver */}
        <div>
          <label className="block text-xs text-provn-muted mb-1.5 uppercase tracking-wider">Receiver Address</label>
          <input
            type="text"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder="0x... or Vara SS58 address"
            className="w-full px-3 py-2.5 rounded-lg bg-provn-bg border border-provn-border text-sm font-mono focus:border-provn-accent focus:outline-none"
          />
        </div>

        {/* Flow Rate */}
        <div>
          <label className="block text-xs text-provn-muted mb-1.5 uppercase tracking-wider">Flow Rate</label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              className="flex-1 px-3 py-2.5 rounded-lg bg-provn-bg border border-provn-border text-sm font-mono focus:border-provn-accent focus:outline-none"
            />
            <div className="flex rounded-lg border border-provn-border overflow-hidden">
              {INTERVALS.map((int) => (
                <button
                  key={int.value}
                  type="button"
                  onClick={() => setInterval(int.value)}
                  className={`px-2.5 py-2 text-xs font-medium transition-colors
                    ${interval === int.value
                      ? "bg-provn-accent text-white"
                      : "bg-provn-surface text-provn-muted hover:text-white"
                    }`}
                >
                  {int.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Flow Rate Breakdown */}
        {breakdown && selectedToken && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="rounded-lg bg-provn-bg/50 border border-provn-border/50 p-3"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="w-3.5 h-3.5 text-provn-accent" />
              <span className="text-xs font-medium text-provn-muted">Rate Breakdown</span>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center">
              {[
                { label: "sec", value: breakdown.perSecond },
                { label: "min", value: breakdown.perMinute },
                { label: "hour", value: breakdown.perHour },
                { label: "day", value: breakdown.perDay },
                { label: "month", value: breakdown.perMonth },
              ].map((r) => (
                <div key={r.label}>
                  <div className="text-[10px] text-provn-muted uppercase">{r.label}</div>
                  <div className="text-xs font-mono tabular-nums text-provn-accent truncate" title={r.value}>
                    {parseFloat(r.value) < 0.001 && parseFloat(r.value) > 0
                      ? "<0.001"
                      : parseFloat(r.value).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Initial Deposit */}
        <div>
          <label className="block text-xs text-provn-muted mb-1.5 uppercase tracking-wider">Initial Deposit</label>
          <input
            type="text"
            inputMode="decimal"
            value={initialDeposit}
            onChange={(e) => setInitialDeposit(e.target.value)}
            placeholder="1000"
            className="w-full px-3 py-2.5 rounded-lg bg-provn-bg border border-provn-border text-sm font-mono focus:border-provn-accent focus:outline-none"
          />
          {monthlyRate > 0 && depositNum > 0 && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-provn-muted">
              <AlertCircle className="w-3 h-3" />
              Buffer covers ~{bufferMonths} months of streaming
            </div>
          )}
        </div>

        {/* Preview */}
        {selectedToken && amount && receiver && (
          <div className="flex items-center gap-2 text-xs text-provn-muted bg-provn-bg/50 rounded-lg p-3">
            <span className="font-medium text-white">Preview:</span>
            <span>Streaming</span>
            <span className="text-provn-accent font-mono">{amount} {selectedToken.displaySymbol}/{interval}</span>
            <ArrowRight className="w-3 h-3" />
            <span className="font-mono truncate max-w-[120px]">{receiver}</span>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleCreate}
          disabled={!selectedToken || !receiver || !amount || !initialDeposit || txLoading || !account}
          className="w-full py-3 rounded-lg bg-provn-accent text-white font-medium text-sm hover:bg-provn-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {!account
            ? "Connect Wallet"
            : txLoading
              ? "Signing Transaction..."
              : `Create Stream${selectedToken ? ` (${selectedToken.displaySymbol})` : ""}`}
        </button>

        {status && (
          <div className={`text-xs px-3 py-2.5 rounded-lg ${status.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  )
}

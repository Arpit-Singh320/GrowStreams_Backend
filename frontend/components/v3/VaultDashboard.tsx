"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Wallet } from "lucide-react"
import { useTokenList, useVaultBalances } from "@/hooks/useTokens"
import { useVaultActionsV3 } from "@/hooks/useGrowStreams"
import { TokenSelector, TokenIcon, TOKEN_COLORS } from "./TokenSelector"
import type { TokenMeta, TokenVaultBalance } from "@/lib/growstreams-api"

interface VaultDashboardProps {
  wallet: string | null
  className?: string
}

function BalanceCard({ balance }: { balance: TokenVaultBalance }) {
  const hasBalance = parseFloat(balance.available) > 0 || parseFloat(balance.totalDeposited) > 0
  if (!hasBalance) return null

  const color = TOKEN_COLORS[balance.token] || "#888"

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl bg-provn-surface border border-provn-border p-4"
    >
      <div
        className="absolute top-0 left-0 h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
      />
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs"
          style={{ backgroundColor: color }}
        >
          {balance.displaySymbol.slice(0, 1)}
        </div>
        <div>
          <div className="font-semibold text-sm">{balance.displaySymbol}</div>
          <div className="text-[10px] text-provn-muted uppercase tracking-wider">{balance.token}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-provn-muted">Available</span>
          <span className="font-mono tabular-nums text-provn-accent font-medium">{balance.available}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-provn-muted">Allocated</span>
          <span className="font-mono tabular-nums">{balance.totalAllocated}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-provn-muted">Total Deposited</span>
          <span className="font-mono tabular-nums">{balance.totalDeposited}</span>
        </div>
      </div>
    </motion.div>
  )
}

export function VaultDashboard({ wallet, className = "" }: VaultDashboardProps) {
  const { tokens } = useTokenList()
  const { balances, loading, refresh } = useVaultBalances(wallet)
  const { depositToken, withdrawToken, loading: actionLoading } = useVaultActionsV3()

  const [action, setAction] = useState<"deposit" | "withdraw" | null>(null)
  const [selectedToken, setSelectedToken] = useState<TokenMeta | null>(null)
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const handleSubmit = async () => {
    if (!selectedToken || !amount || parseFloat(amount) <= 0) return
    setStatus(null)

    try {
      if (action === "deposit") {
        await depositToken(selectedToken.symbol, amount)
      } else {
        await withdrawToken(selectedToken.symbol, amount)
      }
      setStatus({ type: "success", message: `${action === "deposit" ? "Deposited" : "Withdrew"} ${amount} ${selectedToken.displaySymbol}` })
      setAmount("")
      refresh()
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Transaction failed" })
    }
  }

  const activeBalances = balances.filter(
    (b) => parseFloat(b.available) > 0 || parseFloat(b.totalDeposited) > 0
  )

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-provn-accent" />
          <h2 className="text-lg font-semibold">Token Vault</h2>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-provn-surface transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-provn-muted ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Balances Grid */}
      {!wallet ? (
        <div className="text-center py-8 text-provn-muted text-sm">
          Connect your wallet to view vault balances
        </div>
      ) : activeBalances.length === 0 && !loading ? (
        <div className="text-center py-8 text-provn-muted text-sm">
          No tokens deposited yet. Deposit stablecoins to start streaming.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeBalances.map((b) => (
            <BalanceCard key={b.token} balance={b} />
          ))}
        </div>
      )}

      {/* Deposit / Withdraw Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setAction(action === "deposit" ? null : "deposit")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
            ${action === "deposit" ? "bg-provn-accent text-white" : "bg-provn-surface border border-provn-border hover:border-provn-accent/50"}`}
        >
          <ArrowDownToLine className="w-4 h-4" /> Deposit
        </button>
        <button
          onClick={() => setAction(action === "withdraw" ? null : "withdraw")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
            ${action === "withdraw" ? "bg-red-500/80 text-white" : "bg-provn-surface border border-provn-border hover:border-red-500/50"}`}
        >
          <ArrowUpFromLine className="w-4 h-4" /> Withdraw
        </button>
      </div>

      {/* Action Form */}
      {action && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3 p-4 rounded-xl bg-provn-surface border border-provn-border"
        >
          <TokenSelector
            tokens={tokens}
            selected={selectedToken}
            onSelect={setSelectedToken}
            label="Token"
          />
          <div>
            <label className="block text-xs text-provn-muted mb-1.5 uppercase tracking-wider">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-lg bg-provn-bg border border-provn-border text-sm font-mono focus:border-provn-accent focus:outline-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!selectedToken || !amount || actionLoading}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${action === "deposit"
                ? "bg-provn-accent text-white hover:bg-provn-accent/90"
                : "bg-red-500 text-white hover:bg-red-500/90"
              }`}
          >
            {actionLoading ? "Signing..." : `${action === "deposit" ? "Deposit" : "Withdraw"} ${selectedToken?.displaySymbol || ""}`}
          </button>

          {status && (
            <div className={`text-xs px-3 py-2 rounded-lg ${status.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              {status.message}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

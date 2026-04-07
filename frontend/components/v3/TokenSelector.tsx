"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown } from "lucide-react"
import type { TokenMeta } from "@/lib/growstreams-api"

const TOKEN_COLORS: Record<string, string> = {
  WUSDC: "#2775CA",
  WUSDT: "#26A17B",
  WETH: "#627EEA",
  WBTC: "#F7931A",
  VARA: "#10B981",
}

function TokenIcon({ token, size = 24 }: { token: TokenMeta; size?: number }) {
  const color = TOKEN_COLORS[token.symbol] || "#888"
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.4 }}
    >
      {token.displaySymbol.slice(0, 1)}
    </div>
  )
}

interface TokenSelectorProps {
  tokens: TokenMeta[]
  selected: TokenMeta | null
  onSelect: (token: TokenMeta) => void
  label?: string
  filter?: "all" | "stablecoin" | "crypto"
  disabled?: boolean
  className?: string
}

export function TokenSelector({
  tokens,
  selected,
  onSelect,
  label,
  filter = "all",
  disabled = false,
  className = "",
}: TokenSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = filter === "all"
    ? tokens
    : tokens.filter((t) => t.category === filter)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs text-provn-muted mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`
          w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg
          bg-provn-surface border border-provn-border
          hover:border-provn-accent/50 transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
          ${open ? "border-provn-accent" : ""}
        `}
      >
        {selected ? (
          <>
            <TokenIcon token={selected} size={22} />
            <span className="font-medium text-sm">{selected.displaySymbol}</span>
            <span className="text-xs text-provn-muted hidden sm:inline">{selected.name}</span>
          </>
        ) : (
          <span className="text-provn-muted text-sm">Select token</span>
        )}
        <ChevronDown className={`ml-auto w-4 h-4 text-provn-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full rounded-lg bg-provn-surface border border-provn-border shadow-xl overflow-hidden"
          >
            {filtered.map((token) => (
              <button
                key={token.symbol}
                type="button"
                onClick={() => { onSelect(token); setOpen(false); }}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5
                  hover:bg-provn-accent/10 transition-colors text-left
                  ${selected?.symbol === token.symbol ? "bg-provn-accent/5" : ""}
                `}
              >
                <TokenIcon token={token} size={22} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{token.displaySymbol}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-provn-border/50 text-provn-muted">
                      {token.category === "stablecoin" ? "Stable" : token.category === "native" ? "Native" : "Crypto"}
                    </span>
                  </div>
                  <span className="text-xs text-provn-muted truncate block">{token.name}</span>
                </div>
                {token.priceUSD != null && (
                  <span className="text-xs text-provn-muted tabular-nums">${token.priceUSD.toFixed(2)}</span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export { TokenIcon, TOKEN_COLORS }

'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { type TokenConfig } from '@/lib/tokens';
import { cn } from '@/lib/utils';

interface TokenSelectorProps {
  tokens: TokenConfig[];
  selected: TokenConfig;
  onSelect: (token: TokenConfig) => void;
  walletBalances?: Record<string, string>;
  vaultBalances?: Record<string, string>;
  label?: string;
  disabled?: boolean;
  showBalance?: boolean;
  className?: string;
}

export default function TokenSelector({
  tokens,
  selected,
  onSelect,
  walletBalances = {},
  vaultBalances = {},
  label,
  disabled = false,
  showBalance = true,
  className,
}: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = tokens.filter(t =>
    !search || t.symbol.toLowerCase().includes(search.toLowerCase()) || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const accentColor = (token: TokenConfig) => {
    const map: Record<string, string> = {
      blue: 'border-blue-500/40 bg-blue-500/10',
      green: 'border-green-500/40 bg-green-500/10',
      purple: 'border-purple-500/40 bg-purple-500/10',
      orange: 'border-orange-500/40 bg-orange-500/10',
      emerald: 'border-emerald-500/40 bg-emerald-500/10',
    };
    return map[token.colorAccent] || 'border-provn-border bg-provn-surface';
  };

  return (
    <div className={cn('relative', className)} ref={ref}>
      {label && <label className="block text-xs text-provn-muted mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border transition-all text-left',
          open ? accentColor(selected) : 'border-provn-border bg-provn-surface hover:border-provn-muted/40',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <TokenIcon token={selected} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{selected.symbol}</span>
            <span className="text-xs text-provn-muted truncate">{selected.name}</span>
          </div>
          {showBalance && walletBalances[selected.key] && (
            <p className="text-[10px] text-provn-muted mt-0.5">
              Wallet: {walletBalances[selected.key]}
              {vaultBalances[selected.key] && ` · Vault: ${vaultBalances[selected.key]}`}
            </p>
          )}
        </div>
        <ChevronDown className={cn('w-4 h-4 text-provn-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-provn-surface border border-provn-border rounded-xl shadow-xl overflow-hidden">
          {tokens.length > 4 && (
            <div className="p-2 border-b border-provn-border/50">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-provn-muted" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search tokens..."
                  className="w-full pl-8 pr-3 py-1.5 bg-provn-bg border border-provn-border rounded-lg text-xs focus:border-emerald-500/50 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-provn-muted text-center py-4">No tokens found</p>
            ) : (
              filtered.map(token => (
                <button
                  key={token.key}
                  type="button"
                  onClick={() => { if (!token.comingSoon) { onSelect(token); setOpen(false); setSearch(''); } }}
                  disabled={token.comingSoon}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2.5 transition-colors text-left',
                    token.comingSoon ? 'opacity-50 cursor-not-allowed' : 'hover:bg-provn-bg/60',
                    selected.key === token.key && 'bg-provn-bg/40',
                  )}
                >
                  <TokenIcon token={token} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{token.symbol}</span>
                      <span className="text-xs text-provn-muted truncate">{token.name}</span>
                      {token.isStablecoin && (
                        <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">Stable</span>
                      )}
                      {token.comingSoon && (
                        <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full">Soon</span>
                      )}
                    </div>
                    {showBalance && walletBalances[token.key] && !token.comingSoon && (
                      <p className="text-[10px] text-provn-muted mt-0.5">
                        {walletBalances[token.key]}
                        {vaultBalances[token.key] && ` · Vault: ${vaultBalances[token.key]}`}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-provn-muted">{token.decimals}d</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Token icon with fallback ────────────────────────────────

function TokenIcon({ token, size = 'md' }: { token: TokenConfig; size?: 'sm' | 'md' | 'lg' }) {
  const [imgError, setImgError] = useState(false);
  const sizeClasses = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-10 h-10' };
  const textSizes = { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm' };

  const bgColorMap: Record<string, string> = {
    blue: 'bg-blue-500/15',
    green: 'bg-green-500/15',
    purple: 'bg-purple-500/15',
    orange: 'bg-orange-500/15',
    emerald: 'bg-emerald-500/15',
  };
  const bgColor = bgColorMap[token.colorAccent] || 'bg-provn-border';

  if (imgError || !token.icon) {
    return (
      <div className={cn(sizeClasses[size], bgColor, 'rounded-full flex items-center justify-center flex-shrink-0')}>
        <span className={cn(textSizes[size], token.color, 'font-bold')}>
          {token.symbol.slice(0, 2)}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(sizeClasses[size], bgColor, 'rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden')}>
      <img
        src={token.icon}
        alt={token.symbol}
        className={cn(sizeClasses[size], 'object-contain p-0.5')}
        onError={() => setImgError(true)}
      />
    </div>
  );
}

export { TokenIcon };

'use client';

import { Coins, Clock } from 'lucide-react';

export default function GrowTokenPage() {
  return (
    <div className="max-w-2xl mx-auto py-20 px-4 text-center">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
        <Coins className="w-10 h-10 text-white" />
      </div>
      <h1 className="text-3xl font-bold mb-3">GROW Token</h1>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-6">
        <Clock className="w-4 h-4" />
        Coming Soon
      </div>
      <p className="text-provn-muted max-w-md mx-auto mb-8">
        The GROW token is being prepared for mainnet launch. Mint, approve, deposit, and stream GROW tokens — all coming soon.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
        {[
          { title: 'Faucet', desc: 'Mint free GROW' },
          { title: 'Approve & Deposit', desc: 'Fund your vault' },
          { title: 'Stream', desc: 'Pay per-second' },
        ].map(item => (
          <div key={item.title} className="bg-provn-surface border border-provn-border rounded-xl p-4 opacity-60">
            <p className="font-semibold text-sm mb-1">{item.title}</p>
            <p className="text-[11px] text-provn-muted">{item.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-provn-muted mt-8">
        Contract: <span className="font-mono">0x728d04df...f7163</span> · Network: Vara Mainnet
      </p>
    </div>
  );
}
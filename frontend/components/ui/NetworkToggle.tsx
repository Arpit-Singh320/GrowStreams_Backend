'use client';

import { usePathname, useRouter } from 'next/navigation';

/**
 * NetworkToggle — Vara Network ↔ Vara.eth pill toggle
 * Mirrors the toggle on vara.network homepage.
 * - Left side  = Vara Network  (all normal /app/* routes)
 * - Right side = Vara.eth      (/app/vara-eth)
 */
export default function NetworkToggle() {
  const pathname = usePathname();
  const router   = useRouter();

  const isVaraEth = pathname.startsWith('/app/vara-eth');

  function handleToggle(toVaraEth: boolean) {
    if (toVaraEth && !isVaraEth) router.push('/app/vara-eth');
    if (!toVaraEth && isVaraEth)  router.push('/app');
  }

  return (
    <div
      className="flex items-center rounded-full border border-provn-border bg-provn-bg/60 backdrop-blur-sm p-0.5 text-[11px] font-semibold select-none"
      role="group"
      aria-label="Switch network"
    >
      {/* Vara.eth side */}
      <button
        onClick={() => handleToggle(true)}
        className={`px-3 py-1 rounded-full transition-all duration-200 ${
          isVaraEth
            ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/40'
            : 'text-provn-muted hover:text-provn-text'
        }`}
      >
        VARA.ETH
      </button>

      {/* divider */}
      <span className="w-px h-3 bg-provn-border mx-0.5" />

      {/* Vara Network side */}
      <button
        onClick={() => handleToggle(false)}
        className={`px-3 py-1 rounded-full transition-all duration-200 ${
          !isVaraEth
            ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/40'
            : 'text-provn-muted hover:text-provn-text'
        }`}
      >
        VARA NETWORK
      </button>
    </div>
  );
}

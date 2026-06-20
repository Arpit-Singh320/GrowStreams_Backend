// Single source of truth for on-chain program IDs.
//
// These IDs are AUTHORITATIVELY owned by the backend (resolved from its env /
// deploy-state at startup). Hardcoding them here used to silently break wrap /
// streaming every time a contract was redeployed and the frontend wasn't
// updated in lockstep.
//
// The values below are only a FALLBACK used before the backend responds (and
// for SSR). At app startup, `hydrateProgramIds()` fetches the live IDs from
// `GET /api/config/program-ids` and overwrites this object IN PLACE, so every
// module that imported `PROGRAM_IDS` sees the corrected values without needing
// a re-import. Mutating in place (rather than reassigning) is what makes the
// shared-reference pattern work.

import { api as gsApi } from '@/lib/growstreams-api';
import { SUPPORTED_TOKENS } from '@/lib/tokens';

export const PROGRAM_IDS: Record<string, string> = {
  streamCore: '0xba0901f3ef665e956d8ab721686d97d2e5473092df34baf229e87ac826eadc4a',
  tokenVault: '0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9',
  growToken: '0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163',
  splitsRouter: '0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45',
  permissionManager: '0x52f4299e964dab5e97c91cdd10e2d6e635b19696ab8389889aabceba3de9e581',
  bountyAdapter: '0x7697bb2e8655e6cd7294389a0289355f48fd5459914d2a735c9966dad548bd4f',
  identityRegistry: '0x6f413156308663798a77507cf0ea6e79bdbf53add3579ccd4317fc320acf7f29',
  questSeeds: '0xefbe2c4a66e05cbde419196c1196ff6e790a59b7c0fd601ebc035c3c8dd7466d',
  wvara: '0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d',
  gvaraToken: '0x1edcac5125401f93a1b08be8464c84ad94f24af7d4a31efa32237d0738991af7',
};

let hydrated = false;

/**
 * Fetch the backend's authoritative program IDs and overwrite PROGRAM_IDS in
 * place. Safe to call multiple times; only the first successful call mutates.
 * Falls back silently to the hardcoded values on any error.
 */
export async function hydrateProgramIds(): Promise<void> {
  if (hydrated) return;
  try {
    const { programIds } = await gsApi.config.programIds();
    if (programIds && typeof programIds === 'object') {
      for (const [key, id] of Object.entries(programIds)) {
        if (typeof id === 'string' && id.startsWith('0x')) {
          PROGRAM_IDS[key] = id;
        }
      }
      // Keep the gVARA token's stream address in sync — it IS the gVARA program.
      if (PROGRAM_IDS.gvaraToken && SUPPORTED_TOKENS.GVARA) {
        SUPPORTED_TOKENS.GVARA.vara = PROGRAM_IDS.gvaraToken;
      }
      hydrated = true;
    }
  } catch (err) {
    // Non-fatal: fall back to hardcoded IDs.
    console.warn('[program-ids] hydrate failed, using fallback IDs:', err);
  }
}

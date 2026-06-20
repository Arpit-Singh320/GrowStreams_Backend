// Public client config — serves the backend's authoritative on-chain program
// IDs so the frontend never has to hardcode (and desync) them.
//
// `getProgramIds()` returns the IDs the sails-client actually connected to at
// startup (resolved from env overrides -> deploy-state.json), keyed by the
// kebab-case deploy-state names. The frontend's PROGRAM_IDS map uses camelCase
// keys, so we remap here.

import { Router } from 'express';
import { getProgramIds } from '../sails-client.mjs';

const router = Router();

// kebab-case (deploy-state keys) -> camelCase (frontend PROGRAM_IDS keys)
const KEBAB_TO_CAMEL = {
  'stream-core': 'streamCore',
  'token-vault': 'tokenVault',
  'grow-token': 'growToken',
  'splits-router': 'splitsRouter',
  'permission-manager': 'permissionManager',
  'bounty-adapter': 'bountyAdapter',
  'identity-registry': 'identityRegistry',
  'quest-seeds': 'questSeeds',
  'wvara': 'wvara',
  'super-token': 'superToken',
  'gvara-token': 'gvaraToken',
  'distribution-pool': 'distributionPool',
  'liquidation-manager': 'liquidationManager',
};

// GET /api/config/program-ids
// Returns { programIds: { streamCore, tokenVault, gvaraToken, ... }, timestamp }
router.get('/program-ids', (req, res) => {
  const raw = getProgramIds(); // { 'stream-core': '0x..', ... }
  const programIds = {};
  for (const [kebab, id] of Object.entries(raw)) {
    if (!id) continue; // skip contracts that failed to load
    const camel = KEBAB_TO_CAMEL[kebab] || kebab;
    programIds[camel] = id;
  }
  // Short cache — IDs only change on redeploy, but we want clients to pick up
  // a redeploy within ~a minute without a hard refresh.
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ programIds, timestamp: new Date().toISOString() });
});

export default router;

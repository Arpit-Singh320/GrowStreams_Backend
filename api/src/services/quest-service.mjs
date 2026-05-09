import crypto from 'crypto';
import { query, queryOne, queryAll } from './db.mjs';
import { command as sailsCommand, getContract } from '../sails-client.mjs';

// ---------------------------------------------------------------------------
// Referral code helpers
// ---------------------------------------------------------------------------

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[crypto.randomInt(chars.length)];
  return `GSR-${suffix}`;
}

/**
 * Generate a unique personal referral code for a wallet and persist it.
 * @returns {Promise<string>} The generated referral code
 */
async function createReferralCodeForWallet(wallet) {
  let code;
  let attempts = 0;
  do {
    code = generateReferralCode();
    const existing = await queryOne(
      `SELECT id FROM quest_registrations WHERE referral_code = $1`,
      [code]
    );
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  await query(
    `UPDATE quest_registrations SET referral_code = $1 WHERE wallet = $2 OR evm_address = $2`,
    [code, wallet]
  );

  console.log(`[quest] Referral code created for ${wallet}: ${code}`);
  return code;
}

// ---------------------------------------------------------------------------
// Invite code helpers
// ---------------------------------------------------------------------------

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for clarity
  let code = 'GS-';
  for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
  return code;
}

/**
 * Generate one or more invite codes.
 * @param {number} count       Number of codes to generate
 * @param {string} createdBy   Admin wallet or 'SYSTEM'
 * @param {number} maxUses     Max uses per code (default 1)
 * @param {string|null} expiresAt  ISO date or null
 * @returns {Promise<string[]>} Generated codes
 */
export async function generateInvites(count = 1, createdBy = 'SYSTEM', maxUses = 1, expiresAt = null) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    let code;
    let attempts = 0;
    // Ensure unique code
    do {
      code = generateInviteCode();
      const existing = await queryOne(`SELECT id FROM quest_invites WHERE code = $1`, [code]);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    await queryOne(
      `INSERT INTO quest_invites (code, created_by, max_uses, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING code`,
      [code, createdBy, maxUses, expiresAt]
    );
    codes.push(code);
  }
  console.log(`[quest] Generated ${codes.length} invite codes`);
  return codes;
}

/**
 * Validate an invite code. Returns the invite row or null.
 */
export async function validateInvite(code) {
  const invite = await queryOne(
    `SELECT * FROM quest_invites WHERE code = $1`,
    [code.toUpperCase().trim()]
  );
  if (!invite) return { valid: false, error: 'Invalid invite code' };
  if (invite.current_uses >= invite.max_uses) return { valid: false, error: 'Invite code has been fully used' };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return { valid: false, error: 'Invite code has expired' };
  return { valid: true, invite };
}

/**
 * List all invite codes (admin).
 */
export async function listInvites(status = null) {
  let sql = `SELECT * FROM quest_invites ORDER BY created_at DESC`;
  const params = [];
  if (status === 'unused') {
    sql = `SELECT * FROM quest_invites WHERE current_uses < max_uses ORDER BY created_at DESC`;
  } else if (status === 'used') {
    sql = `SELECT * FROM quest_invites WHERE current_uses >= max_uses ORDER BY created_at DESC`;
  }
  return queryAll(sql, params);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register a user for quests.
 * Requires: display_name, email, and at least one of wallet (SS58) or evm_address (0x).
 * Pass refCode (from ?ref=GSR-XXXXXX in the referral link) to link referrals.
 */
export async function registerForQuests(wallet, email, displayName, evmAddress = null, refCode = null) {
  // Determine wallet type and normalise addresses
  const normalizedWallet = wallet ? wallet.trim() : null;
  const normalizedEvm = evmAddress ? evmAddress.toLowerCase().trim() : null;
  const walletType = normalizedEvm ? (normalizedWallet ? 'both' : 'evm') : 'substrate';

  if (!normalizedWallet && !normalizedEvm) {
    throw new Error('Either wallet or evm_address is required');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName = displayName.trim();

  // Duplicate checks
  if (normalizedWallet) {
    const existingWallet = await queryOne(`SELECT id FROM quest_registrations WHERE wallet = $1`, [normalizedWallet]);
    if (existingWallet) throw new Error('Wallet already registered for quests');
  }
  if (normalizedEvm) {
    const existingEvm = await queryOne(`SELECT id FROM quest_registrations WHERE evm_address = $1`, [normalizedEvm]);
    if (existingEvm) throw new Error('EVM address already registered for quests');
  }

  const existingEmail = await queryOne(`SELECT id FROM quest_registrations WHERE email = $1`, [normalizedEmail]);
  if (existingEmail) throw new Error('Email already registered for quests');

  const primaryIdentifier = normalizedWallet || normalizedEvm;

  const reg = await queryOne(
    `INSERT INTO quest_registrations (wallet, evm_address, wallet_type, display_name, email)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [normalizedWallet, normalizedEvm, walletType, normalizedName, normalizedEmail]
  );

  // Generate and store the new user's personal referral code
  const referralCode = await createReferralCodeForWallet(primaryIdentifier);

  // Handle referral: look up referrer by their referral_code in quest_registrations
  if (refCode) {
    const normalizedRefCode = refCode.toUpperCase().trim();
    const referrerRow = await queryOne(
      `SELECT wallet, evm_address FROM quest_registrations WHERE referral_code = $1`,
      [normalizedRefCode]
    );
    const referrerWallet = referrerRow?.wallet || referrerRow?.evm_address;
    const isValidReferral = referrerWallet && referrerWallet !== primaryIdentifier;

    if (isValidReferral) {
      await query(
        `UPDATE quest_registrations SET referred_by_wallet = $1 WHERE wallet = $2 OR evm_address = $2`,
        [referrerWallet, primaryIdentifier]
      );
      setImmediate(async () => {
        try {
          await awardSeeds(referrerWallet, 'refer-a-friend', {
            referred_wallet: primaryIdentifier,
            source: 'referral-registration',
          });
          console.log(`[quest] Referral bonus awarded to ${referrerWallet} for bringing in ${primaryIdentifier}`);
        } catch (refErr) {
          console.warn(`[quest] Referral bonus failed for ${referrerWallet}: ${refErr.message}`);
        }
      });
    }
  }

  console.log(`[quest] Registered ${primaryIdentifier} type=${walletType} (email=${normalizedEmail}, name=${normalizedName})`);
  return { ...reg, referral_code: referralCode };
}

/**
 * Get registration for a wallet (SS58 or 0x EVM address), or null if not registered.
 */
export async function getRegistration(address) {
  const isEvm = address && address.startsWith('0x') && address.length === 42;
  if (isEvm) {
    return queryOne(
      `SELECT * FROM quest_registrations WHERE evm_address = $1 OR wallet = $1`,
      [address.toLowerCase()]
    );
  }
  return queryOne(`SELECT * FROM quest_registrations WHERE wallet = $1`, [address]);
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

// Weekly refresh boundary (Postgres ISO week, starts Monday 00:00 UTC)
const WEEK_START_SQL = `date_trunc('week', NOW() AT TIME ZONE 'UTC')`;

/**
 * List all active quests.
 */
export async function listQuests() {
  return queryAll(`SELECT * FROM quests WHERE active = TRUE ORDER BY sort_order ASC`);
}

/**
 * Get a single quest by slug.
 */
export async function getQuestBySlug(slug) {
  return queryOne(`SELECT * FROM quests WHERE slug = $1`, [slug]);
}

/**
 * Get user's quest progress: all quests + completion status + total Seeds.
 */
export async function getQuestProgress(wallet) {
  const registration = await getRegistration(wallet);
  if (!registration) return null;

  const quests = await listQuests();

  // Get all completions for this wallet
  const completions = await queryAll(
    `SELECT * FROM quest_completions WHERE wallet = $1 ORDER BY created_at DESC`,
    [wallet]
  );

  // Total Seeds balance
  const seedsRow = await queryOne(
    `SELECT COALESCE(SUM(delta), 0) AS total FROM seeds_ledger WHERE wallet = $1`,
    [wallet]
  );
  const totalSeeds = parseInt(seedsRow?.total || '0', 10);

  // Recent activity
  const recentActivity = await queryAll(
    `SELECT sl.*, q.slug, q.title AS quest_title
     FROM seeds_ledger sl
     LEFT JOIN quests q ON q.id = sl.quest_id
     WHERE sl.wallet = $1
     ORDER BY sl.created_at DESC LIMIT 20`,
    [wallet]
  );

  // Map completions by quest_id
  const completionMap = {};
  for (const c of completions) {
    if (!completionMap[c.quest_id]) completionMap[c.quest_id] = [];
    completionMap[c.quest_id].push(c);
  }

  // Compute current week boundary on the JS side to filter completions for
  // weekly refresh logic. Use Postgres-style ISO week (Monday 00:00 UTC).
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun ... 6=Sat
  const daysSinceMonday = (day + 6) % 7; // Mon=0, Sun=6
  const weekStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday
  ));

  const isThisWeek = (c) => {
    const t = c.verified_at || c.created_at;
    return t && new Date(t) >= weekStart;
  };

  const questsWithStatus = quests.map(q => {
    const questCompletions = completionMap[q.id] || [];
    const verifiedAll = questCompletions.filter(c => c.status === 'VERIFIED');
    const verifiedThisWeek = verifiedAll.filter(isThisWeek);
    const pendingThisWeek = questCompletions.find(c => c.status === 'PENDING' && isThisWeek(c)) || null;
    const rejectedThisWeek = questCompletions.find(c => c.status === 'REJECTED' && isThisWeek(c)) || null;
    const isCompletedThisWeek = verifiedThisWeek.length > 0;
    const isCompleted = !q.repeatable ? verifiedAll.length > 0 : isCompletedThisWeek;
    const totalEarned = verifiedAll.reduce((sum, c) => sum + c.seeds_awarded, 0);

    return {
      ...q,
      completed: isCompleted,
      completionCount: verifiedAll.length,
      totalEarned,
      latestCompletion: verifiedAll[0] || null,
      pendingSubmission: pendingThisWeek,
      rejectedSubmission: rejectedThisWeek && !pendingThisWeek && !isCompletedThisWeek ? rejectedThisWeek : null,
    };
  });

  const completedCount = questsWithStatus.filter(q => q.completed).length;

  return {
    registration,
    totalSeeds,
    questsCompleted: completedCount,
    questsTotal: quests.length,
    quests: questsWithStatus,
    recentActivity,
  };
}

// ---------------------------------------------------------------------------
// Seeds awarding
// ---------------------------------------------------------------------------

/**
 * Award Seeds for a quest completion.
 * Inserts quest_completion + seeds_ledger entry.
 * For non-repeatable quests, prevents duplicate awards.
 * @returns {object|null} The quest completion record, or null if skipped
 */
export async function awardSeeds(wallet, questSlug, proof = {}, txHash = null) {
  const quest = await getQuestBySlug(questSlug);
  if (!quest) throw new Error(`Quest not found: ${questSlug}`);
  if (!quest.active) throw new Error(`Quest is not active: ${questSlug}`);

  // Dedup logic: REFERRAL quests use per-referred-wallet check (no weekly cap).
  // All other quests use the standard ISO-week boundary check.
  if (quest.quest_type === 'REFERRAL') {
    const referredWallet = proof?.referred_wallet;
    if (referredWallet) {
      const existingReferral = await queryOne(
        `SELECT id FROM quest_completions
         WHERE wallet = $1 AND quest_id = $2 AND status = 'VERIFIED'
           AND proof->>'referred_wallet' = $3`,
        [wallet, quest.id, referredWallet]
      );
      if (existingReferral) {
        console.log(`[quest] Skipped duplicate referral: ${wallet} already earned referral XP for ${referredWallet}`);
        return null;
      }
    }
  } else {
    // Standard weekly dedup for all non-referral quests
    const existing = await queryOne(
      `SELECT id FROM quest_completions
       WHERE wallet = $1 AND quest_id = $2 AND status = 'VERIFIED'
         AND COALESCE(verified_at, created_at) >= ${WEEK_START_SQL}`,
      [wallet, quest.id]
    );
    if (existing) {
      console.log(`[quest] Skipped duplicate completion: ${wallet} already completed ${questSlug} this week`);
      return null;
    }
  }

  // Attempt on-chain mint via quest-seeds contract
  let onChainTxHash = txHash;
  const seedsContract = getContract('questSeeds');
  const isEvmAddress = wallet && wallet.startsWith('0x') && wallet.length === 42;

  if (seedsContract && !txHash && !isEvmAddress) {
    // Vara-native path: convert SS58 → hex ActorId and mint via Sails
    try {
      const reason = `quest:${questSlug}`;
      console.log(`[quest] Attempting on-chain mint (Vara native): ${quest.seeds_reward} Seeds to ${wallet}`);

      let walletHex = wallet;
      if (!wallet.startsWith('0x')) {
        const { decodeAddress } = await import('@polkadot/util-crypto');
        const publicKey = decodeAddress(wallet);
        walletHex = '0x' + Buffer.from(publicKey).toString('hex');
        console.log(`[quest] Converted SS58 ${wallet} to hex ${walletHex}`);
      }

      const mintResult = await sailsCommand('questSeeds', 'Mint', walletHex, quest.seeds_reward, reason);
      console.log(`[quest] Mint result:`, mintResult);
      onChainTxHash = mintResult.blockHash || null;
      console.log(`[quest] On-chain mint SUCCESS: ${quest.seeds_reward} Seeds to ${wallet}, tx=${onChainTxHash}`);
    } catch (mintErr) {
      console.warn(`[quest] On-chain mint failed for ${wallet}: ${mintErr.message}. Recording DB-only.`);
    }
  } else if (seedsContract && !txHash && isEvmAddress) {
    // Vara.eth path: mint to 0x address via vara-eth-client (Mirror/ABI call)
    try {
      const { mintSeedsEvm } = await import('../vara-eth-client.mjs');
      const reason = `quest:${questSlug}`;
      console.log(`[quest] Attempting on-chain mint (Vara.eth): ${quest.seeds_reward} Seeds to ${wallet}`);
      const evmTx = await mintSeedsEvm(wallet, quest.seeds_reward, reason);
      onChainTxHash = evmTx?.txHash || null;
      console.log(`[quest] Vara.eth mint SUCCESS: tx=${onChainTxHash}`);
    } catch (mintErr) {
      console.warn(`[quest] Vara.eth mint failed for ${wallet}: ${mintErr.message}. Recording DB-only.`);
    }
  } else if (!seedsContract) {
    console.warn(`[quest] questSeeds contract not loaded — Seeds will be DB-only`);
  }

  // Insert completion
  const completion = await queryOne(
    `INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded, tx_hash, verified_at)
     VALUES ($1, $2, 'VERIFIED', $3, $4, $5, NOW()) RETURNING *`,
    [wallet, quest.id, JSON.stringify(proof), quest.seeds_reward, onChainTxHash]
  );

  // Insert seeds ledger entry
  await queryOne(
    `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, tx_hash)
     VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4) RETURNING *`,
    [wallet, quest.seeds_reward, quest.id, onChainTxHash]
  );

  console.log(`[quest] Awarded ${quest.seeds_reward} Seeds to ${wallet} for ${questSlug} (tx=${onChainTxHash || 'db-only'})`);
  return completion;
}

// ---------------------------------------------------------------------------
// Manual review submissions (X quests are now reviewed by admin)
// ---------------------------------------------------------------------------

/**
 * Submit proof for a quest as PENDING for admin review.
 * Returns { status: 'SUBMITTED' | 'ALREADY_PENDING' | 'ALREADY_VERIFIED' }
 */
export async function submitQuestProof(wallet, questSlug, proof = {}) {
  const quest = await getQuestBySlug(questSlug);
  if (!quest) throw new Error(`Quest not found: ${questSlug}`);
  if (!quest.active) throw new Error(`Quest is not active: ${questSlug}`);

  // Already verified this week?
  const verified = await queryOne(
    `SELECT id FROM quest_completions
     WHERE wallet = $1 AND quest_id = $2 AND status = 'VERIFIED'
       AND COALESCE(verified_at, created_at) >= ${WEEK_START_SQL}`,
    [wallet, quest.id]
  );
  if (verified) return { status: 'ALREADY_VERIFIED' };

  // Already pending this week? Update proof instead of creating duplicate.
  const pending = await queryOne(
    `SELECT id FROM quest_completions
     WHERE wallet = $1 AND quest_id = $2 AND status = 'PENDING'
       AND created_at >= ${WEEK_START_SQL}`,
    [wallet, quest.id]
  );
  if (pending) {
    const updated = await queryOne(
      `UPDATE quest_completions SET proof = $1, created_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(proof), pending.id]
    );
    return { status: 'UPDATED', completion: updated };
  }

  const completion = await queryOne(
    `INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded)
     VALUES ($1, $2, 'PENDING', $3, 0) RETURNING *`,
    [wallet, quest.id, JSON.stringify(proof)]
  );
  console.log(`[quest] Submitted PENDING ${questSlug} for ${wallet}`);
  return { status: 'SUBMITTED', completion };
}

/**
 * List PENDING quest completions joined with quest + registration data.
 */
export async function listPendingSubmissions() {
  return queryAll(`
    SELECT qc.id, qc.wallet, qc.quest_id, qc.proof, qc.created_at,
           q.slug AS quest_slug, q.title AS quest_title, q.seeds_reward,
           r.email, r.x_username, r.github_username
    FROM quest_completions qc
    JOIN quests q ON q.id = qc.quest_id
    LEFT JOIN quest_registrations r ON r.wallet = qc.wallet
    WHERE qc.status = 'PENDING'
    ORDER BY qc.created_at ASC
  `);
}

/**
 * Approve a pending submission: mint Seeds on-chain (if possible),
 * mark completion VERIFIED, write seeds_ledger entry.
 */
export async function approvePendingSubmission(completionId) {
  const row = await queryOne(
    `SELECT qc.*, q.slug, q.seeds_reward, q.repeatable
     FROM quest_completions qc JOIN quests q ON q.id = qc.quest_id
     WHERE qc.id = $1`,
    [completionId]
  );
  if (!row) throw new Error('Submission not found');
  if (row.status !== 'PENDING') throw new Error(`Submission is not pending (status=${row.status})`);

  const wallet = row.wallet;
  const seedsReward = row.seeds_reward;

  // Attempt on-chain mint via quest-seeds contract (same logic as awardSeeds)
  let onChainTxHash = null;
  const seedsContract = getContract('questSeeds');
  if (seedsContract) {
    try {
      const reason = `quest:${row.slug}`;
      console.log(`[quest] Approving submission ${completionId}: minting ${seedsReward} XP to ${wallet}`);

      let walletHex = wallet;
      if (!wallet.startsWith('0x')) {
        const { decodeAddress } = await import('@polkadot/util-crypto');
        const publicKey = decodeAddress(wallet);
        walletHex = '0x' + Buffer.from(publicKey).toString('hex');
      }

      const mintResult = await sailsCommand('questSeeds', 'Mint', walletHex, seedsReward, reason);
      onChainTxHash = mintResult.blockHash || null;
      console.log(`[quest] On-chain mint SUCCESS for submission ${completionId}, tx=${onChainTxHash}`);
    } catch (mintErr) {
      console.warn(`[quest] On-chain mint failed for submission ${completionId}: ${mintErr.message}. Recording DB-only.`);
    }
  } else {
    console.warn(`[quest] questSeeds contract not loaded — Seeds will be DB-only`);
  }

  // Mark as VERIFIED
  const completion = await queryOne(
    `UPDATE quest_completions
     SET status = 'VERIFIED', seeds_awarded = $1, tx_hash = $2, verified_at = NOW()
     WHERE id = $3 RETURNING *`,
    [seedsReward, onChainTxHash, completionId]
  );

  // Insert seeds ledger entry
  await queryOne(
    `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, tx_hash)
     VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4) RETURNING *`,
    [wallet, seedsReward, row.quest_id, onChainTxHash]
  );

  console.log(`[quest] Approved submission ${completionId}: ${seedsReward} XP to ${wallet}`);
  return completion;
}

/**
 * Reject a pending submission.
 */
export async function rejectPendingSubmission(completionId, reason = '') {
  const row = await queryOne(`SELECT * FROM quest_completions WHERE id = $1`, [completionId]);
  if (!row) throw new Error('Submission not found');
  if (row.status !== 'PENDING') throw new Error(`Submission is not pending (status=${row.status})`);

  const existingProof = row.proof || {};
  const updatedProof = { ...existingProof, reject_reason: reason || null };

  const completion = await queryOne(
    `UPDATE quest_completions SET status = 'REJECTED', proof = $1 WHERE id = $2 RETURNING *`,
    [JSON.stringify(updatedProof), completionId]
  );
  console.log(`[quest] Rejected submission ${completionId} (reason=${reason})`);
  return completion;
}

/**
 * Award the one-time welcome bonus (100 Seeds) to a newly registered wallet.
 * Uses an all-time duplicate check so it can never be awarded twice regardless
 * of which week the user registered.
 * @returns {object|null} The quest_completion record, or null if already awarded.
 */
export async function awardWelcomeBonus(wallet) {
  const quest = await getQuestBySlug('welcome-bonus');
  if (!quest || !quest.active) return null;

  const existing = await queryOne(
    `SELECT id FROM quest_completions
     WHERE wallet = $1 AND quest_id = $2 AND status = 'VERIFIED'`,
    [wallet, quest.id]
  );
  if (existing) {
    console.log(`[quest] welcome-bonus already awarded to ${wallet} — skipping`);
    return null;
  }

  let onChainTxHash = null;
  const seedsContract = getContract('questSeeds');
  if (seedsContract) {
    try {
      let walletHex = wallet;
      if (!wallet.startsWith('0x')) {
        const { decodeAddress } = await import('@polkadot/util-crypto');
        const publicKey = decodeAddress(wallet);
        walletHex = '0x' + Buffer.from(publicKey).toString('hex');
      }
      const mintResult = await sailsCommand('questSeeds', 'Mint', walletHex, quest.seeds_reward, 'quest:welcome-bonus');
      onChainTxHash = mintResult.blockHash || null;
      console.log(`[quest] welcome-bonus on-chain mint OK for ${wallet}, tx=${onChainTxHash}`);
    } catch (mintErr) {
      console.warn(`[quest] welcome-bonus on-chain mint failed for ${wallet}: ${mintErr.message}. DB-only.`);
    }
  }

  const completion = await queryOne(
    `INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded, tx_hash, verified_at)
     VALUES ($1, $2, 'VERIFIED', $3, $4, $5, NOW()) RETURNING *`,
    [wallet, quest.id, JSON.stringify({ source: 'registration' }), quest.seeds_reward, onChainTxHash]
  );
  await queryOne(
    `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, tx_hash)
     VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4)`,
    [wallet, quest.seeds_reward, quest.id, onChainTxHash]
  );
  console.log(`[quest] Awarded welcome-bonus (${quest.seeds_reward} Seeds) to ${wallet}`);
  return completion;
}

/**
 * Get total Seeds for a wallet (SS58 or 0x EVM address).
 */
export async function getSeedsBalance(address) {
  const isEvm = address && address.startsWith('0x') && address.length === 42;
  let walletClause;
  let params;
  if (isEvm) {
    // Match both the evm_address column (via quest_registrations join) and direct wallet column
    walletClause = `wallet IN (
      SELECT COALESCE(wallet, evm_address) FROM quest_registrations
      WHERE evm_address = $1 OR wallet = $1
    )`;
    params = [address.toLowerCase()];
  } else {
    walletClause = `wallet = $1`;
    params = [address];
  }
  const row = await queryOne(
    `SELECT COALESCE(SUM(delta), 0) AS total FROM seeds_ledger WHERE ${walletClause}`,
    params
  );
  return parseInt(row?.total || '0', 10);
}

/**
 * Retry on-chain minting for all VERIFIED completions where tx_hash is NULL.
 * Useful after a Vara node outage or wallet balance replenishment.
 * Returns { attempted, succeeded, failed }
 */
export async function syncOnchainMints() {
  const pending = await queryAll(
    `SELECT qc.id, qc.wallet, qc.seeds_awarded, qc.quest_id, q.slug, q.quest_type
     FROM quest_completions qc
     JOIN quests q ON q.id = qc.quest_id
     WHERE qc.status = 'VERIFIED' AND qc.tx_hash IS NULL
     ORDER BY qc.verified_at ASC
     LIMIT 100`
  );

  if (!pending.length) return { attempted: 0, succeeded: 0, failed: 0 };

  const seedsContract = getContract('questSeeds');
  if (!seedsContract) throw new Error('questSeeds contract not loaded — cannot sync');

  let succeeded = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const isEvmAddress = row.wallet.startsWith('0x') && row.wallet.length === 42;
      let txHash = null;

      if (!isEvmAddress) {
        const { decodeAddress } = await import('@polkadot/util-crypto');
        const publicKey = decodeAddress(row.wallet);
        const walletHex = '0x' + Buffer.from(publicKey).toString('hex');
        const reason = `quest:${row.slug}:sync`;
        const mintResult = await sailsCommand('questSeeds', 'Mint', walletHex, row.seeds_awarded, reason);
        txHash = mintResult.blockHash || null;
      } else {
        const { mintSeedsEvm } = await import('../vara-eth-client.mjs');
        const evmTx = await mintSeedsEvm(row.wallet, row.seeds_awarded, `quest:${row.slug}:sync`);
        txHash = evmTx?.txHash || null;
      }

      if (txHash) {
        await query(
          `UPDATE quest_completions SET tx_hash = $1 WHERE id = $2`,
          [txHash, row.id]
        );
        await query(
          `UPDATE seeds_ledger SET tx_hash = $1
           WHERE quest_id = $2 AND wallet = $3 AND tx_hash IS NULL
           ORDER BY created_at ASC LIMIT 1`,
          [txHash, row.quest_id, row.wallet]
        );
        succeeded++;
        console.log(`[sync] On-chain mint synced for completion ${row.id}, tx=${txHash}`);
      } else {
        failed++;
      }
    } catch (err) {
      console.warn(`[sync] Mint retry failed for completion ${row.id}: ${err.message}`);
      failed++;
    }
  }

  return { attempted: pending.length, succeeded, failed };
}

/**
 * Get a user's referral code and referral stats.
 */
export async function getReferralStats(address) {
  const reg = await getRegistration(address);
  if (!reg) return null;

  const wallet = reg.wallet || reg.evm_address;

  // People this user has referred
  const referred = await queryAll(
    `SELECT wallet, evm_address, x_username, registered_at
     FROM quest_registrations
     WHERE referred_by_wallet = $1
     ORDER BY registered_at DESC`,
    [wallet]
  );

  // Total Seeds earned from referrals
  const earned = await queryOne(
    `SELECT COALESCE(SUM(qc.seeds_awarded), 0) AS total
     FROM quest_completions qc
     JOIN quests q ON q.id = qc.quest_id
     WHERE qc.wallet = $1 AND q.slug = 'refer-a-friend' AND qc.status = 'VERIFIED'`,
    [wallet]
  );

  return {
    referral_code: reg.referral_code,
    referral_link: `https://growstreams.xyz/join?ref=${reg.referral_code}`,
    total_referrals: referred.length,
    seeds_earned_from_referrals: parseInt(earned?.total || '0', 10),
    referred_users: referred,
  };
}

/**
 * Get all registered wallets (for cron polling).
 */
export async function getAllRegisteredUsers() {
  return queryAll(`SELECT * FROM quest_registrations ORDER BY registered_at ASC`);
}

/**
 * Quest leaderboard: every registered user with their total XP, quests completed,
 * and registered handles. Ranked by total XP descending.
 */
export async function getQuestLeaderboard() {
  return queryAll(`
    SELECT
      r.wallet,
      r.display_name,
      r.github_username,
      r.registered_at,
      COALESCE(s.total_xp, 0)::int       AS total_xp,
      COALESCE(c.completed_count, 0)::int AS quests_completed,
      COALESCE(c.last_completed_at, NULL) AS last_completed_at
    FROM quest_registrations r
    LEFT JOIN (
      SELECT wallet, SUM(delta) AS total_xp
      FROM seeds_ledger
      GROUP BY wallet
    ) s ON s.wallet = r.wallet
    LEFT JOIN (
      SELECT wallet,
             COUNT(DISTINCT quest_id) AS completed_count,
             MAX(verified_at)         AS last_completed_at
      FROM quest_completions
      WHERE status = 'VERIFIED'
      GROUP BY wallet
    ) c ON c.wallet = r.wallet
    ORDER BY total_xp DESC, r.registered_at ASC
  `);
}

/**
 * Check if a quest has already been completed in the current week for a wallet.
 */
export async function isQuestCompleted(wallet, questSlug) {
  const quest = await getQuestBySlug(questSlug);
  if (!quest) return false;
  const existing = await queryOne(
    `SELECT id FROM quest_completions
     WHERE wallet = $1 AND quest_id = $2 AND status = 'VERIFIED'
       AND COALESCE(verified_at, created_at) >= ${WEEK_START_SQL}`,
    [wallet, quest.id]
  );
  return !!existing;
}

// ---------------------------------------------------------------------------
// Stats (for admin / dashboard)
// ---------------------------------------------------------------------------

/**
 * Get overall quest stats.
 */
export async function getQuestStats() {
  const totalRegistered = await queryOne(`SELECT COUNT(*) AS cnt FROM quest_registrations`);
  const totalCompletions = await queryOne(`SELECT COUNT(*) AS cnt FROM quest_completions WHERE status = 'VERIFIED'`);
  const totalSeeds = await queryOne(`SELECT COALESCE(SUM(delta), 0) AS total FROM seeds_ledger`);
  const invitesUsed = await queryOne(`SELECT COALESCE(SUM(current_uses), 0) AS total FROM quest_invites`);
  const invitesTotal = await queryOne(`SELECT COUNT(*) AS cnt FROM quest_invites`);

  return {
    totalRegistered: parseInt(totalRegistered?.cnt || '0', 10),
    totalCompletions: parseInt(totalCompletions?.cnt || '0', 10),
    totalSeedsMinted: parseInt(totalSeeds?.total || '0', 10),
    invitesUsed: parseInt(invitesUsed?.total || '0', 10),
    invitesTotal: parseInt(invitesTotal?.cnt || '0', 10),
  };
}

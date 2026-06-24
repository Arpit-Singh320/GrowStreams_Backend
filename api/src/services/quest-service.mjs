import crypto from 'crypto';
import { query, queryOne, queryAll } from './db.mjs';
import { command as sailsCommand, getContract } from '../sails-client.mjs';
import { REWARDS_FROZEN, shouldFreezeReward } from './reward-freeze.mjs';
import { getActiveSeason } from './season-service.mjs';

// Cache active season ID to avoid repeated DB queries
let cachedSeasonId = null;
let cachedSeasonExpiry = 0;

async function getCurrentSeasonId() {
  const now = Date.now();
  if (cachedSeasonId && now < cachedSeasonExpiry) {
    return cachedSeasonId;
  }
  const season = await getActiveSeason();
  cachedSeasonId = season?.id || null;
  cachedSeasonExpiry = now + 60000; // Cache for 1 minute
  return cachedSeasonId;
}

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
 * Requires: display_name, email, invite_code, and at least one of wallet (SS58) or evm_address (0x).
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

  // Auto-award 100 XP welcome bonus immediately on registration
  setImmediate(async () => {
    try {
      await awardWelcomeBonus(primaryIdentifier);
    } catch (err) {
      console.warn(`[quest] Welcome bonus failed for ${primaryIdentifier}: ${err.message}`);
    }
  });

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
    // Auto-approve quest types (TELEGRAM_JOIN, VISIT_URL) should never show as pending
    const isAutoApprove = q.quest_type === 'TELEGRAM_JOIN' || q.quest_type === 'VISIT_URL';
    const pendingThisWeek = (!isAutoApprove && questCompletions.find(c => c.status === 'PENDING' && isThisWeek(c))) || null;
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
  if (shouldFreezeReward(quest.seeds_reward)) {
    console.log(`[quest] Rewards frozen; skipped ${quest.seeds_reward} Seeds for ${wallet} / ${questSlug}`);
    return null;
  }

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

    // For auto-approve types (TELEGRAM_JOIN, VISIT_URL): clear any stale PENDING rows
    // so they don't block the UI or create duplicate entries
    if (quest.quest_type === 'TELEGRAM_JOIN' || quest.quest_type === 'VISIT_URL') {
      await query(
        `DELETE FROM quest_completions WHERE wallet = $1 AND quest_id = $2 AND status = 'PENDING'`,
        [wallet, quest.id]
      );
    }
  }

  // Get current season ID for tracking
  const seasonId = await getCurrentSeasonId();

  // Resolve project_id from the quest (null = main leaderboard)
  const projectId = quest.project_id || null;

  // Insert completion immediately so the user gets an instant response
  const completion = await queryOne(
    `INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded, tx_hash, verified_at, season_id, project_id)
     VALUES ($1, $2, 'VERIFIED', $3, $4, $5, NOW(), $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [wallet, quest.id, JSON.stringify(proof), quest.seeds_reward, txHash, seasonId, projectId]
  );

  // If another concurrent request already inserted, bail out gracefully
  if (!completion) {
    console.warn(`[quest] Race-condition duplicate blocked for ${wallet} / ${questSlug}`);
    return null;
  }

  // Insert seeds ledger entry (project_id scopes it out of the main leaderboard)
  await queryOne(
    `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, tx_hash, season_id, project_id)
     VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4, $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [wallet, quest.seeds_reward, quest.id, txHash, seasonId, projectId]
  );

  console.log(`[quest] Awarded ${quest.seeds_reward} Seeds to ${wallet} for ${questSlug} (db-instant)${projectId ? ` [project_id=${projectId}]` : ''}`);

  // Skip on-chain mint for special project quests (off-chain only)
  if (projectId) {
    return completion;
  }

  // Mint on-chain in background — updates tx_hash once confirmed
  if (!txHash) {
    setImmediate(async () => {
      const seedsContract = getContract('questSeeds');
      if (!seedsContract) {
        console.warn(`[quest] questSeeds contract not loaded — ${questSlug} for ${wallet} is DB-only`);
        return;
      }
      const isEvmAddress = wallet && wallet.startsWith('0x') && wallet.length === 42;
      try {
        let onChainTxHash = null;
        if (!isEvmAddress) {
          const reason = `quest:${questSlug}`;
          let walletHex = wallet;
          if (!wallet.startsWith('0x')) {
            const { decodeAddress } = await import('@polkadot/util-crypto');
            walletHex = '0x' + Buffer.from(decodeAddress(wallet)).toString('hex');
          }
          const mintResult = await sailsCommand('questSeeds', 'Mint', walletHex, quest.seeds_reward, reason);
          onChainTxHash = mintResult.blockHash || null;
        } else {
          const { mintSeedsEvm } = await import('../vara-eth-client.mjs');
          const evmTx = await mintSeedsEvm(wallet, quest.seeds_reward, `quest:${questSlug}`);
          onChainTxHash = evmTx?.txHash || null;
        }
        if (onChainTxHash) {
          await query(`UPDATE quest_completions SET tx_hash = $1 WHERE id = $2`, [onChainTxHash, completion.id]);
          await query(`UPDATE seeds_ledger SET tx_hash = $1 WHERE quest_id = $2 AND wallet = $3 AND tx_hash IS NULL`, [onChainTxHash, quest.id, wallet]);
          console.log(`[quest] On-chain mint SUCCESS for ${questSlug} / ${wallet}, tx=${onChainTxHash}`);
        }
      } catch (mintErr) {
        console.warn(`[quest] On-chain mint failed for ${wallet} / ${questSlug}: ${mintErr.message}`);
      }
    });
  }

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

  // Auto-approve quest types should NEVER go through manual review
  if (quest.quest_type === 'TELEGRAM_JOIN' || quest.quest_type === 'VISIT_URL') {
    throw new Error(`Quest type ${quest.quest_type} is auto-approved and cannot be submitted for review.`);
  }

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

  // Get current season ID for tracking
  const seasonId = await getCurrentSeasonId();

  const completion = await queryOne(
    `INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded, season_id)
     VALUES ($1, $2, 'PENDING', $3, 0, $4) RETURNING *`,
    [wallet, quest.id, JSON.stringify(proof), seasonId]
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
           q.slug AS quest_slug, q.title AS quest_title, q.seeds_reward, q.quest_type,
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
  if (shouldFreezeReward(seedsReward)) {
    throw Object.assign(new Error('Rewards are frozen; this submission cannot increase Seeds.'), { status: 400 });
  }

  // Mark as VERIFIED immediately so admin UI gets instant response
  const completion = await queryOne(
    `UPDATE quest_completions
     SET status = 'VERIFIED', seeds_awarded = $1, tx_hash = NULL, verified_at = NOW()
     WHERE id = $2 RETURNING *`,
    [seedsReward, completionId]
  );

  // Use the season_id from the completion row (preserves original season)
  const seasonId = row.season_id || await getCurrentSeasonId();

  // Insert seeds ledger entry
  await queryOne(
    `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, tx_hash, season_id)
     VALUES ($1, $2, 'QUEST_COMPLETE', $3, NULL, $4)`,
    [wallet, seedsReward, row.quest_id, seasonId]
  );

  console.log(`[quest] Approved submission ${completionId}: ${seedsReward} XP to ${wallet} — minting on-chain async`);

  // Mint on-chain in background — updates tx_hash once confirmed
  setImmediate(async () => {
    const seedsContract = getContract('questSeeds');
    if (!seedsContract) {
      console.warn(`[quest] questSeeds contract not loaded — submission ${completionId} is DB-only`);
      return;
    }
    try {
      const reason = `quest:${row.slug}`;
      let walletHex = wallet;
      if (!wallet.startsWith('0x')) {
        const { decodeAddress } = await import('@polkadot/util-crypto');
        walletHex = '0x' + Buffer.from(decodeAddress(wallet)).toString('hex');
      }
      const mintResult = await sailsCommand('questSeeds', 'Mint', walletHex, seedsReward, reason);
      const txHash = mintResult.blockHash || null;
      // Update tx_hash in both tables once confirmed
      await query(
        `UPDATE quest_completions SET tx_hash = $1 WHERE id = $2`,
        [txHash, completionId]
      );
      await query(
        `UPDATE seeds_ledger SET tx_hash = $1 WHERE quest_id = $2 AND wallet = $3 AND tx_hash IS NULL`,
        [txHash, row.quest_id, wallet]
      );
      console.log(`[quest] On-chain mint SUCCESS for submission ${completionId}, tx=${txHash}`);
    } catch (mintErr) {
      console.warn(`[quest] On-chain mint failed for submission ${completionId}: ${mintErr.message}`);
    }
  });

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
  if (shouldFreezeReward(quest.seeds_reward)) {
    console.log(`[quest] Rewards frozen; skipped welcome-bonus (${quest.seeds_reward} Seeds) for ${wallet}`);
    return null;
  }

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

  // Get current season ID for tracking
  const seasonId = await getCurrentSeasonId();

  const completion = await queryOne(
    `INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded, tx_hash, verified_at, season_id)
     VALUES ($1, $2, 'VERIFIED', $3, $4, $5, NOW(), $6) RETURNING *`,
    [wallet, quest.id, JSON.stringify({ source: 'registration' }), quest.seeds_reward, onChainTxHash, seasonId]
  );
  await queryOne(
    `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, tx_hash, season_id)
     VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4, $5)`,
    [wallet, quest.seeds_reward, quest.id, onChainTxHash, seasonId]
  );
  console.log(`[quest] Awarded welcome-bonus (${quest.seeds_reward} Seeds) to ${wallet}`);
  return completion;
}

/**
 * Award any WELCOME-type quest by slug (idempotent).
 * Used for campaign-specific welcome quests (e.g. ginie-welcome).
 */
export async function awardWelcomeBonusBySlug(wallet, questSlug) {
  const quest = await getQuestBySlug(questSlug);
  if (!quest || !quest.active || quest.quest_type !== 'WELCOME') return null;
  if (shouldFreezeReward(quest.seeds_reward)) {
    console.log(`[quest] Rewards frozen; skipped ${questSlug} (${quest.seeds_reward} Seeds) for ${wallet}`);
    return null;
  }

  const existing = await queryOne(
    `SELECT id FROM quest_completions WHERE wallet = $1 AND quest_id = $2 AND status = 'VERIFIED'`,
    [wallet, quest.id]
  );
  if (existing) return null;

  let onChainTxHash = null;
  const seedsContract = getContract('questSeeds');
  if (seedsContract && quest.seeds_reward > 0) {
    try {
      let walletHex = wallet;
      if (!wallet.startsWith('0x')) {
        const { decodeAddress } = await import('@polkadot/util-crypto');
        walletHex = '0x' + Buffer.from(decodeAddress(wallet)).toString('hex');
      }
      const mintResult = await sailsCommand('questSeeds', 'Mint', walletHex, quest.seeds_reward, `quest:${questSlug}`);
      onChainTxHash = mintResult.blockHash || null;
    } catch (mintErr) {
      console.warn(`[quest] ${questSlug} on-chain mint failed for ${wallet}: ${mintErr.message}. DB-only.`);
    }
  }

  // Get current season ID for tracking
  const seasonId = await getCurrentSeasonId();

  const completion = await queryOne(
    `INSERT INTO quest_completions (wallet, quest_id, status, proof, seeds_awarded, tx_hash, verified_at, season_id)
     VALUES ($1, $2, 'VERIFIED', $3, $4, $5, NOW(), $6) RETURNING *`,
    [wallet, quest.id, JSON.stringify({ source: 'campaign-join' }), quest.seeds_reward, onChainTxHash, seasonId]
  );
  if (quest.seeds_reward > 0) {
    await queryOne(
      `INSERT INTO seeds_ledger (wallet, delta, reason, quest_id, tx_hash, season_id)
       VALUES ($1, $2, 'QUEST_COMPLETE', $3, $4, $5)`,
      [wallet, quest.seeds_reward, quest.id, onChainTxHash, seasonId]
    );
  }
  console.log(`[quest] Awarded ${questSlug} (${quest.seeds_reward} Seeds) to ${wallet}`);
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
  if (REWARDS_FROZEN) {
    console.log('[sync] Rewards frozen; skipped on-chain mint sync');
    return { attempted: 0, succeeded: 0, failed: 0, frozen: true };
  }

  const pending = await queryAll(
    `SELECT qc.id, qc.wallet, qc.seeds_awarded, qc.quest_id, q.slug, q.quest_type
     FROM quest_completions qc
     JOIN quests q ON q.id = qc.quest_id
     WHERE qc.status = 'VERIFIED' AND qc.tx_hash IS NULL
       AND qc.seeds_awarded > 0
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
           WHERE id = (
             SELECT id FROM seeds_ledger
             WHERE quest_id = $2 AND wallet = $3 AND tx_hash IS NULL
             ORDER BY created_at ASC LIMIT 1
           )`,
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
 * Also fetches on-chain BalanceOf for each wallet in parallel.
 */
export async function getQuestLeaderboard() {
  const rows = await queryAll(`
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
      WHERE project_id IS NULL
      GROUP BY wallet
    ) s ON s.wallet = r.wallet
    LEFT JOIN (
      SELECT wallet,
             COUNT(DISTINCT quest_id) AS completed_count,
             MAX(verified_at)         AS last_completed_at
      FROM quest_completions
      WHERE status = 'VERIFIED' AND project_id IS NULL
      GROUP BY wallet
    ) c ON c.wallet = r.wallet
    ORDER BY total_xp DESC, r.registered_at ASC
  `);

  // Fetch on-chain balance for each wallet in parallel (non-fatal)
  try {
    const { query: sailsQuery, getContract } = await import('../sails-client.mjs');
    if (getContract('questSeeds')) {
      const balances = await Promise.all(
        rows.map(async (row) => {
          try {
            const { decodeAddress } = await import('@polkadot/util-crypto');
            let actorId = row.wallet;
            if (!actorId.startsWith('0x') || actorId.length !== 66) {
              const pub = decodeAddress(actorId);
              actorId = '0x' + Buffer.from(pub).toString('hex');
            }
            const raw = await sailsQuery('questSeeds', 'BalanceOf', actorId);
            return Number(raw);
          } catch {
            return null;
          }
        })
      );
      return rows.map((row, i) => ({ ...row, onchain_xp: balances[i] }));
    }
  } catch {
    // contract not loaded — return rows without onchain_xp
  }

  return rows.map(row => ({ ...row, onchain_xp: null }));
}

// ---------------------------------------------------------------------------
// Special Projects
// ---------------------------------------------------------------------------

export async function listSpecialProjects() {
  return queryAll(`
    SELECT sp.*,
      COUNT(q.id)::int AS quest_count
    FROM special_projects sp
    LEFT JOIN quests q ON q.project_id = sp.id AND q.active = TRUE
    GROUP BY sp.id
    ORDER BY sp.sort_order ASC, sp.created_at ASC
  `);
}

export async function getSpecialProjectBySlug(slug) {
  return queryOne(`SELECT * FROM special_projects WHERE slug = $1`, [slug]);
}

export async function getSpecialProjectProgress(slug, wallet) {
  const project = await getSpecialProjectBySlug(slug);
  if (!project) return null;

  const quests = await queryAll(
    `SELECT * FROM quests WHERE project_id = $1 AND active = TRUE ORDER BY sort_order ASC`,
    [project.id]
  );

  const completions = await queryAll(
    `SELECT * FROM quest_completions WHERE wallet = $1 AND project_id = $2 ORDER BY created_at DESC`,
    [wallet, project.id]
  );

  const now = new Date();
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const weekStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday
  ));
  const isThisWeek = (c) => { const t = c.verified_at || c.created_at; return t && new Date(t) >= weekStart; };

  const completionMap = {};
  for (const c of completions) {
    if (!completionMap[c.quest_id]) completionMap[c.quest_id] = [];
    completionMap[c.quest_id].push(c);
  }

  const seedsRow = await queryOne(
    `SELECT COALESCE(SUM(delta), 0) AS total FROM seeds_ledger WHERE wallet = $1 AND project_id = $2`,
    [wallet, project.id]
  );
  const projectXp = parseInt(seedsRow?.total || '0', 10);

  const questsWithStatus = quests.map(q => {
    const qc = completionMap[q.id] || [];
    const verifiedAll = qc.filter(c => c.status === 'VERIFIED');
    const verifiedThisWeek = verifiedAll.filter(isThisWeek);
    const isAutoApprove = q.quest_type === 'TELEGRAM_JOIN' || q.quest_type === 'VISIT_URL';
    const pendingThisWeek = (!isAutoApprove && qc.find(c => c.status === 'PENDING' && isThisWeek(c))) || null;
    const rejectedThisWeek = qc.find(c => c.status === 'REJECTED' && isThisWeek(c)) || null;
    const isCompleted = !q.repeatable ? verifiedAll.length > 0 : verifiedThisWeek.length > 0;
    return {
      ...q,
      completed: isCompleted,
      completionCount: verifiedAll.length,
      pendingSubmission: pendingThisWeek,
      rejectedSubmission: rejectedThisWeek && !pendingThisWeek && !isCompleted ? rejectedThisWeek : null,
    };
  });

  return { project, quests: questsWithStatus, projectXp };
}

export async function getSpecialProjectLeaderboard(slug) {
  const project = await getSpecialProjectBySlug(slug);
  if (!project) return null;

  const rows = await queryAll(`
    SELECT
      r.wallet,
      r.display_name,
      r.registered_at,
      COALESCE(s.total_xp, 0)::int       AS total_xp,
      COALESCE(c.completed_count, 0)::int AS quests_completed
    FROM quest_registrations r
    INNER JOIN (
      SELECT wallet, SUM(delta) AS total_xp
      FROM seeds_ledger
      WHERE project_id = $1
      GROUP BY wallet
    ) s ON s.wallet = r.wallet
    LEFT JOIN (
      SELECT wallet, COUNT(DISTINCT quest_id) AS completed_count
      FROM quest_completions
      WHERE project_id = $1 AND status = 'VERIFIED'
      GROUP BY wallet
    ) c ON c.wallet = r.wallet
    ORDER BY total_xp DESC, r.registered_at ASC
    LIMIT 100
  `, [project.id]);

  return { project, leaderboard: rows };
}

export async function upsertSpecialProject(data) {
  const { slug, title, description, banner_url, badge_label, status, sort_order, meta } = data;
  return queryOne(`
    INSERT INTO special_projects (slug, title, description, banner_url, badge_label, status, sort_order, meta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (slug) DO UPDATE SET
      title       = EXCLUDED.title,
      description = EXCLUDED.description,
      banner_url  = EXCLUDED.banner_url,
      badge_label = EXCLUDED.badge_label,
      status      = EXCLUDED.status,
      sort_order  = EXCLUDED.sort_order,
      meta        = EXCLUDED.meta
    RETURNING *
  `, [slug, title, description || '', banner_url || null, badge_label || null, status || 'ACTIVE', sort_order || 0, JSON.stringify(meta || {})]);
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
  const pendingReview = await queryOne(`SELECT COUNT(*) AS cnt FROM quest_completions WHERE status = 'PENDING_REVIEW'`);
  const totalQuests = await queryOne(`SELECT COUNT(*) AS cnt FROM quests WHERE active = true`);
  const totalCampaigns = await queryOne(`SELECT COUNT(*) AS cnt FROM quest_campaigns WHERE status = 'ACTIVE'`);

  // Per-quest completion counts
  const questBreakdown = await queryAll(`
    SELECT q.title, q.slug, COUNT(qc.id) AS completions, q.seeds_reward
    FROM quests q
    LEFT JOIN quest_completions qc ON qc.quest_id = q.id AND qc.status = 'VERIFIED'
    WHERE q.active = true
    GROUP BY q.id, q.title, q.slug, q.seeds_reward
    ORDER BY completions DESC
    LIMIT 20
  `);

  // Registrations by day (last 14 days)
  const registrationsByDay = await queryAll(`
    SELECT DATE(registered_at) AS day, COUNT(*) AS count
    FROM quest_registrations
    WHERE registered_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE(registered_at)
    ORDER BY day ASC
  `);

  // Completions by day (last 14 days)
  const completionsByDay = await queryAll(`
    SELECT DATE(created_at) AS day, COUNT(*) AS count
    FROM quest_completions
    WHERE status = 'VERIFIED' AND created_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `);

  // XP minted by day (last 14 days)
  const xpByDay = await queryAll(`
    SELECT DATE(created_at) AS day, COALESCE(SUM(delta), 0) AS xp
    FROM seeds_ledger
    WHERE created_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `);

  return {
    totalRegistered: parseInt(totalRegistered?.cnt || '0', 10),
    totalCompletions: parseInt(totalCompletions?.cnt || '0', 10),
    totalSeedsMinted: parseInt(totalSeeds?.total || '0', 10),
    invitesUsed: parseInt(invitesUsed?.total || '0', 10),
    invitesTotal: parseInt(invitesTotal?.cnt || '0', 10),
    pendingReview: parseInt(pendingReview?.cnt || '0', 10),
    totalActiveQuests: parseInt(totalQuests?.cnt || '0', 10),
    totalActiveCampaigns: parseInt(totalCampaigns?.cnt || '0', 10),
    questBreakdown: questBreakdown.map(r => ({
      title: r.title, slug: r.slug,
      completions: parseInt(r.completions || '0', 10),
      seeds_reward: r.seeds_reward,
    })),
    registrationsByDay: registrationsByDay.map(r => ({ day: r.day, count: parseInt(r.count, 10) })),
    completionsByDay: completionsByDay.map(r => ({ day: r.day, count: parseInt(r.count, 10) })),
    xpByDay: xpByDay.map(r => ({ day: r.day, xp: parseInt(r.xp, 10) })),
  };
}

// ---------------------------------------------------------------------------
// Ginie Invite Code Giveaway
// ---------------------------------------------------------------------------

/**
 * Check if a wallet has completed both Ginie giveaway quests.
 * Returns { eligible, alreadyClaimed, code }
 */
export async function claimGinieInviteCode(wallet) {
  if (!wallet) throw Object.assign(new Error('Wallet required'), { status: 400 });

  // Normalise: strip whitespace, keep original case (SS58 is case-sensitive)
  const w = wallet.trim();

  // Check if already claimed (also check via quest_registrations evm_address linkage)
  const existing = await queryOne(
    `SELECT code FROM ginie_invite_codes WHERE claimed_by = $1`,
    [w]
  );
  if (existing) return { eligible: true, alreadyClaimed: true, code: existing.code };

  // Both quests must be VERIFIED — check both the SS58 wallet AND any linked EVM address
  const walletVariants = [w];
  try {
    const reg = await queryOne(
      `SELECT wallet, evm_address FROM quest_registrations WHERE wallet = $1 OR evm_address = $1`,
      [w]
    );
    if (reg) {
      if (reg.wallet && !walletVariants.includes(reg.wallet)) walletVariants.push(reg.wallet);
      if (reg.evm_address && !walletVariants.includes(reg.evm_address)) walletVariants.push(reg.evm_address);
    }
  } catch (_) {}

  const walletList = walletVariants.map((_, i) => `$${i + 1}`).join(', ');

  const welcomeDone = await queryOne(
    `SELECT qc.id FROM quest_completions qc
     JOIN quests q ON q.id = qc.quest_id
     WHERE qc.wallet IN (${walletList}) AND q.slug = 'ginie-welcome' AND qc.status = 'VERIFIED'`,
    walletVariants
  );
  const telegramDone = await queryOne(
    `SELECT qc.id FROM quest_completions qc
     JOIN quests q ON q.id = qc.quest_id
     WHERE qc.wallet IN (${walletList}) AND q.slug = 'ginie-join-telegram' AND qc.status = 'VERIFIED'`,
    walletVariants
  );

  console.log(`[ginie] claim check wallet=${w} variants=${walletVariants.length} welcome=${!!welcomeDone} telegram=${!!telegramDone}`);

  if (!welcomeDone || !telegramDone) {
    return { eligible: false, alreadyClaimed: false, code: null };
  }

  // Claim an available code atomically using a CTE with FOR UPDATE SKIP LOCKED
  const row = await queryOne(
    `WITH next_code AS (
       SELECT id FROM ginie_invite_codes
       WHERE claimed_by IS NULL
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE ginie_invite_codes
     SET claimed_by = $1, claimed_at = NOW()
     FROM next_code
     WHERE ginie_invite_codes.id = next_code.id
     RETURNING ginie_invite_codes.code`,
    [wallet]
  );

  if (!row) throw Object.assign(new Error('No Ginie invite codes remaining'), { status: 503 });

  console.log(`[ginie] Invite code ${row.code} claimed by ${wallet}`);
  return { eligible: true, alreadyClaimed: false, code: row.code };
}

import { query, queryOne, queryAll } from './db.mjs';
import { executeVftTransfer } from './token-service.mjs';
import { toBaseUnits } from '../utils/decimals.mjs';
import { getToken } from '../config/tokens.mjs';

// ---------------------------------------------------------------------------
// Campaign CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new campaign in DRAFT status.
 */
export async function createCampaign({
  creatorWallet, title, description, poolAmount, token,
  trackType, startDate, endDate,
  requiredHashtags, requiredMentions,
  githubRepoUrl, githubIssueLabels,
  maxOssContributions, maxContentContributions, scoreThreshold,
}) {
  // Always start as DRAFT — becomes FUNDED/ACTIVE only after creator funds the pool on-chain.
  const initialStatus = 'DRAFT';

  const campaign = await queryOne(
    `INSERT INTO campaigns (
       creator_wallet, title, description,
       pool_amount, pool_remaining, token, status, track_type,
       start_date, end_date,
       required_hashtags, required_mentions,
       github_repo_url, github_issue_labels,
       max_oss_contributions, max_content_contributions, score_threshold
     ) VALUES (
       $1, $2, $3,
       $4, $4, $5, $6, $7,
       $8, $9,
       $10, $11,
       $12, $13,
       $14, $15, $16
     ) RETURNING *`,
    [
      creatorWallet, title, description || null,
      poolAmount, token || 'WUSDC', initialStatus, trackType || 'BOTH',
      startDate, endDate,
      requiredHashtags || null, requiredMentions || null,
      githubRepoUrl || null, githubIssueLabels || null,
      maxOssContributions ?? 3, maxContentContributions ?? 10, scoreThreshold ?? 70,
    ]
  );

  console.log(`[campaigns] Created campaign "${title}" (${campaign.id}) — ${initialStatus}`);
  return campaign;
}

/**
 * Fund a campaign. Stores the tx_hash, sets pool_remaining = pool_amount.
 * Transitions DRAFT → FUNDED (or ACTIVE if start_date <= now).
 */
export async function fundCampaign(campaignId, wallet, txHash) {
  const campaign = await queryOne(
    `SELECT * FROM campaigns WHERE id = $1`, [campaignId]
  );
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  if (campaign.creator_wallet !== wallet && wallet !== 'PLATFORM') {
    throw Object.assign(new Error('Only the campaign creator can fund this campaign'), { status: 403 });
  }

  if (campaign.status !== 'DRAFT') {
    throw Object.assign(new Error(`Campaign cannot be funded in status: ${campaign.status}`), { status: 400 });
  }

  const now = new Date();
  const startDate = new Date(campaign.start_date);
  const newStatus = startDate <= now ? 'ACTIVE' : 'FUNDED';

  const updated = await queryOne(
    `UPDATE campaigns
     SET status = $1, funding_tx_hash = $2, pool_remaining = pool_amount, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [newStatus, txHash || null, campaignId]
  );

  console.log(`[campaigns] Funded campaign ${campaignId} (${txHash || 'no-tx'}) → ${newStatus}`);
  return updated;
}

/**
 * Get a single campaign by ID, including participant count.
 */
export async function getCampaign(campaignId) {
  const campaign = await queryOne(
    `SELECT c.*,
            (SELECT COUNT(*) FROM campaign_participants cp WHERE cp.campaign_id = c.id) AS participant_count
     FROM campaigns c WHERE c.id = $1`,
    [campaignId]
  );
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });
  return campaign;
}

/**
 * List campaigns with optional filters. Paginated.
 */
export async function listCampaigns({ status, trackType, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`c.status = $${idx++}`);
    params.push(status);
  }
  if (trackType) {
    conditions.push(`c.track_type = $${idx++}`);
    params.push(trackType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const campaigns = await queryAll(
    `SELECT c.*,
            (SELECT COUNT(*) FROM campaign_participants cp WHERE cp.campaign_id = c.id) AS participant_count
     FROM campaigns c
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM campaigns c ${where}`,
    params.slice(0, params.length - 2) // exclude limit/offset
  );

  return {
    campaigns,
    total: parseInt(countRow?.cnt || '0', 10),
    page,
    limit,
  };
}

/**
 * List only ACTIVE campaigns.
 */
export async function getActiveCampaigns() {
  return queryAll(
    `SELECT c.*,
            (SELECT COUNT(*) FROM campaign_participants cp WHERE cp.campaign_id = c.id) AS participant_count
     FROM campaigns c
     WHERE c.status = 'ACTIVE'
     ORDER BY c.end_date ASC`
  );
}

/**
 * Enroll a wallet in a campaign. Campaign must be ACTIVE.
 */
export async function enrollInCampaign(campaignId, wallet) {
  const campaign = await queryOne(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  if (campaign.status !== 'ACTIVE') {
    throw Object.assign(new Error(`Cannot enroll — campaign status is ${campaign.status}`), { status: 400 });
  }

  // Auto-register as participant if not already registered
  const participant = await queryOne(`SELECT wallet FROM participants WHERE wallet = $1`, [wallet]);
  if (!participant) {
    await queryOne(
      `INSERT INTO participants (wallet, display_name, track) VALUES ($1, $2, $3)
       ON CONFLICT (wallet) DO NOTHING RETURNING *`,
      [wallet, wallet.slice(0, 8) + '...' + wallet.slice(-4), campaign.track_type || 'BOTH']
    );
    console.log(`[campaigns] Auto-registered participant ${wallet}`);
  }

  let enrollment;
  try {
    enrollment = await queryOne(
      `INSERT INTO campaign_participants (campaign_id, wallet)
       VALUES ($1, $2) RETURNING *`,
      [campaignId, wallet]
    );
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('Already enrolled in this campaign'), { status: 409 });
    }
    throw err;
  }

  console.log(`[campaigns] ${wallet} enrolled in campaign ${campaignId}`);
  return enrollment;
}

/**
 * Get participants in a campaign, ordered by campaign_xp.
 */
export async function getCampaignParticipants(campaignId, page = 1, limit = 50) {
  const offset = (page - 1) * limit;

  const participants = await queryAll(
    `SELECT cp.wallet, cp.campaign_xp, cp.enrolled_at,
            p.display_name, p.github_handle, p.x_handle, p.track
     FROM campaign_participants cp
     JOIN participants p ON p.wallet = cp.wallet
     WHERE cp.campaign_id = $1
     ORDER BY cp.campaign_xp DESC, cp.enrolled_at ASC
     LIMIT $2 OFFSET $3`,
    [campaignId, limit, offset]
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM campaign_participants WHERE campaign_id = $1`,
    [campaignId]
  );

  return {
    participants,
    total: parseInt(countRow?.cnt || '0', 10),
    page,
    limit,
  };
}

// ---------------------------------------------------------------------------
// Per-Campaign Leaderboard
// ---------------------------------------------------------------------------

/**
 * Get the leaderboard for a specific campaign.
 */
export async function getCampaignLeaderboard(campaignId, page = 1, limit = 50) {
  const campaign = await queryOne(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  const offset = (page - 1) * limit;

  const participants = await queryAll(
    `SELECT cp.wallet, cp.campaign_xp, cp.enrolled_at,
            p.display_name, p.github_handle, p.x_handle, p.track
     FROM campaign_participants cp
     JOIN participants p ON p.wallet = cp.wallet
     WHERE cp.campaign_id = $1
     ORDER BY cp.campaign_xp DESC, cp.enrolled_at ASC
     LIMIT $2 OFFSET $3`,
    [campaignId, limit, offset]
  );

  const totalXPRow = await queryOne(
    `SELECT COALESCE(SUM(campaign_xp), 0) AS total FROM campaign_participants WHERE campaign_id = $1`,
    [campaignId]
  );
  const totalXP = parseInt(totalXPRow?.total || '0', 10);

  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM campaign_participants WHERE campaign_id = $1`,
    [campaignId]
  );
  const totalParticipants = parseInt(countRow?.cnt || '0', 10);

  const poolAmount = parseFloat(campaign.pool_amount);

  const entries = participants.map((p, i) => {
    const rank = offset + i + 1;
    const estimatedUSDC = totalXP > 0
      ? Math.round((p.campaign_xp / totalXP) * poolAmount * 100) / 100
      : 0;

    return {
      rank,
      wallet: p.wallet,
      displayName: p.display_name || p.github_handle || p.x_handle || p.wallet,
      github_handle: p.github_handle || null,
      x_handle: p.x_handle || null,
      track: p.track,
      campaignXP: p.campaign_xp,
      estimatedUSDC,
      enrolledAt: p.enrolled_at,
    };
  });

  return {
    campaignId,
    title: campaign.title,
    status: campaign.status,
    poolAmount,
    totalXP,
    totalParticipants,
    page,
    limit,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Per-Campaign XP
// ---------------------------------------------------------------------------

/**
 * Award XP within a specific campaign.
 * Updates campaign_participants.campaign_xp for the wallet in that campaign.
 */
export async function awardCampaignXP(campaignId, wallet, xpDelta, contributionId = null) {
  // Update campaign_participants XP
  const updated = await queryOne(
    `UPDATE campaign_participants
     SET campaign_xp = campaign_xp + $1
     WHERE campaign_id = $2 AND wallet = $3
     RETURNING *`,
    [xpDelta, campaignId, wallet]
  );

  if (!updated) {
    console.warn(`[campaigns] Cannot award campaign XP — ${wallet} not enrolled in ${campaignId}`);
    return null;
  }

  console.log(`[campaigns] +${xpDelta} campaign XP to ${wallet} in ${campaignId}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Payout Preview & Execution
// ---------------------------------------------------------------------------

const MINIMUM_PAYOUT = 1.0; // $1.00 USDC

/**
 * Preview payout distribution for a campaign (read-only).
 */
export async function getCampaignPayoutPreview(campaignId) {
  const campaign = await queryOne(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  const participants = await queryAll(
    `SELECT cp.wallet, cp.campaign_xp,
            p.display_name, p.github_handle, p.x_handle, p.track
     FROM campaign_participants cp
     JOIN participants p ON p.wallet = cp.wallet
     WHERE cp.campaign_id = $1 AND cp.campaign_xp > 0
     ORDER BY cp.campaign_xp DESC`,
    [campaignId]
  );

  const totalXP = participants.reduce((sum, p) => sum + p.campaign_xp, 0);
  const poolAmount = parseFloat(campaign.pool_amount);

  const payouts = participants.map((p, i) => {
    const share = totalXP > 0 ? p.campaign_xp / totalXP : 0;
    const usdc = Math.round(share * poolAmount * 100) / 100;
    return {
      rank: i + 1,
      wallet: p.wallet,
      displayName: p.display_name || p.github_handle || p.x_handle || p.wallet,
      track: p.track,
      xpEarned: p.campaign_xp,
      xpShare: Math.round(share * 10000) / 100,
      estimatedUSDC: usdc,
      belowMinimum: usdc < MINIMUM_PAYOUT,
    };
  });

  return {
    campaignId,
    title: campaign.title,
    status: campaign.status,
    poolAmount,
    totalXP,
    totalParticipants: participants.length,
    minimumPayout: MINIMUM_PAYOUT,
    generatedAt: new Date().toISOString(),
    payouts,
  };
}

/**
 * Execute payout for a campaign.
 * V1: Calculation-only — inserts campaign_payouts rows with status=PENDING,
 * transitions campaign ENDED → SETTLING → CLOSED.
 * Does NOT execute on-chain transfers (that's V2).
 */
export async function executeCampaignPayout(campaignId) {
  const campaign = await queryOne(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  if (campaign.status !== 'ENDED') {
    throw Object.assign(
      new Error(`Payout can only be executed on ENDED campaigns (current: ${campaign.status})`),
      { status: 400 }
    );
  }

  // Close all active contributions for this campaign before payout
  await query(
    `UPDATE contributions SET status = 'CLOSED', updated_at = NOW()
     WHERE campaign_id = $1 AND status IN ('ACTIVE', 'MERGED', 'PENDING')`,
    [campaignId]
  );

  // Transition to SETTLING
  await query(
    `UPDATE campaigns SET status = 'SETTLING', updated_at = NOW() WHERE id = $1`,
    [campaignId]
  );

  const participants = await queryAll(
    `SELECT cp.wallet, cp.campaign_xp
     FROM campaign_participants cp
     WHERE cp.campaign_id = $1 AND cp.campaign_xp > 0
     ORDER BY cp.campaign_xp DESC`,
    [campaignId]
  );

  const totalXP = participants.reduce((sum, p) => sum + p.campaign_xp, 0);
  const poolAmount = parseFloat(campaign.pool_amount);

  let totalPaidOut = 0;
  const payoutRows = [];

  for (const p of participants) {
    const share = totalXP > 0 ? p.campaign_xp / totalXP : 0;
    const usdc = Math.round(share * poolAmount * 100) / 100;
    const belowMin = usdc < MINIMUM_PAYOUT;

    const row = await queryOne(
      `INSERT INTO campaign_payouts (campaign_id, wallet, xp_earned, xp_share, usdc_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        campaignId, p.wallet, p.campaign_xp,
        Math.round(share * 1000000) / 1000000,
        usdc,
        belowMin ? 'BELOW_MINIMUM' : 'PENDING',
      ]
    );

    if (!belowMin) totalPaidOut += usdc;
    payoutRows.push(row);
  }

  // Update pool_remaining
  const remaining = Math.round((poolAmount - totalPaidOut) * 100) / 100;
  await query(
    `UPDATE campaigns SET pool_remaining = $1, updated_at = NOW() WHERE id = $2`,
    [Math.max(0, remaining), campaignId]
  );

  // -----------------------------------------------------------------
  // Execute on-chain VFT transfers from the platform escrow wallet to each winner.
  // For each payout row with status=PENDING, call executeVftTransfer and record tx_hash.
  // -----------------------------------------------------------------
  const tokenSymbol = campaign.token || 'WUSDC';
  const tok = getToken(tokenSymbol);
  if (!tok || tok.vara === 'native') {
    console.error(`[campaigns] Cannot execute payout: unsupported token ${tokenSymbol}`);
  } else {
    for (const row of payoutRows) {
      if (row.status !== 'PENDING') continue;
      try {
        const amountBase = toBaseUnits(String(row.usdc_amount), tok.decimals).toString();
        const { txHash, blockHash } = await executeVftTransfer(tokenSymbol, row.wallet, amountBase);
        await query(
          `UPDATE campaign_payouts SET status = 'EXECUTED', tx_hash = $1, executed_at = NOW() WHERE id = $2`,
          [txHash || blockHash || null, row.id]
        );
        console.log(`[campaigns] Paid ${row.usdc_amount} ${tok.symbol} to ${row.wallet} (tx: ${txHash?.slice(0, 14) || '?'})`);
      } catch (err) {
        console.error(`[campaigns] Payout failed for ${row.wallet}: ${err.message}`);
        await query(
          `UPDATE campaign_payouts SET status = 'FAILED', error = $1 WHERE id = $2`,
          [err.message?.slice(0, 500) || 'unknown error', row.id]
        );
      }
    }
  }

  // Transition to CLOSED once all transfers attempted
  await query(
    `UPDATE campaigns SET status = 'CLOSED', updated_at = NOW() WHERE id = $1`,
    [campaignId]
  );

  console.log(`[campaigns] Payout executed for campaign ${campaignId}: ${payoutRows.length} rows, $${totalPaidOut} ${tokenSymbol}`);

  return {
    campaignId,
    status: 'CLOSED',
    totalParticipants: participants.length,
    totalXP,
    poolAmount,
    totalPaidOut,
    poolRemaining: Math.max(0, remaining),
    payouts: payoutRows,
  };
}

// ---------------------------------------------------------------------------
// Campaign Matching (for agents)
// ---------------------------------------------------------------------------

/**
 * Find active campaigns that match a tweet's hashtags and mentions.
 * Returns campaigns where the tweet text contains at least one required hashtag
 * AND at least one required mention for that campaign.
 */
export async function matchCampaignsForTweet(hashtags = [], mentions = []) {
  const activeCampaigns = await queryAll(
    `SELECT * FROM campaigns
     WHERE status = 'ACTIVE'
       AND track_type IN ('CONTENT', 'BOTH')
       AND (required_hashtags IS NOT NULL OR required_mentions IS NOT NULL)`
  );

  const lowerHashtags = hashtags.map(h => h.toLowerCase());
  const lowerMentions = mentions.map(m => m.toLowerCase().replace(/^@/, ''));

  return activeCampaigns.filter(c => {
    const reqHashtags = (c.required_hashtags || []).map(h => h.toLowerCase());
    const reqMentions = (c.required_mentions || []).map(m => m.toLowerCase().replace(/^@/, ''));

    const hashtagMatch = reqHashtags.length === 0 ||
      reqHashtags.some(rh => lowerHashtags.includes(rh) || lowerHashtags.includes(rh.replace('#', '')));
    const mentionMatch = reqMentions.length === 0 ||
      reqMentions.some(rm => lowerMentions.includes(rm));

    return hashtagMatch && mentionMatch;
  });
}

/**
 * Find active campaigns that match a GitHub repo URL and optional issue labels.
 */
export async function matchCampaignsForPR(repoUrl, issueLabels = []) {
  const activeCampaigns = await queryAll(
    `SELECT * FROM campaigns
     WHERE status = 'ACTIVE'
       AND track_type IN ('OSS', 'BOTH')
       AND github_repo_url IS NOT NULL`
  );

  const normalizeUrl = (url) => (url || '').toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
  const normalizedRepo = normalizeUrl(repoUrl);

  return activeCampaigns.filter(c => {
    const campaignRepo = normalizeUrl(c.github_repo_url);
    if (campaignRepo !== normalizedRepo) return false;

    // If campaign has issue label filters, at least one must match
    const reqLabels = c.github_issue_labels || [];
    if (reqLabels.length === 0) return true;

    const lowerLabels = issueLabels.map(l => l.toLowerCase());
    return reqLabels.some(rl => lowerLabels.includes(rl.toLowerCase()));
  });
}

// ---------------------------------------------------------------------------
// Contribution Limit Checks
// ---------------------------------------------------------------------------

/**
 * Check if a wallet has reached the contribution limit for a campaign + track.
 */
export async function checkContributionLimit(campaignId, wallet, track) {
  const campaign = await queryOne(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
  if (!campaign) return { allowed: false, reason: 'Campaign not found' };

  const limitColumn = track === 'OSS' ? 'max_oss_contributions' : 'max_content_contributions';
  const maxLimit = campaign[limitColumn];

  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM contributions
     WHERE campaign_id = $1 AND wallet = $2 AND track = $3
       AND status NOT IN ('REJECTED', 'DELETED')`,
    [campaignId, wallet, track]
  );
  const currentCount = parseInt(countRow?.cnt || '0', 10);

  if (currentCount >= maxLimit) {
    return { allowed: false, reason: `Limit reached: ${currentCount}/${maxLimit} ${track} contributions` };
  }

  return { allowed: true, currentCount, maxLimit };
}

// ---------------------------------------------------------------------------
// User's Campaign View
// ---------------------------------------------------------------------------

/**
 * Get all campaigns a wallet is enrolled in, with per-campaign stats.
 */
export async function getUserCampaigns(wallet) {
  const campaigns = await queryAll(
    `SELECT c.*, cp.campaign_xp, cp.enrolled_at,
            (SELECT COUNT(*) FROM campaign_participants cp2 WHERE cp2.campaign_id = c.id) AS participant_count,
            (SELECT COALESCE(SUM(cp3.campaign_xp), 0) FROM campaign_participants cp3 WHERE cp3.campaign_id = c.id) AS total_campaign_xp
     FROM campaign_participants cp
     JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.wallet = $1
     ORDER BY c.created_at DESC`,
    [wallet]
  );

  return campaigns.map(c => {
    const poolAmount = parseFloat(c.pool_amount);
    const totalCampaignXP = parseInt(c.total_campaign_xp || '0', 10);
    const userXP = c.campaign_xp;
    const estimatedUSDC = totalCampaignXP > 0
      ? Math.round((userXP / totalCampaignXP) * poolAmount * 100) / 100
      : 0;

    // Calculate user's rank within this campaign
    // (We'd need a subquery for this, but we can approximate from total_campaign_xp)

    return {
      campaignId: c.id,
      title: c.title,
      description: c.description,
      status: c.status,
      trackType: c.track_type,
      poolAmount,
      token: c.token,
      startDate: c.start_date,
      endDate: c.end_date,
      participantCount: parseInt(c.participant_count || '0', 10),
      userXP,
      totalCampaignXP,
      estimatedUSDC,
      enrolledAt: c.enrolled_at,
    };
  });
}

/**
 * Get user rank within a specific campaign.
 */
export async function getUserCampaignRank(campaignId, wallet) {
  const rankRow = await queryOne(
    `SELECT COUNT(*) + 1 AS rank
     FROM campaign_participants
     WHERE campaign_id = $1 AND campaign_xp > (
       SELECT COALESCE(campaign_xp, 0) FROM campaign_participants
       WHERE campaign_id = $1 AND wallet = $2
     )`,
    [campaignId, wallet]
  );
  return parseInt(rankRow?.rank || '0', 10);
}

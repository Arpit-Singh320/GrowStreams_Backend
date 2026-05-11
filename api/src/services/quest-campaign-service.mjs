import { queryOne, queryAll } from './db.mjs';

// Weekly boundary helper (ISO week, Monday 00:00 UTC)
const WEEK_START_SQL = `date_trunc('week', NOW() AT TIME ZONE 'UTC')`;

/**
 * List all quest campaigns ordered by sort_order.
 * Each campaign includes total quest count and total Seeds pool.
 */
export async function listQuestCampaigns() {
  return queryAll(`
    SELECT
      qc.*,
      COUNT(q.id)::int          AS quest_count,
      COALESCE(SUM(q.seeds_reward), 0)::int AS total_seeds_pool
    FROM quest_campaigns qc
    LEFT JOIN quests q ON q.campaign_id = qc.id AND q.active = TRUE
    WHERE qc.status = 'ACTIVE' AND qc.slug IS NOT NULL AND qc.slug <> ''
    GROUP BY qc.id
    ORDER BY qc.sort_order ASC, qc.created_at ASC
  `);
}

/**
 * Get a single quest campaign with its full quest list.
 */
export async function getQuestCampaignBySlug(slug) {
  const campaign = await queryOne(
    `SELECT * FROM quest_campaigns WHERE slug = $1`,
    [slug]
  );
  if (!campaign) return null;

  const quests = await queryAll(
    `SELECT * FROM quests WHERE campaign_id = $1 AND active = TRUE ORDER BY sort_order ASC`,
    [campaign.id]
  );

  return { ...campaign, quests };
}

/**
 * Get a wallet's progress inside a specific campaign.
 * Returns the campaign, its quests with completion status, total Seeds earned in this campaign,
 * and a completion percentage.
 */
export async function getCampaignProgress(slug, wallet) {
  const campaign = await queryOne(
    `SELECT * FROM quest_campaigns WHERE slug = $1`,
    [slug]
  );
  if (!campaign) return null;

  const quests = await queryAll(
    `SELECT * FROM quests WHERE campaign_id = $1 AND active = TRUE ORDER BY sort_order ASC`,
    [campaign.id]
  );

  if (!quests.length) {
    return { ...campaign, quests: [], totalSeeds: 0, completedCount: 0, completionPct: 0 };
  }

  const questIds = quests.map(q => q.id);

  // All completions for this wallet in these quests
  const completions = await queryAll(
    `SELECT * FROM quest_completions
     WHERE wallet = $1 AND quest_id = ANY($2::int[])
     ORDER BY created_at DESC`,
    [wallet, questIds]
  );

  // Seeds earned within this campaign
  const seedsRow = await queryOne(
    `SELECT COALESCE(SUM(sl.delta), 0) AS total
     FROM seeds_ledger sl
     WHERE sl.wallet = $1 AND sl.quest_id = ANY($2::int[])`,
    [wallet, questIds]
  );
  const totalSeeds = parseInt(seedsRow?.total || '0', 10);

  // Week boundary for repeatable quests
  const now = new Date();
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const weekStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday
  ));

  const isThisWeek = (c) => {
    const t = c.verified_at || c.created_at;
    return t && new Date(t) >= weekStart;
  };

  // Map completions by quest_id
  const completionMap = {};
  for (const c of completions) {
    if (!completionMap[c.quest_id]) completionMap[c.quest_id] = [];
    completionMap[c.quest_id].push(c);
  }

  const questsWithStatus = quests.map(q => {
    const qCompletions = completionMap[q.id] || [];
    const verified = qCompletions.filter(c => c.status === 'VERIFIED');
    const verifiedThisWeek = verified.filter(isThisWeek);
    const pending = qCompletions.find(c => c.status === 'PENDING' && isThisWeek(c)) || null;
    const isCompleted = q.repeatable ? verifiedThisWeek.length > 0 : verified.length > 0;
    const seedsEarned = verified.reduce((sum, c) => sum + c.seeds_awarded, 0);

    return {
      ...q,
      completed: isCompleted,
      completionCount: verified.length,
      seedsEarned,
      pendingSubmission: pending,
    };
  });

  const completedCount = questsWithStatus.filter(q => q.completed).length;
  const completionPct = Math.round((completedCount / quests.length) * 100);
  const allDone = completedCount === quests.length;

  return {
    ...campaign,
    quests: questsWithStatus,
    totalSeeds,
    completedCount,
    questCount: quests.length,
    completionPct,
    allCompleted: allDone,
    bonusEligible: allDone,
  };
}

/**
 * Campaign-level leaderboard: wallets ranked by Seeds earned within this campaign.
 */
export async function getCampaignLeaderboardBySlug(slug, limit = 50) {
  const campaign = await queryOne(
    `SELECT id FROM quest_campaigns WHERE slug = $1`,
    [slug]
  );
  if (!campaign) return null;

  return queryAll(`
    SELECT
      r.wallet,
      r.x_username,
      r.github_username,
      r.registered_at,
      COALESCE(s.seeds, 0)::int    AS seeds_earned,
      COALESCE(c.completed, 0)::int AS quests_completed
    FROM quest_registrations r
    LEFT JOIN (
      SELECT sl.wallet, SUM(sl.delta) AS seeds
      FROM seeds_ledger sl
      WHERE sl.quest_id IN (SELECT id FROM quests WHERE campaign_id = $1)
      GROUP BY sl.wallet
    ) s ON s.wallet = r.wallet
    LEFT JOIN (
      SELECT qc.wallet, COUNT(DISTINCT qc.quest_id) AS completed
      FROM quest_completions qc
      WHERE qc.quest_id IN (SELECT id FROM quests WHERE campaign_id = $1)
        AND qc.status = 'VERIFIED'
      GROUP BY qc.wallet
    ) c ON c.wallet = r.wallet
    ORDER BY seeds_earned DESC, r.registered_at ASC
    LIMIT $2
  `, [campaign.id, limit]);
}

/**
 * Prize board for a campaign: top-N users ranked by Seeds in that campaign,
 * with their VARA prize amount overlaid from campaign.meta.prize_pool.tiers.
 * Returns null if campaign not found.
 */
export async function getCampaignPrizeBoard(slug, limit = 10) {
  const campaign = await queryOne(
    `SELECT id, meta FROM quest_campaigns WHERE slug = $1`,
    [slug]
  );
  if (!campaign) return null;

  const rows = await queryAll(`
    SELECT
      r.wallet,
      r.x_username,
      r.github_username,
      COALESCE(s.seeds, 0)::int     AS seeds_earned,
      COALESCE(c.completed, 0)::int AS quests_completed,
      COALESCE(sl.tx_count, 0)::int AS onchain_txs
    FROM quest_registrations r
    LEFT JOIN (
      SELECT sl.wallet, SUM(sl.delta) AS seeds
      FROM seeds_ledger sl
      WHERE sl.quest_id IN (SELECT id FROM quests WHERE campaign_id = $1)
      GROUP BY sl.wallet
    ) s ON s.wallet = r.wallet
    LEFT JOIN (
      SELECT qc.wallet, COUNT(DISTINCT qc.quest_id) AS completed
      FROM quest_completions qc
      WHERE qc.quest_id IN (SELECT id FROM quests WHERE campaign_id = $1)
        AND qc.status = 'VERIFIED'
      GROUP BY qc.wallet
    ) c ON c.wallet = r.wallet
    LEFT JOIN (
      SELECT sl2.wallet, COUNT(*) AS tx_count
      FROM seeds_ledger sl2
      WHERE sl2.quest_id IN (SELECT id FROM quests WHERE campaign_id = $1)
        AND sl2.tx_hash IS NOT NULL
      GROUP BY sl2.wallet
    ) sl ON sl.wallet = r.wallet
    ORDER BY seeds_earned DESC, r.registered_at ASC
    LIMIT $2
  `, [campaign.id, limit]);

  const tiers = campaign.meta?.prize_pool?.tiers || [];

  const prizeBoard = rows.map((row, idx) => {
    const rank = idx + 1;
    const tier = tiers.find(t => t.rank === rank) || null;
    return {
      rank,
      wallet: row.wallet,
      x_username: row.x_username,
      github_username: row.github_username,
      seeds_earned: row.seeds_earned,
      quests_completed: row.quests_completed,
      onchain_txs: row.onchain_txs,
      vara_prize: tier?.vara || 0,
      prize_label: tier?.label || null,
    };
  });

  return {
    campaign_slug: slug,
    prize_pool: campaign.meta?.prize_pool || null,
    end_date: campaign.meta?.end_date || null,
    prize_board: prizeBoard,
  };
}

/**
 * Admin: create or update a quest campaign.
 */
export async function upsertQuestCampaign(data) {
  const {
    slug, title, description = '', partner = null, banner_url = null,
    badge_label = null, difficulty = 'EASY', status = 'ACTIVE',
    reward_summary = null, bonus_xp = 0, start_date = null,
    end_date = null, sort_order = 0, meta = {},
  } = data;

  return queryOne(`
    INSERT INTO quest_campaigns
      (slug, title, description, partner, banner_url, badge_label, difficulty,
       status, reward_summary, bonus_xp, start_date, end_date, sort_order, meta)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (slug) DO UPDATE SET
      title          = EXCLUDED.title,
      description    = EXCLUDED.description,
      partner        = EXCLUDED.partner,
      banner_url     = EXCLUDED.banner_url,
      badge_label    = EXCLUDED.badge_label,
      difficulty     = EXCLUDED.difficulty,
      status         = EXCLUDED.status,
      reward_summary = EXCLUDED.reward_summary,
      bonus_xp       = EXCLUDED.bonus_xp,
      start_date     = EXCLUDED.start_date,
      end_date       = EXCLUDED.end_date,
      sort_order     = EXCLUDED.sort_order,
      meta           = EXCLUDED.meta
    RETURNING *
  `, [slug, title, description, partner, banner_url, badge_label, difficulty,
      status, reward_summary, bonus_xp, start_date, end_date, sort_order, JSON.stringify(meta)]);
}

/**
 * Admin: create or update a quest (upsert by slug).
 */
export async function upsertQuest(data) {
  const {
    slug, title, description = '', quest_type, seeds_reward = 0,
    icon = null, repeatable = false, active = true, sort_order = 99,
    meta = {}, campaign_slug = null,
  } = data;

  if (!slug || !title || !quest_type) {
    throw Object.assign(new Error('slug, title and quest_type are required'), { status: 400 });
  }

  const VALID_TYPES = [
    'WELCOME', 'X_FOLLOW', 'X_MENTION', 'X_RETWEET', 'X_TWEET_KEYWORD',
    'GITHUB_STAR', 'GITHUB_PR', 'ONCHAIN_STREAM', 'VISIT_URL',
    'TELEGRAM_JOIN', 'REFERRAL',
  ];
  if (!VALID_TYPES.includes(quest_type)) {
    throw Object.assign(new Error(`Invalid quest_type. Must be one of: ${VALID_TYPES.join(', ')}`), { status: 400 });
  }

  let campaign_id = null;
  if (campaign_slug) {
    const camp = await queryOne(`SELECT id FROM quest_campaigns WHERE slug = $1`, [campaign_slug]);
    if (!camp) throw Object.assign(new Error(`Campaign not found: ${campaign_slug}`), { status: 404 });
    campaign_id = camp.id;
  }

  return queryOne(`
    INSERT INTO quests (slug, title, description, quest_type, seeds_reward, icon, repeatable, active, sort_order, meta, campaign_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (slug) DO UPDATE SET
      title        = EXCLUDED.title,
      description  = EXCLUDED.description,
      quest_type   = EXCLUDED.quest_type,
      seeds_reward = EXCLUDED.seeds_reward,
      icon         = EXCLUDED.icon,
      repeatable   = EXCLUDED.repeatable,
      active       = EXCLUDED.active,
      sort_order   = EXCLUDED.sort_order,
      meta         = EXCLUDED.meta,
      campaign_id  = COALESCE(EXCLUDED.campaign_id, quests.campaign_id)
    RETURNING *
  `, [slug, title, description, quest_type, seeds_reward, icon, repeatable, active, sort_order,
      JSON.stringify(meta), campaign_id]);
}

/**
 * Admin: list all quests with their campaign name.
 */
export async function listAllQuests() {
  return queryAll(`
    SELECT q.*, qc.slug AS campaign_slug, qc.title AS campaign_title
    FROM quests q
    LEFT JOIN quest_campaigns qc ON qc.id = q.campaign_id
    ORDER BY q.sort_order ASC, q.created_at ASC
  `);
}

/**
 * Admin: delete a campaign and all its quests (cascade).
 */
export async function deleteQuestCampaign(slug) {
  const campaign = await queryOne(`SELECT id FROM quest_campaigns WHERE slug = $1`, [slug]);
  if (!campaign) throw Object.assign(new Error(`Campaign not found: ${slug}`), { status: 404 });
  // Delete quests first (FK constraint)
  const deleted = await queryAll(`DELETE FROM quests WHERE campaign_id = $1 RETURNING slug`, [campaign.id]);
  await queryOne(`DELETE FROM quest_campaigns WHERE id = $1`, [campaign.id]);
  return { deleted_quests: deleted.map(q => q.slug) };
}

/**
 * Admin: delete a single quest by slug.
 */
export async function deleteQuest(slug) {
  const quest = await queryOne(`SELECT id FROM quests WHERE slug = $1`, [slug]);
  if (!quest) throw Object.assign(new Error(`Quest not found: ${slug}`), { status: 404 });
  await queryOne(`DELETE FROM quests WHERE id = $1`, [quest.id]);
  return { deleted: slug };
}

/**
 * Admin: assign a quest to a campaign.
 */
export async function assignQuestToCampaign(questSlug, campaignSlug) {
  const campaign = await queryOne(
    `SELECT id FROM quest_campaigns WHERE slug = $1`, [campaignSlug]
  );
  if (!campaign) throw new Error(`Campaign not found: ${campaignSlug}`);

  return queryOne(
    `UPDATE quests SET campaign_id = $1 WHERE slug = $2 RETURNING *`,
    [campaign.id, questSlug]
  );
}

import { query, queryOne, queryAll } from './db.mjs';

// ---------------------------------------------------------------------------
// Season Management Service
// ---------------------------------------------------------------------------

/**
 * Compute each wallet's CURRENT daily stream-creation streak.
 *
 * A streak is the number of consecutive UTC days (ending today or yesterday)
 * on which a wallet created at least one stream. If the most recent creation
 * was more than one day ago, the streak is considered broken (0) and the
 * wallet is omitted from the map.
 *
 * `stream_events.sender` holds the creator as a hex public key ("0x" + 32
 * bytes). Leaderboard wallets are SS58, so callers decode SS58 -> hex to match.
 * Returns a Map keyed by lowercase hex pubkey -> streak length (number).
 */
export async function getStreakMap() {
  // Gaps-and-islands: distinct active days per sender, then group consecutive
  // days by subtracting a per-sender row number — equal "grp" = consecutive run.
  const rows = await queryAll(`
    WITH active_days AS (
      SELECT DISTINCT sender,
             (created_at AT TIME ZONE 'UTC')::date AS day
      FROM stream_events
      WHERE event_type = 'created' AND sender IS NOT NULL
    ),
    grouped AS (
      SELECT sender, day,
             (day - (ROW_NUMBER() OVER (PARTITION BY sender ORDER BY day))::int) AS grp
      FROM active_days
    ),
    runs AS (
      SELECT sender, COUNT(*) AS len, MAX(day) AS last_day
      FROM grouped
      GROUP BY sender, grp
    )
    SELECT DISTINCT ON (sender) sender, len, last_day
    FROM runs
    ORDER BY sender, last_day DESC
  `);

  const map = new Map();
  for (const r of rows) {
    // Only count a streak as live if the last active day is today or yesterday.
    const last = new Date(r.last_day);
    const today = new Date();
    const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const utcLast = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
    const daysSince = Math.round((utcToday - utcLast) / 86400000);
    if (daysSince <= 1 && r.sender) {
      map.set(String(r.sender).toLowerCase(), parseInt(r.len, 10));
    }
  }
  return map;
}

/**
 * Resolve an SS58 (or already-hex) wallet to a lowercase "0x" hex pubkey so it
 * can be matched against stream_events.sender. Returns null on failure.
 */
async function walletToHexPubkey(wallet) {
  if (!wallet) return null;
  if (wallet.startsWith('0x')) return wallet.toLowerCase();
  try {
    const { decodeAddress } = await import('@polkadot/util-crypto');
    return ('0x' + Buffer.from(decodeAddress(wallet)).toString('hex')).toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Get all seasons ordered by start date (newest first).
 */
export async function getAllSeasons() {
  return queryAll(`
    SELECT id, name, slug, status, start_at, end_at, description, meta, created_at
    FROM seasons
    ORDER BY start_at DESC
  `);
}

/**
 * Get the currently active season.
 */
export async function getActiveSeason() {
  return queryOne(`
    SELECT id, name, slug, status, start_at, end_at, description, meta, created_at
    FROM seasons
    WHERE status = 'ACTIVE'
    ORDER BY start_at DESC
    LIMIT 1
  `);
}

/**
 * Get a season by ID or slug.
 */
export async function getSeason(idOrSlug) {
  const isNumeric = !isNaN(parseInt(idOrSlug, 10));
  if (isNumeric) {
    return queryOne(`SELECT * FROM seasons WHERE id = $1`, [parseInt(idOrSlug, 10)]);
  }
  return queryOne(`SELECT * FROM seasons WHERE slug = $1`, [idOrSlug]);
}

/**
 * Get leaderboard for a specific season.
 * Returns participants ranked by their Seeds earned in that season.
 * 
 * For Season 2+, we calculate: Season N XP = Total XP - XP earned before season start
 * This avoids relying on season_id which may be incorrectly set.
 */
export async function getSeasonLeaderboard(seasonId, page = 1, limit = 50, sortBy = 'seeds') {
  const offset = (page - 1) * limit;

  // Get season start date
  const season = await queryOne(`SELECT start_at FROM seasons WHERE id = $1`, [seasonId]);
  if (!season) throw new Error('Season not found');
  const seasonStart = season.start_at;

  // For Season 1, use all XP before Season 2 start
  // For Season 2+, use XP earned after season start date
  const isFirstSeason = seasonId === 1;

  // When sorting by streak we must rank across the WHOLE qualifying set, so we
  // fetch a wide window (offset 0, capped) and paginate in JS after attaching
  // streaks. Seeds-sorted requests keep efficient SQL LIMIT/OFFSET pagination.
  const byStreak = sortBy === 'streak';
  const fetchLimit = byStreak ? 1000 : limit;
  const fetchOffset = byStreak ? 0 : offset;

  let participants;
  if (isFirstSeason) {
    // Season 1: All XP before Season 2 start (May 24, 2026 11:20 UTC)
    // Use subqueries to avoid cartesian product from multiple JOINs
    const season2Start = '2026-05-24T11:20:00.000Z';
    participants = await queryAll(`
      SELECT 
        r.wallet,
        r.display_name,
        r.x_username,
        r.github_username,
        r.evm_address,
        COALESCE(s.total_seeds, 0) AS season_seeds,
        COALESCE(c.quest_count, 0) AS quest_completions
      FROM quest_registrations r
      LEFT JOIN (
        SELECT wallet, SUM(delta) AS total_seeds
        FROM seeds_ledger
        WHERE created_at < $1
        GROUP BY wallet
      ) s ON s.wallet = r.wallet
      LEFT JOIN (
        SELECT wallet, COUNT(*) AS quest_count
        FROM quest_completions
        WHERE status = 'VERIFIED' AND created_at < $1
        GROUP BY wallet
      ) c ON c.wallet = r.wallet
      WHERE COALESCE(s.total_seeds, 0) > 0
      ORDER BY season_seeds DESC
      LIMIT $2 OFFSET $3
    `, [season2Start, fetchLimit, fetchOffset]);
  } else {
    // Season 2+: XP earned after season start date
    // Use subqueries to avoid cartesian product from multiple JOINs
    participants = await queryAll(`
      SELECT 
        r.wallet,
        r.display_name,
        r.x_username,
        r.github_username,
        r.evm_address,
        COALESCE(s.total_seeds, 0) AS season_seeds,
        COALESCE(c.quest_count, 0) AS quest_completions
      FROM quest_registrations r
      LEFT JOIN (
        SELECT wallet, SUM(delta) AS total_seeds
        FROM seeds_ledger
        WHERE created_at >= $1
        GROUP BY wallet
      ) s ON s.wallet = r.wallet
      LEFT JOIN (
        SELECT wallet, COUNT(*) AS quest_count
        FROM quest_completions
        WHERE status = 'VERIFIED' AND created_at >= $1
        GROUP BY wallet
      ) c ON c.wallet = r.wallet
      WHERE COALESCE(s.total_seeds, 0) > 0
      ORDER BY season_seeds DESC
      LIMIT $2 OFFSET $3
    `, [seasonStart, fetchLimit, fetchOffset]);
  }

  // Get total count of participants with Seeds in this season (for pagination)
  let countRow;
  if (isFirstSeason) {
    const season2Start = '2026-05-24T11:20:00.000Z';
    countRow = await queryOne(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT wallet FROM seeds_ledger WHERE created_at < $1 AND delta > 0 GROUP BY wallet
      ) sub
    `, [season2Start]);
  } else {
    countRow = await queryOne(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT wallet FROM seeds_ledger WHERE created_at >= $1 AND delta > 0 GROUP BY wallet
      ) sub
    `, [seasonStart]);
  }
  const total = parseInt(countRow?.cnt || '0', 10);

  // Get total registered users (all-time, for display)
  const totalUsersRow = await queryOne(`
    SELECT COUNT(*) AS cnt FROM quest_registrations
  `);
  const totalRegisteredUsers = parseInt(totalUsersRow?.cnt || '0', 10);

  // Get total Seeds minted in this season (date-based)
  let seedsRow;
  if (isFirstSeason) {
    const season2Start = '2026-05-24T11:20:00.000Z';
    seedsRow = await queryOne(`
      SELECT COALESCE(SUM(delta), 0) AS total FROM seeds_ledger WHERE created_at < $1
    `, [season2Start]);
  } else {
    seedsRow = await queryOne(`
      SELECT COALESCE(SUM(delta), 0) AS total FROM seeds_ledger WHERE created_at >= $1
    `, [seasonStart]);
  }
  const totalSeeds = parseInt(seedsRow?.total || '0', 10);

  // Get total completions in this season (date-based)
  let completionsRow;
  if (isFirstSeason) {
    const season2Start = '2026-05-24T11:20:00.000Z';
    completionsRow = await queryOne(`
      SELECT COUNT(*) AS cnt FROM quest_completions WHERE status = 'VERIFIED' AND created_at < $1
    `, [season2Start]);
  } else {
    completionsRow = await queryOne(`
      SELECT COUNT(*) AS cnt FROM quest_completions WHERE status = 'VERIFIED' AND created_at >= $1
    `, [seasonStart]);
  }
  const totalCompletions = parseInt(completionsRow?.cnt || '0', 10);

  // Attach each participant's current daily stream-creation streak. The streak
  // map is keyed by hex pubkey, so decode each SS58 wallet to match.
  const streakMap = await getStreakMap();
  const withStreak = await Promise.all(participants.map(async (p) => {
    const hex = await walletToHexPubkey(p.wallet);
    const evmHex = p.evm_address ? p.evm_address.toLowerCase() : null;
    const streak = (hex && streakMap.get(hex)) || (evmHex && streakMap.get(evmHex)) || 0;
    return {
      wallet: p.wallet,
      displayName: p.display_name || p.x_username || p.github_username || p.wallet?.slice(0, 8) + '...',
      xUsername: p.x_username,
      githubUsername: p.github_username,
      evmAddress: p.evm_address,
      seasonSeeds: parseInt(p.season_seeds, 10),
      questCompletions: parseInt(p.quest_completions, 10),
      streak,
    };
  }));

  // For streak sorting, re-rank the whole set by streak DESC (seeds as tiebreak)
  // and slice the requested page in JS. Seeds sorting keeps the SQL ordering.
  let pageParticipants;
  if (byStreak) {
    withStreak.sort((a, b) => (b.streak - a.streak) || (b.seasonSeeds - a.seasonSeeds));
    pageParticipants = withStreak.slice(offset, offset + limit);
  } else {
    pageParticipants = withStreak;
  }

  const rankedParticipants = pageParticipants.map((p, idx) => ({
    rank: offset + idx + 1,
    ...p,
  }));

  return {
    seasonId,
    participants: rankedParticipants,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    stats: {
      totalParticipants: totalRegisteredUsers,
      totalSeeds,
      totalCompletions,
      activeParticipants: total,
    },
  };
}

/**
 * Get a specific user's stats for a season.
 */
export async function getUserSeasonStats(wallet, seasonId) {
  // Get user's season Seeds
  const seedsRow = await queryOne(`
    SELECT COALESCE(SUM(delta), 0) AS total
    FROM seeds_ledger
    WHERE wallet = $1 AND season_id = $2
  `, [wallet, seasonId]);
  const seasonSeeds = parseInt(seedsRow?.total || '0', 10);

  // Get user's rank in this season
  const rankRow = await queryOne(`
    SELECT COUNT(*) + 1 AS rank
    FROM (
      SELECT wallet, SUM(delta) AS total
      FROM seeds_ledger
      WHERE season_id = $1
      GROUP BY wallet
      HAVING SUM(delta) > $2
    ) AS higher_ranked
  `, [seasonId, seasonSeeds]);
  const rank = seasonSeeds > 0 ? parseInt(rankRow?.rank || '1', 10) : null;

  // Get user's quest completions in this season
  const completionsRow = await queryOne(`
    SELECT COUNT(*) AS cnt
    FROM quest_completions
    WHERE wallet = $1 AND season_id = $2 AND status = 'VERIFIED'
  `, [wallet, seasonId]);
  const questCompletions = parseInt(completionsRow?.cnt || '0', 10);

  // Get total participants in this season
  const totalRow = await queryOne(`
    SELECT COUNT(DISTINCT wallet) AS cnt
    FROM seeds_ledger
    WHERE season_id = $1 AND delta > 0
  `, [seasonId]);
  const totalParticipants = parseInt(totalRow?.cnt || '0', 10);

  return {
    wallet,
    seasonId,
    seasonSeeds,
    rank,
    totalParticipants,
    questCompletions,
  };
}

/**
 * Create a new season.
 */
export async function createSeason({ name, slug, status = 'UPCOMING', startAt, endAt = null, description = '', meta = {} }) {
  const result = await queryOne(`
    INSERT INTO seasons (name, slug, status, start_at, end_at, description, meta)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [name, slug, status, startAt, endAt, description, JSON.stringify(meta)]);
  return result;
}

/**
 * Update a season.
 */
export async function updateSeason(id, updates) {
  const { name, status, endAt, description, meta } = updates;
  const result = await queryOne(`
    UPDATE seasons
    SET 
      name = COALESCE($2, name),
      status = COALESCE($3, status),
      end_at = COALESCE($4, end_at),
      description = COALESCE($5, description),
      meta = COALESCE($6, meta)
    WHERE id = $1
    RETURNING *
  `, [id, name, status, endAt, description, meta ? JSON.stringify(meta) : null]);
  return result;
}

/**
 * End the current active season and start a new one.
 */
export async function transitionToNewSeason(newSeasonName, newSeasonSlug) {
  // End current active season
  const activeSeason = await getActiveSeason();
  if (activeSeason) {
    await query(`
      UPDATE seasons
      SET status = 'ENDED', end_at = NOW()
      WHERE id = $1
    `, [activeSeason.id]);
    console.log(`[season] Ended season ${activeSeason.id}: ${activeSeason.name}`);
  }

  // Create new season
  const newSeason = await createSeason({
    name: newSeasonName,
    slug: newSeasonSlug,
    status: 'ACTIVE',
    startAt: new Date().toISOString(),
  });
  console.log(`[season] Started new season ${newSeason.id}: ${newSeason.name}`);

  return newSeason;
}

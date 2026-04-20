import { TwitterApi } from 'twitter-api-v2';
import { getAllRegisteredUsers, awardSeeds, isQuestCompleted } from '../services/quest-service.mjs';
import { queryOne, query } from '../services/db.mjs';

let readClient = null;

function getReadClient() {
  if (readClient) return readClient;
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) throw new Error('[quest-x] Missing X_BEARER_TOKEN');
  readClient = new TwitterApi(bearerToken);
  return readClient;
}

// GrowStreams X account username (without @)
const GROWSTREAMS_X_HANDLE = process.env.GROWSTREAMS_X_HANDLE || 'GrowStreams';

// ---------------------------------------------------------------------------
// Resolve X user ID from username (with caching in quest_registrations)
// ---------------------------------------------------------------------------
async function resolveXUserId(xUsername) {
  // Check if already cached
  const reg = await queryOne(
    `SELECT x_user_id FROM quest_registrations WHERE x_username = $1 AND x_user_id IS NOT NULL`,
    [xUsername.toLowerCase()]
  );
  if (reg?.x_user_id) return reg.x_user_id;

  // Resolve via API
  try {
    const client = getReadClient();
    const user = await client.v2.userByUsername(xUsername);
    if (user?.data?.id) {
      // Cache it
      await query(
        `UPDATE quest_registrations SET x_user_id = $1 WHERE x_username = $2`,
        [user.data.id, xUsername.toLowerCase()]
      );
      return user.data.id;
    }
  } catch (err) {
    console.warn(`[quest-x] Failed to resolve X user ID for @${xUsername}: ${err.message}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resolve GrowStreams X account ID
// ---------------------------------------------------------------------------
let growstreamsXId = null;

async function getGrowstreamsXId() {
  if (growstreamsXId) return growstreamsXId;
  try {
    const client = getReadClient();
    const user = await client.v2.userByUsername(GROWSTREAMS_X_HANDLE);
    if (user?.data?.id) {
      growstreamsXId = user.data.id;
      console.log(`[quest-x] GrowStreams X ID resolved: ${growstreamsXId}`);
      return growstreamsXId;
    }
  } catch (err) {
    console.warn(`[quest-x] Failed to resolve GrowStreams X ID: ${err.message}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Q1: Check if user follows @growstreams
// Polls users/:id/followers to check if the quest user is in the list
// ---------------------------------------------------------------------------
export async function runFollowCheck() {
  console.log('[quest-x] Running follow check (Q1)...');

  if (!process.env.X_BEARER_TOKEN) {
    console.warn('[quest-x] X_BEARER_TOKEN not set, skipping follow check');
    return;
  }

  const users = await getAllRegisteredUsers();
  if (!users.length) return;

  const gsId = await getGrowstreamsXId();
  if (!gsId) {
    console.warn('[quest-x] Cannot check follows: GrowStreams X ID not resolved');
    return;
  }

  const client = getReadClient();
  let checked = 0;
  let awarded = 0;

  for (const user of users) {
    try {
      // Skip if already completed
      if (await isQuestCompleted(user.wallet, 'follow-x')) continue;

      // Resolve user's X ID
      const userId = await resolveXUserId(user.x_username);
      if (!userId) continue;

      // Check if this user follows GrowStreams
      // GET /2/users/:id/followers (GrowStreams' followers) and check if userId is in the list
      // This works with Bearer Token (App-Only Auth)
      let isFollowing = false;
      let paginationToken = undefined;

      do {
        const params = { max_results: 1000 };
        if (paginationToken) params.pagination_token = paginationToken;

        // Get GrowStreams' followers and check if userId is in the list
        const followers = await client.v2.followers(gsId, params);
        const data = followers?.data || [];

        if (data.some(f => f.id === userId)) {
          isFollowing = true;
          break;
        }

        paginationToken = followers?.meta?.next_token;
      } while (paginationToken && !isFollowing);

      checked++;

      if (isFollowing) {
        const completion = await awardSeeds(user.wallet, 'follow-x', { x_user_id: userId });
        if (completion) {
          awarded++;
          console.log(`[quest-x] Q1 Follow verified for @${user.x_username} (${user.wallet})`);
        }
      }
    } catch (err) {
      // Rate limit handling
      if (err.code === 429 || err.rateLimit) {
        console.warn(`[quest-x] Rate limited during follow check, stopping. Checked ${checked} users.`);
        break;
      }
      console.warn(`[quest-x] Follow check failed for @${user.x_username}: ${err.message}`);
    }
  }

  console.log(`[quest-x] Follow check complete: ${checked} checked, ${awarded} awarded`);
}

// ---------------------------------------------------------------------------
// Q2: Check for tweets mentioning @growstreams
// Searches recent tweets mentioning @growstreams from registered users
// ---------------------------------------------------------------------------
export async function runMentionCheck() {
  console.log('[quest-x] Running mention check (Q2)...');

  if (!process.env.X_BEARER_TOKEN) {
    console.warn('[quest-x] X_BEARER_TOKEN not set, skipping mention check');
    return;
  }

  const users = await getAllRegisteredUsers();
  if (!users.length) return;

  const client = getReadClient();
  let checked = 0;
  let awarded = 0;

  // Build a set of registered X usernames for quick lookup
  const registeredHandles = new Map();
  for (const u of users) {
    registeredHandles.set(u.x_username.toLowerCase(), u);
  }

  // Strategy 1: Try search API (requires Basic tier)
  let searchWorked = false;
  try {
    const searchQuery = `(@${GROWSTREAMS_X_HANDLE} OR @GrowwStreams OR #GrowStreams) -is:retweet`;
    const result = await client.v2.search(searchQuery, {
      'tweet.fields': 'author_id,created_at',
      'user.fields': 'username',
      'expansions': 'author_id',
      'max_results': 100,
    });

    const tweets = result?.data?.data || [];
    const includes = result?.data?.includes || result?.includes || {};
    const usersMap = {};
    for (const u of (includes.users || [])) {
      usersMap[u.id] = u.username?.toLowerCase();
    }

    for (const tweet of tweets) {
      const authorUsername = usersMap[tweet.author_id];
      if (!authorUsername) continue;

      const registeredUser = registeredHandles.get(authorUsername);
      if (!registeredUser) continue;

      checked++;

      // For repeatable quest: check if this specific tweet was already credited
      const existing = await queryOne(
        `SELECT id FROM quest_completions
         WHERE wallet = $1 AND quest_id = (SELECT id FROM quests WHERE slug = 'mention-x')
         AND proof->>'tweet_id' = $2`,
        [registeredUser.wallet, tweet.id]
      );
      if (existing) continue;

      const completion = await awardSeeds(
        registeredUser.wallet,
        'mention-x',
        { tweet_id: tweet.id, tweet_text: tweet.text?.slice(0, 200) }
      );
      if (completion) {
        awarded++;
        console.log(`[quest-x] Q2 Mention verified for @${authorUsername} tweet=${tweet.id}`);
      }
    }
    searchWorked = true;
  } catch (err) {
    if (err.code === 429) {
      console.warn(`[quest-x] Rate limited during mention search`);
    } else if (err.code === 403 || err.message?.includes('not authorized') || err.message?.includes('forbidden')) {
      console.warn(`[quest-x] Search API unavailable (likely free tier). Falling back to user timeline check.`);
    } else {
      console.error(`[quest-x] Mention search failed: ${err.message}`);
    }
  }

  // Strategy 2: Fallback — check each user's recent tweets for mentions
  if (!searchWorked) {
    const mentionPattern = new RegExp(`@${GROWSTREAMS_X_HANDLE}|#GrowStreams`, 'i');
    for (const user of users) {
      try {
        const userId = await resolveXUserId(user.x_username);
        if (!userId) continue;

        const timeline = await client.v2.userTimeline(userId, {
          max_results: 10,
          'tweet.fields': 'created_at',
          exclude: 'retweets',
        });

        const tweets = timeline?.data?.data || [];
        for (const tweet of tweets) {
          if (!mentionPattern.test(tweet.text || '')) continue;

          checked++;
          const existing = await queryOne(
            `SELECT id FROM quest_completions
             WHERE wallet = $1 AND quest_id = (SELECT id FROM quests WHERE slug = 'mention-x')
             AND proof->>'tweet_id' = $2`,
            [user.wallet, tweet.id]
          );
          if (existing) continue;

          const completion = await awardSeeds(
            user.wallet,
            'mention-x',
            { tweet_id: tweet.id, tweet_text: tweet.text?.slice(0, 200), source: 'timeline-fallback' }
          );
          if (completion) {
            awarded++;
            console.log(`[quest-x] Q2 Mention (timeline) verified for @${user.x_username} tweet=${tweet.id}`);
          }
        }
      } catch (err) {
        if (err.code === 429) {
          console.warn(`[quest-x] Rate limited during timeline check, stopping`);
          break;
        }
        console.warn(`[quest-x] Timeline check failed for @${user.x_username}: ${err.message}`);
      }
    }
  }

  console.log(`[quest-x] Mention check complete: ${checked} checked, ${awarded} awarded`);
}

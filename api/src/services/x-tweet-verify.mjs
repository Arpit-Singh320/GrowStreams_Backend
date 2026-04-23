// ---------------------------------------------------------------------------
// Cheap tweet-based proof verification
// Fetches ONE tweet by ID (~$0.002 vs $5+ for follower scan)
// ---------------------------------------------------------------------------
import { TwitterApi } from 'twitter-api-v2';

const GROWSTREAMS_X_HANDLE = (process.env.GROWSTREAMS_X_HANDLE || 'GrowwStreams').toLowerCase();

let readClient = null;
function getClient() {
  if (readClient) return readClient;
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) throw new Error('[x-verify] Missing X_BEARER_TOKEN');
  readClient = new TwitterApi(bearerToken);
  return readClient;
}

/**
 * Extract tweet ID from a tweet URL.
 * Accepts:
 *   https://twitter.com/user/status/1234567890
 *   https://x.com/user/status/1234567890
 *   1234567890 (raw ID)
 */
export function extractTweetId(input) {
  if (!input) return null;
  const str = String(input).trim();
  if (/^\d{5,25}$/.test(str)) return str;
  const match = str.match(/status(?:es)?\/(\d{5,25})/);
  return match ? match[1] : null;
}

/**
 * Verify a tweet as proof for a quest.
 * Costs: 1 tweet read + 1 user expansion = ~$0.002 per verification.
 *
 * @param {string} tweetUrl    - tweet URL or ID
 * @param {string} xUsername   - user's registered X handle (without @)
 * @param {string} walletAddr  - user's wallet address (must appear in tweet)
 * @returns {Promise<{valid: boolean, error?: string, tweet?: object}>}
 */
export async function verifyTweetProof(tweetUrl, xUsername, walletAddr) {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) return { valid: false, error: 'Invalid tweet URL' };

  try {
    const client = getClient();
    const result = await client.v2.singleTweet(tweetId, {
      expansions: ['author_id'],
      'user.fields': ['username'],
      'tweet.fields': ['text', 'created_at', 'author_id'],
    });

    if (!result?.data) {
      return { valid: false, error: 'Tweet not found or deleted' };
    }

    const tweet = result.data;
    const author = result.includes?.users?.[0];
    const authorUsername = author?.username?.toLowerCase();

    // 1. Verify author matches registered X handle
    const expectedUsername = xUsername.replace(/^@/, '').toLowerCase();
    if (authorUsername !== expectedUsername) {
      return {
        valid: false,
        error: `Tweet author is @${authorUsername || 'unknown'}, expected @${expectedUsername}`,
      };
    }

    // 2. Verify tweet mentions @growwstreams
    const text = (tweet.text || '').toLowerCase();
    if (!text.includes(`@${GROWSTREAMS_X_HANDLE}`)) {
      return { valid: false, error: `Tweet must mention @${GROWSTREAMS_X_HANDLE}` };
    }

    // 3. Verify tweet contains the wallet address (anti-replay per wallet)
    if (walletAddr && !text.includes(walletAddr.toLowerCase())) {
      return {
        valid: false,
        error: 'Tweet must contain your wallet address as proof',
      };
    }

    return {
      valid: true,
      tweet: {
        id: tweet.id,
        text: tweet.text,
        author: authorUsername,
        created_at: tweet.created_at,
      },
    };
  } catch (err) {
    // Surface rate limit / billing errors clearly
    const code = err?.code || err?.data?.status;
    if (code === 402) return { valid: false, error: 'X API billing exhausted' };
    if (code === 429) return { valid: false, error: 'X API rate limited, try again later' };
    console.warn(`[x-verify] Tweet fetch failed for ${tweetId}: ${err.message}`);
    return { valid: false, error: `Verification failed: ${err.message}` };
  }
}

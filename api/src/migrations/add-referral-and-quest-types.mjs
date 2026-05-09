import { query } from '../services/db.mjs';

export async function addReferralAndQuestTypes() {
  console.log('[migration] Adding referral system and new quest types...');

  // --- quest_registrations: referral tracking columns ---
  await query(`
    ALTER TABLE quest_registrations
    ADD COLUMN IF NOT EXISTS referral_code   VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS referred_by_wallet TEXT
  `);

  // --- quests: meta JSONB for per-quest config (target handle, keyword, etc.) ---
  await query(`
    ALTER TABLE quests
    ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'
  `);

  // --- Index for fast referral code lookups ---
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS quest_registrations_referral_code_idx
    ON quest_registrations (referral_code)
    WHERE referral_code IS NOT NULL
  `);

  // --- Seed new quest rows ---
  // follow-x-ginie: follow partner @giniedev on X (admin review)
  await query(`
    INSERT INTO quests (slug, title, description, quest_type, seeds_reward, repeatable, active, sort_order, meta)
    VALUES (
      'follow-x-ginie',
      'Follow @giniedev on X',
      'Follow our partner @giniedev on X to stay updated on the GrowStreams x Ginie collab.',
      'X_FOLLOW',
      15,
      false,
      true,
      11,
      '{"target_handle": "giniedev"}'
    )
    ON CONFLICT (slug) DO NOTHING
  `);

  // retweet-campaign: retweet the official campaign post (admin review)
  await query(`
    INSERT INTO quests (slug, title, description, quest_type, seeds_reward, repeatable, active, sort_order, meta)
    VALUES (
      'retweet-campaign',
      'Retweet + Like the GrowStreams campaign post',
      'Retweet and like the official GrowStreams campaign announcement. Paste the URL of your retweet to verify.',
      'X_RETWEET',
      20,
      false,
      true,
      12,
      '{}'
    )
    ON CONFLICT (slug) DO NOTHING
  `);

  // tweet-build-growstreams: original tweet mentioning @growstreams with keyword "build"
  await query(`
    INSERT INTO quests (slug, title, description, quest_type, seeds_reward, repeatable, active, sort_order, meta)
    VALUES (
      'tweet-build-growstreams',
      'Tweet what you want to build with GrowStreams',
      'Write an original public tweet (min 30 chars) mentioning @GrowStreams with the word "build". Paste your tweet URL to submit.',
      'X_TWEET_KEYWORD',
      60,
      false,
      true,
      13,
      '{"required_mention": "@GrowStreams", "required_keyword": "build", "min_length": 30}'
    )
    ON CONFLICT (slug) DO NOTHING
  `);

  // visit-platform: visit growstreams.xyz (auto-approve, honor system)
  await query(`
    INSERT INTO quests (slug, title, description, quest_type, seeds_reward, repeatable, active, sort_order, meta)
    VALUES (
      'visit-platform',
      'Visit GrowStreams and explore the platform',
      'Head over to growstreams.xyz, explore the dashboard and streams. Click Claim once done.',
      'VISIT_URL',
      15,
      false,
      true,
      14,
      '{"url": "https://growstreams.xyz"}'
    )
    ON CONFLICT (slug) DO NOTHING
  `);

  // join-telegram: join GrowStreams Telegram (auto-approve, honor system)
  await query(`
    INSERT INTO quests (slug, title, description, quest_type, seeds_reward, repeatable, active, sort_order, meta)
    VALUES (
      'join-telegram',
      'Join the GrowStreams Telegram Community',
      'Join our official Telegram group to connect with builders in the GrowStreams ecosystem.',
      'TELEGRAM_JOIN',
      10,
      false,
      true,
      15,
      '{"url": "https://t.me/growstreams"}'
    )
    ON CONFLICT (slug) DO NOTHING
  `);

  // refer-a-friend: awarded automatically when your referral code is used
  await query(`
    INSERT INTO quests (slug, title, description, quest_type, seeds_reward, repeatable, active, sort_order, meta)
    VALUES (
      'refer-a-friend',
      'Refer a Friend to GrowStreams',
      'Share your personal referral code. Every time someone registers with it, you earn Seeds. No cap — the more you refer, the more you earn.',
      'REFERRAL',
      100,
      true,
      true,
      16,
      '{}'
    )
    ON CONFLICT (slug) DO NOTHING
  `);

  console.log('[migration] Referral system and new quest types added successfully.');
}

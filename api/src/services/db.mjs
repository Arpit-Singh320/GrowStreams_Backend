import pg from 'pg';
const { Pool } = pg;

let pool = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err.message);
  });

  console.log('[db] PostgreSQL pool initialized');
  return pool;
}

/**
 * Run a parameterized query. Returns { rows, rowCount }.
 */
export async function query(text, params = []) {
  const p = getPool();
  if (!p) {
    const err = new Error('Database not configured');
    err.status = 503;
    throw err;
  }
  const result = await p.query(text, params);
  return result;
}

/**
 * Run a query and return the first row or null.
 */
export async function queryOne(text, params = []) {
  const { rows } = await query(text, params);
  return rows[0] || null;
}

/**
 * Run a query and return all rows.
 */
export async function queryAll(text, params = []) {
  const { rows } = await query(text, params);
  return rows;
}

/**
 * Run the migration to create all tables.
 */
export async function migrate() {
  console.log('[db] Skipping migrations — DATABASE_URL not set');
  const p = getPool();
  if (!p) return;

  // -----------------------------------------------------------------------
  // Core tables (original)
  // -----------------------------------------------------------------------
  await p.query(`
    CREATE TABLE IF NOT EXISTS participants (
      id            SERIAL PRIMARY KEY,
      wallet        TEXT UNIQUE NOT NULL,
      github_handle TEXT UNIQUE,
      x_handle      TEXT UNIQUE,
      display_name  TEXT,
      track         TEXT NOT NULL CHECK (track IN ('OSS', 'CONTENT', 'BOTH')),
      total_xp      INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contributions (
      id              SERIAL PRIMARY KEY,
      wallet          TEXT NOT NULL REFERENCES participants(wallet),
      track           TEXT NOT NULL CHECK (track IN ('OSS', 'CONTENT')),
      external_id     TEXT,
      pr_number       INTEGER,
      tweet_id        TEXT,
      score           INTEGER NOT NULL DEFAULT 0,
      xp_awarded      INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'ACTIVE',
      agent_feedback  TEXT,
      agent_response  JSONB,
      first_scored_at TIMESTAMPTZ,
      max_daily_until TIMESTAMPTZ,
      submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS xp_events (
      id              SERIAL PRIMARY KEY,
      wallet          TEXT NOT NULL REFERENCES participants(wallet),
      xp_delta        INTEGER NOT NULL,
      reason          TEXT NOT NULL,
      contribution_id INTEGER REFERENCES contributions(id),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id                SERIAL PRIMARY KEY,
      snapshot_date     DATE NOT NULL,
      wallet            TEXT NOT NULL REFERENCES participants(wallet),
      xp_at_snapshot    INTEGER NOT NULL DEFAULT 0,
      rank_at_snapshot  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(snapshot_date, wallet)
    );
  `);

  // -----------------------------------------------------------------------
  // User management tables (new)
  // -----------------------------------------------------------------------
  await p.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS users (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet         TEXT UNIQUE NOT NULL,
      github_handle  TEXT,
      x_handle       TEXT,
      display_name   TEXT,
      referral_code  TEXT UNIQUE NOT NULL,
      referred_by    UUID REFERENCES users(id),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_user_id UUID NOT NULL REFERENCES users(id),
      referred_user_id UUID NOT NULL REFERENCES users(id),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(referrer_user_id, referred_user_id)
    );
  `);

  // -----------------------------------------------------------------------
  // V3: Stream & vault event history tables
  // -----------------------------------------------------------------------
  await p.query(`
    CREATE TABLE IF NOT EXISTS stream_events (
      id            SERIAL PRIMARY KEY,
      stream_id     TEXT NOT NULL,
      event_type    TEXT NOT NULL CHECK (event_type IN (
        'created', 'updated', 'paused', 'resumed', 'stopped',
        'liquidated', 'deposit', 'withdraw'
      )),
      sender        TEXT,
      receiver      TEXT,
      token_address TEXT,
      token_symbol  TEXT,
      flow_rate     TEXT,
      amount        TEXT,
      block_hash    TEXT,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vault_events (
      id            SERIAL PRIMARY KEY,
      wallet        TEXT NOT NULL,
      event_type    TEXT NOT NULL CHECK (event_type IN (
        'deposit', 'withdraw', 'deposit_native', 'withdraw_native',
        'allocate', 'release', 'transfer'
      )),
      token_address TEXT,
      token_symbol  TEXT,
      amount        TEXT,
      amount_display TEXT,
      stream_id     TEXT,
      block_hash    TEXT,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // -----------------------------------------------------------------------
  // V3: Bridge transaction tracking
  // -----------------------------------------------------------------------
  await p.query(`
    CREATE TABLE IF NOT EXISTS bridge_transactions (
      id                SERIAL PRIMARY KEY,
      wallet            TEXT NOT NULL,
      token_symbol      TEXT NOT NULL,
      token_key         TEXT NOT NULL,
      amount            TEXT NOT NULL,
      amount_raw        TEXT NOT NULL DEFAULT '0',
      direction         TEXT NOT NULL CHECK (direction IN ('ethToVara', 'varaToEth')),
      source_tx_hash    TEXT,
      destination_tx_hash TEXT,
      source_chain      TEXT NOT NULL DEFAULT 'ethereum',
      destination_chain TEXT NOT NULL DEFAULT 'vara',
      fee               TEXT DEFAULT '0',
      fee_raw           TEXT DEFAULT '0',
      status            TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN (
        'initiated', 'source_confirmed', 'bridging',
        'destination_confirmed', 'completed', 'failed'
      )),
      confirmations     INTEGER DEFAULT 0,
      error             TEXT,
      metadata          JSONB,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at      TIMESTAMPTZ
    );
  `);

  // Add user_id column to participants if it does not exist
  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'participants' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE participants ADD COLUMN user_id UUID REFERENCES users(id);
      END IF;
    END $$;
  `);

  // -----------------------------------------------------------------------
  // Quest System (M1-beta: ported from Launch branch)
  // -----------------------------------------------------------------------
  await p.query(`
    CREATE TABLE IF NOT EXISTS quest_invites (
      id            SERIAL PRIMARY KEY,
      code          TEXT UNIQUE NOT NULL,
      created_by    TEXT,
      used_by_wallet TEXT,
      max_uses      INTEGER NOT NULL DEFAULT 1,
      current_uses  INTEGER NOT NULL DEFAULT 0,
      expires_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quest_registrations (
      id              SERIAL PRIMARY KEY,
      wallet          TEXT UNIQUE,
      evm_address     TEXT UNIQUE,
      wallet_type     TEXT NOT NULL DEFAULT 'substrate',
      display_name    TEXT NOT NULL DEFAULT '',
      email           TEXT UNIQUE NOT NULL,
      x_username      TEXT,
      github_username TEXT,
      x_user_id       TEXT,
      invite_code     TEXT,
      verified        BOOLEAN NOT NULL DEFAULT FALSE,
      registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quest_campaigns (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug           TEXT UNIQUE NOT NULL,
      title          TEXT NOT NULL,
      description    TEXT NOT NULL DEFAULT '',
      partner        TEXT,
      banner_url     TEXT,
      badge_label    TEXT,
      difficulty     TEXT NOT NULL DEFAULT 'EASY',
      status         TEXT NOT NULL DEFAULT 'ACTIVE',
      reward_summary TEXT,
      bonus_xp       INTEGER NOT NULL DEFAULT 0,
      start_date     TIMESTAMPTZ,
      end_date       TIMESTAMPTZ,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      meta           JSONB NOT NULL DEFAULT '{}',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quests (
      id            SERIAL PRIMARY KEY,
      slug          TEXT UNIQUE NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL,
      quest_type    TEXT NOT NULL,
      seeds_reward  INTEGER NOT NULL DEFAULT 0,
      icon          TEXT,
      repeatable    BOOLEAN NOT NULL DEFAULT FALSE,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      campaign_id   UUID REFERENCES quest_campaigns(id),
      meta          JSONB NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quest_completions (
      id            SERIAL PRIMARY KEY,
      wallet        TEXT NOT NULL,
      quest_id      INTEGER NOT NULL REFERENCES quests(id),
      status        TEXT NOT NULL DEFAULT 'PENDING',
      proof         JSONB,
      seeds_awarded INTEGER NOT NULL DEFAULT 0,
      tx_hash       TEXT,
      verified_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS seeds_ledger (
      id            SERIAL PRIMARY KEY,
      wallet        TEXT NOT NULL,
      delta         INTEGER NOT NULL,
      reason        TEXT NOT NULL,
      quest_id      INTEGER REFERENCES quests(id),
      tx_hash       TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // -----------------------------------------------------------------------
  // Quest Campaign system — campaigns are collections of quests
  // -----------------------------------------------------------------------
  await p.query(`
    CREATE TABLE IF NOT EXISTS quest_campaigns (
      id              SERIAL PRIMARY KEY,
      slug            TEXT UNIQUE NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      partner         TEXT,
      banner_url      TEXT,
      badge_label     TEXT,
      difficulty      TEXT NOT NULL DEFAULT 'EASY' CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
      status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('UPCOMING','ACTIVE','ENDED')),
      reward_summary  TEXT,
      bonus_xp        INTEGER NOT NULL DEFAULT 0,
      start_date      TIMESTAMPTZ,
      end_date        TIMESTAMPTZ,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      meta            JSONB NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Add campaign_id FK to quests (nullable — existing quests get assigned below)
  await p.query(`
    ALTER TABLE quests
      ADD COLUMN IF NOT EXISTS campaign_id INTEGER REFERENCES quest_campaigns(id)
  `);

  // Add referral tracking columns + make github_username optional
  await p.query(`
    ALTER TABLE quest_registrations
      ADD COLUMN IF NOT EXISTS referral_code      VARCHAR(20) UNIQUE,
      ADD COLUMN IF NOT EXISTS referred_by_wallet TEXT
  `);

  await p.query(`
    ALTER TABLE quest_registrations
      ALTER COLUMN github_username DROP NOT NULL
  `).catch(() => {});

  // Add meta JSONB column to quests for per-quest config (target handle, keyword, URL, etc.)
  await p.query(`
    ALTER TABLE quests
      ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'
  `);

  // Index for fast referral code lookups
  await p.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS quest_registrations_referral_code_idx
      ON quest_registrations (referral_code)
      WHERE referral_code IS NOT NULL
  `);

  // Seed / upsert default quests. All quests are weekly-repeatable so users can earn XP each week.
  await p.query(`
    INSERT INTO quests (slug, title, description, quest_type, seeds_reward, icon, repeatable, sort_order, meta) VALUES
      ('welcome-bonus',          'Join the GrowStreams Quest',                         'Welcome to GrowStreams Quests! You receive 100 Seeds just for joining. One-time reward.',                                                                                     'WELCOME',          100, 'gift',             FALSE,  0, '{}'),
      ('follow-x',               'Follow GrowStreams on X',                            'Follow @growwstreams on X, then submit your X username for review. Refreshes weekly.',                                                                                        'X_FOLLOW',         100, 'twitter',          TRUE,   1, '{"target_handle": "growwstreams"}'),
      ('mention-x',              'Post about GrowStreams',                             'Post a tweet mentioning @growwstreams with your wallet address, then paste the tweet URL for admin review. Refreshes weekly.',                                                 'X_MENTION',        150, 'megaphone',        TRUE,   2, '{}'),
      ('follow-x-ginie',         'Follow @giniedev on X',                             'Follow our partner @giniedev on X to stay updated on the GrowStreams x Ginie collab.',                                                                                        'X_FOLLOW',         100, 'twitter',          FALSE,  3, '{"target_handle": "giniedev"}'),
      ('mention-x-ginie',        'Post about Ginie',                                  'Post a tweet mentioning @giniedev with your wallet address, then paste the tweet URL for admin review. Refreshes weekly.',                                                    'X_MENTION',        200, 'megaphone',        TRUE,   4, '{}'),
      ('star-repo',              'Star the GrowStreams repo',                          'Star the GrowStreams repository on GitHub. Refreshes weekly.',                                                                                                                 'GITHUB_STAR',      100, 'star',             TRUE,   5, '{}'),
      ('raise-pr',               'Raise a PR on GrowStreams repo',                    'Open a pull request on the GrowStreams GitHub repository. Refreshes weekly.',                                                                                                  'GITHUB_PR',        200, 'git-pull-request', TRUE,   6, '{}'),
      ('create-stream',          'Create a stream on testnet',                        'Create a token stream on the GrowStreams testnet application. Refreshes weekly.',                                                                                              'ONCHAIN_STREAM',   100, 'waves',            TRUE,   7, '{}'),
      ('retweet-campaign',       'Retweet + Like the GrowStreams campaign post',       'Retweet and like the official GrowStreams campaign announcement. Paste the URL of your retweet to verify.',                                                                   'X_RETWEET',        150, 'repeat',           FALSE,  8, '{}'),
      ('tweet-build-growstreams','Tweet what you want to build with GrowStreams',      'Write an original public tweet (min 30 chars) mentioning @GrowStreams with the word "build". Paste your tweet URL to submit.',                                               'X_TWEET_KEYWORD',  300, 'edit',             FALSE,  9, '{"required_mention": "@GrowStreams", "required_keyword": "build", "min_length": 30}'),
      ('visit-platform',         'Visit GrowStreams and explore the platform',        'Head over to growstreams.xyz, explore the dashboard and streams. Click Claim once done.',                                                                                      'VISIT_URL',         15, 'globe',            FALSE, 10, '{"url": "https://growstreams.xyz"}'),
      ('join-telegram',          'Join the GrowStreams Telegram Community',           'Join our official Telegram group to connect with builders in the GrowStreams ecosystem.',                                                                                      'TELEGRAM_JOIN',     10, 'send',             FALSE, 11, '{"url": "https://t.me/growstreams"}'),
      ('refer-a-friend',         'Refer a Friend to GrowStreams',                     'Share your personal referral code. Every time someone registers with it, you earn 200 Seeds. No weekly cap — every referral counts, forever.',                              'REFERRAL',         200, 'users',            TRUE,  12, '{}')
    ON CONFLICT (slug) DO UPDATE SET
      title        = EXCLUDED.title,
      description  = EXCLUDED.description,
      quest_type   = EXCLUDED.quest_type,
      seeds_reward = EXCLUDED.seeds_reward,
      icon         = EXCLUDED.icon,
      repeatable   = EXCLUDED.repeatable,
      sort_order   = EXCLUDED.sort_order,
      meta         = EXCLUDED.meta;
  `);
  // Deactivate GitHub-only quests — removed from product, existing completions preserved
  await p.query(`
    UPDATE quests SET active = FALSE WHERE slug IN ('star-repo', 'raise-pr')
  `);

  console.log('[db] Upserted default quests (GitHub quests deactivated)');

  // Seed quest campaigns
  await p.query(`
    INSERT INTO quest_campaigns (slug, title, description, partner, badge_label, difficulty, status, reward_summary, bonus_xp, sort_order, meta)
    VALUES
      (
        'growstreams',
        'GrowStreams Launch Campaign',
        'Earn Seeds by contributing to the GrowStreams ecosystem — follow us, build on testnet, star the repo, create streams, and refer friends. Seeds convert to GROW tokens at mainnet launch.',
        'GrowStreams',
        'Pioneer',
        'EASY',
        'ACTIVE',
        'Seeds → GROW token airdrop at mainnet launch',
        50,
        1,
        '{"color": "#6366f1", "accent": "#818cf8", "token": "SEEDS"}'
      ),
      (
        'ginie-x-growstreams',
        'Ginie × GrowStreams — Build with AI',
        'The AI-powered development environment meets GrowStreams money streaming. Complete all tasks, earn Seeds, and compete for 100,000 VARA tokens. Top 5 users on the leaderboard win. Prizes distributed via Telegram after campaign ends.',
        'Ginie',
        'Ginie Pioneer',
        'EASY',
        'ACTIVE',
        '100,000 VARA token prize pool — Top 5 win',
        50,
        0,
        '{"color": "#f59e0b", "accent": "#fbbf24", "token": "SEEDS", "partner_url": "https://ginie.xyz", "end_date": "2026-05-17T23:59:59Z", "prize_pool": {"total_vara": 100000, "currency": "VARA", "distribution": "top5", "distribution_channel": "Telegram", "tiers": [{"rank": 1, "label": "1st Place", "vara": 40000}, {"rank": 2, "label": "2nd Place", "vara": 20000}, {"rank": 3, "label": "3rd Place", "vara": 15000}, {"rank": 4, "label": "4th Place", "vara": 15000}, {"rank": 5, "label": "5th Place", "vara": 10000}]}}'
      )
    ON CONFLICT (slug) DO UPDATE SET
      title          = EXCLUDED.title,
      description    = EXCLUDED.description,
      reward_summary = EXCLUDED.reward_summary,
      bonus_xp       = EXCLUDED.bonus_xp,
      status         = EXCLUDED.status,
      meta           = EXCLUDED.meta;
  `);

  // Assign campaign_id to each quest by matching slugs
  await p.query(`
    UPDATE quests SET campaign_id = (SELECT id FROM quest_campaigns WHERE slug = 'growstreams')
    WHERE slug IN (
      'welcome-bonus','follow-x','mention-x','star-repo','raise-pr',
      'create-stream','visit-platform','join-telegram','refer-a-friend'
    ) AND campaign_id IS NULL;

    UPDATE quests SET campaign_id = (SELECT id FROM quest_campaigns WHERE slug = 'ginie-x-growstreams')
    WHERE slug IN (
      'follow-x-ginie','mention-x-ginie','retweet-campaign','tweet-build-growstreams'
    ) AND campaign_id IS NULL;
  `);

  console.log('[db] Quest campaigns seeded and quests assigned to campaigns');

  // -----------------------------------------------------------------------
  // Indexes
  // -----------------------------------------------------------------------
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_quest_campaigns_slug   ON quest_campaigns(slug);
    CREATE INDEX IF NOT EXISTS idx_quests_campaign_id     ON quests(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_quest_invites_code ON quest_invites(code);
    CREATE INDEX IF NOT EXISTS idx_quest_registrations_wallet ON quest_registrations(wallet);
    CREATE INDEX IF NOT EXISTS idx_quest_registrations_email ON quest_registrations(email);
    CREATE INDEX IF NOT EXISTS idx_quest_registrations_x ON quest_registrations(x_username);
    CREATE INDEX IF NOT EXISTS idx_quest_registrations_github ON quest_registrations(github_username);
    CREATE INDEX IF NOT EXISTS idx_quest_completions_wallet ON quest_completions(wallet);
    CREATE INDEX IF NOT EXISTS idx_quest_completions_quest ON quest_completions(quest_id);
    CREATE INDEX IF NOT EXISTS idx_quest_completions_status ON quest_completions(status);
    CREATE INDEX IF NOT EXISTS idx_seeds_ledger_wallet ON seeds_ledger(wallet);
    CREATE INDEX IF NOT EXISTS idx_seeds_ledger_quest ON seeds_ledger(quest_id);
    CREATE INDEX IF NOT EXISTS idx_contributions_wallet ON contributions(wallet);
    CREATE INDEX IF NOT EXISTS idx_contributions_track ON contributions(track);
    CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status);
    CREATE INDEX IF NOT EXISTS idx_contributions_pr_number ON contributions(pr_number);
    CREATE INDEX IF NOT EXISTS idx_contributions_tweet_id ON contributions(tweet_id);
    CREATE INDEX IF NOT EXISTS idx_contributions_external_id ON contributions(external_id);
    CREATE INDEX IF NOT EXISTS idx_xp_events_wallet ON xp_events(wallet);
    CREATE INDEX IF NOT EXISTS idx_xp_events_contribution_id ON xp_events(contribution_id);
    CREATE INDEX IF NOT EXISTS idx_xp_events_reason ON xp_events(reason);
    CREATE INDEX IF NOT EXISTS idx_daily_snapshots_wallet ON daily_snapshots(wallet);
    CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON daily_snapshots(snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_participants_total_xp ON participants(total_xp);
    CREATE INDEX IF NOT EXISTS idx_participants_github ON participants(github_handle);
    CREATE INDEX IF NOT EXISTS idx_participants_x ON participants(x_handle);
    CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet);
    CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
    CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
    CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
    CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);

    CREATE INDEX IF NOT EXISTS idx_stream_events_stream_id ON stream_events(stream_id);
    CREATE INDEX IF NOT EXISTS idx_stream_events_sender ON stream_events(sender);
    CREATE INDEX IF NOT EXISTS idx_stream_events_receiver ON stream_events(receiver);
    CREATE INDEX IF NOT EXISTS idx_stream_events_token ON stream_events(token_address);
    CREATE INDEX IF NOT EXISTS idx_stream_events_type ON stream_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_stream_events_created ON stream_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_vault_events_wallet ON vault_events(wallet);
    CREATE INDEX IF NOT EXISTS idx_vault_events_token ON vault_events(token_address);
    CREATE INDEX IF NOT EXISTS idx_vault_events_type ON vault_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_vault_events_created ON vault_events(created_at);

    CREATE INDEX IF NOT EXISTS idx_bridge_tx_wallet ON bridge_transactions(wallet);
    CREATE INDEX IF NOT EXISTS idx_bridge_tx_status ON bridge_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_bridge_tx_source ON bridge_transactions(source_tx_hash);
    CREATE INDEX IF NOT EXISTS idx_bridge_tx_dest ON bridge_transactions(destination_tx_hash);
    CREATE INDEX IF NOT EXISTS idx_bridge_tx_token ON bridge_transactions(token_key);
    CREATE INDEX IF NOT EXISTS idx_bridge_tx_created ON bridge_transactions(created_at);
  `);

  // -----------------------------------------------------------------------
  // V3: Multi-campaign system
  // -----------------------------------------------------------------------
  await p.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_wallet        VARCHAR NOT NULL,
      title                 VARCHAR(200) NOT NULL,
      description           TEXT,
      pool_amount           NUMERIC(20,6) NOT NULL,
      pool_remaining        NUMERIC(20,6) NOT NULL,
      token                 VARCHAR(20) NOT NULL DEFAULT 'WUSDC',
      status                VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT','FUNDED','ACTIVE','ENDED','SETTLING','CLOSED')),
      track_type            VARCHAR(20) NOT NULL DEFAULT 'BOTH'
                            CHECK (track_type IN ('OSS','CONTENT','BOTH')),
      start_date            TIMESTAMPTZ NOT NULL,
      end_date              TIMESTAMPTZ NOT NULL,
      ended_at              TIMESTAMPTZ,
      funding_tx_hash       VARCHAR,
      required_hashtags     TEXT[],
      required_mentions     TEXT[],
      github_repo_url       VARCHAR,
      github_issue_labels   TEXT[],
      max_oss_contributions     INTEGER DEFAULT 3,
      max_content_contributions INTEGER DEFAULT 10,
      score_threshold       INTEGER DEFAULT 70,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaign_participants (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id  UUID NOT NULL REFERENCES campaigns(id),
      wallet       VARCHAR NOT NULL,
      campaign_xp  INTEGER NOT NULL DEFAULT 0,
      enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(campaign_id, wallet)
    );

    CREATE TABLE IF NOT EXISTS campaign_payouts (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id  UUID NOT NULL REFERENCES campaigns(id),
      wallet       VARCHAR NOT NULL,
      xp_earned    INTEGER NOT NULL,
      xp_share     NUMERIC(10,6) NOT NULL,
      usdc_amount  NUMERIC(20,6) NOT NULL,
      status       VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','EXECUTED','FAILED','BELOW_MINIMUM')),
      tx_hash      VARCHAR,
      executed_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Add campaign_id and campaign_count columns to contributions if not exist
  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contributions' AND column_name = 'campaign_id'
      ) THEN
        ALTER TABLE contributions ADD COLUMN campaign_id UUID REFERENCES campaigns(id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contributions' AND column_name = 'campaign_count'
      ) THEN
        ALTER TABLE contributions ADD COLUMN campaign_count INTEGER NOT NULL DEFAULT 1;
      END IF;
    END $$;
  `);

  // Add campaign_id column to xp_events if not exist
  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'xp_events' AND column_name = 'campaign_id'
      ) THEN
        ALTER TABLE xp_events ADD COLUMN campaign_id UUID REFERENCES campaigns(id);
      END IF;
    END $$;
  `);

  // Multi-campaign indexes
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_campaigns_creator ON campaigns(creator_wallet);
    CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_cp_campaign ON campaign_participants(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_cp_wallet ON campaign_participants(wallet);
    CREATE INDEX IF NOT EXISTS idx_payouts_campaign ON campaign_payouts(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_payouts_wallet ON campaign_payouts(wallet);
    CREATE INDEX IF NOT EXISTS idx_contributions_campaign ON contributions(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_xp_events_campaign ON xp_events(campaign_id);
  `);

  // -----------------------------------------------------------------------
  // Backfill: Create legacy campaign record for existing data
  // -----------------------------------------------------------------------
  await p.query(`
    DO $$
    DECLARE
      legacy_id UUID;
      pool_val  NUMERIC;
      c_status  VARCHAR;
      c_end     TIMESTAMPTZ;
    BEGIN
      -- Only run if no campaigns exist yet
      IF NOT EXISTS (SELECT 1 FROM campaigns LIMIT 1) THEN
        pool_val := 100.000000;
        c_end    := '2026-05-01T00:00:00Z'::TIMESTAMPTZ;

        -- If end date is past, campaign is CLOSED; otherwise ACTIVE
        IF c_end <= NOW() THEN
          c_status := 'CLOSED';
        ELSE
          c_status := 'ACTIVE';
        END IF;

        INSERT INTO campaigns (
          creator_wallet, title, description,
          pool_amount, pool_remaining, token, status, track_type,
          start_date, end_date,
          required_hashtags, required_mentions,
          github_repo_url, github_issue_labels,
          score_threshold
        ) VALUES (
          'PLATFORM',
          'GrowStreams Launch Campaign',
          'The original GrowStreams launch campaign — $100 USDC pool for OSS and content contributors.',
          pool_val, pool_val, 'WUSDC', c_status, 'BOTH',
          '2026-04-01T00:00:00Z'::TIMESTAMPTZ, c_end,
          ARRAY['#GrowStreams', '#VaraNetwork'],
          ARRAY['@GrowwStreams'],
          'https://github.com/BlockXAI/GrowStreams_Backend',
          ARRAY['stream-bounty'],
          70
        )
        RETURNING id INTO legacy_id;

        -- Backfill campaign_id on existing contributions
        UPDATE contributions SET campaign_id = legacy_id WHERE campaign_id IS NULL;

        -- Backfill campaign_id on existing xp_events
        UPDATE xp_events SET campaign_id = legacy_id WHERE campaign_id IS NULL;

        -- Enroll all existing participants into the legacy campaign
        INSERT INTO campaign_participants (campaign_id, wallet, campaign_xp)
        SELECT legacy_id, p.wallet, p.total_xp
        FROM participants p
        ON CONFLICT (campaign_id, wallet) DO NOTHING;

        RAISE NOTICE '[db] Backfilled legacy campaign % with status %', legacy_id, c_status;
      END IF;
    END $$;
  `);

  // Add evm_address + wallet_type to existing quest_registrations rows (idempotent)
  const { addEvmAddress } = await import('../migrations/add-evm-address.mjs');
  await addEvmAddress();

  // Add display_name column and relax x_username / invite_code constraints (idempotent)
  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quest_registrations' AND column_name = 'display_name'
      ) THEN
        ALTER TABLE quest_registrations ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
      END IF;

      -- Make x_username nullable for existing installs (was NOT NULL before)
      BEGIN
        ALTER TABLE quest_registrations ALTER COLUMN x_username DROP NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END;

      -- Make invite_code nullable for existing installs (was NOT NULL before)
      BEGIN
        ALTER TABLE quest_registrations ALTER COLUMN invite_code DROP NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END;
    END $$;
  `);

  // Add referral columns, meta to quests, seed new quest types, create quest_campaigns infra
  const { addReferralAndQuestTypes } = await import('../migrations/add-referral-and-quest-types.mjs');
  await addReferralAndQuestTypes();

  // Add campaign_id + meta columns to quests table for existing installs (idempotent)
  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quests' AND column_name = 'campaign_id'
      ) THEN
        ALTER TABLE quests ADD COLUMN campaign_id UUID REFERENCES quest_campaigns(id);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quests' AND column_name = 'meta'
      ) THEN
        ALTER TABLE quests ADD COLUMN meta JSONB NOT NULL DEFAULT '{}';
      END IF;
    END $$;
  `);

  console.log('[db] Migrations complete');
}

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
  // Indexes
  // -----------------------------------------------------------------------
  await p.query(`
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

  console.log('[db] Migrations complete');
}

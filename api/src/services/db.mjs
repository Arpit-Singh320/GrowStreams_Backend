import pg from 'pg';
const { Pool } = pg;

let pool = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('[db] Missing environment variable: DATABASE_URL');
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
  console.log('[db] Running migrations...');
  const p = getPool();

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
  // Quest system tables
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
      wallet          TEXT UNIQUE NOT NULL,
      email           TEXT UNIQUE NOT NULL,
      x_username      TEXT NOT NULL,
      github_username TEXT NOT NULL,
      x_user_id       TEXT,
      invite_code     TEXT NOT NULL,
      verified        BOOLEAN NOT NULL DEFAULT FALSE,
      registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

  // Seed default quests if table is empty
  const questCount = await queryOne(`SELECT COUNT(*) AS cnt FROM quests`);
  if (parseInt(questCount?.cnt || '0', 10) === 0) {
    await p.query(`
      INSERT INTO quests (slug, title, description, quest_type, seeds_reward, icon, repeatable, sort_order) VALUES
        ('follow-x',       'Follow @growwstreams on X',             'Follow @growwstreams, then post a tweet mentioning @growwstreams with your wallet address as proof. Submit the tweet URL to claim.',          'X_FOLLOW',        100, 'twitter',    FALSE, 1),
        ('mention-x',      'Post on X mentioning @growwstreams',    'Post a tweet mentioning @growwstreams with your wallet address. Submit the tweet URL to claim.',                   'X_MENTION',       150, 'megaphone',  FALSE, 2),
        ('star-repo',      'Star the GrowStreams repo',            'Star the GrowStreams repository on GitHub.',                       'GITHUB_STAR',     100, 'star',       FALSE, 3),
        ('raise-pr',       'Raise a PR on GrowStreams repo',       'Open a pull request on the GrowStreams GitHub repository.',        'GITHUB_PR',       200, 'git-pull-request', FALSE, 4),
        ('create-stream',  'Create a stream on testnet',           'Create a token stream on the GrowStreams testnet application.',    'ONCHAIN_STREAM',  300, 'waves',      FALSE, 5)
      ON CONFLICT (slug) DO NOTHING;
    `);
    console.log('[db] Seeded default quests');
  }

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
  `);

  console.log('[db] Migrations complete');
}

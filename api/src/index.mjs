import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';

config();

import { connect } from './sails-client.mjs';
import { migrate } from './services/db.mjs';
import healthRouter from './routes/health.mjs';
import streamsRouter from './routes/streams.mjs';
import vaultRouter from './routes/vault.mjs';
import splitsRouter from './routes/splits.mjs';
import permissionsRouter from './routes/permissions.mjs';
import bountyRouter from './routes/bounty.mjs';
import identityRouter from './routes/identity.mjs';
import growTokenRouter from './routes/grow-token.mjs';
import campaignRouter from './routes/campaign.mjs';
import webhooksRouter from './routes/webhooks.mjs';
import leaderboardRouter from './routes/leaderboard.mjs';
import usersRouter from './routes/users.mjs';
import tokensRouter from './routes/tokens.mjs';
import bridgeRouter from './routes/bridge.mjs';
import campaignsRouter from './routes/campaigns.mjs';
import questsRouter from './routes/quests.mjs';
import voucherRouter from './routes/voucher.mjs';
import wvaraRouter from './routes/wvara.mjs';
import seasonsRouter from './routes/seasons.mjs';
import superTokensRouter from './routes/super-tokens.mjs';
import distributionPoolsRouter from './routes/distribution-pools.mjs';
import solvencyRouter from './routes/solvency.mjs';
import varaEthRouter from './routes/vara-eth-streams.mjs';
import { ensureVoucherTable } from './services/voucher-service.mjs';
import { startStream as startXStream } from './services/x-agent.mjs';
import { initCrons } from './cron/index.mjs';
import { REWARDS_FROZEN } from './services/reward-freeze.mjs';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'growstreams.xyz,vercel.app,railway.app,localhost,127.0.0.1').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.includes(o))) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}));

app.use(morgan('short'));

// Raw body parser for GitHub webhook HMAC verification (MUST be before express.json())
app.use('/api/webhooks/github', express.raw({ type: 'application/json' }));

app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/streams', streamsRouter);
app.use('/api/vault', vaultRouter);
app.use('/api/splits', splitsRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/bounty', bountyRouter);
app.use('/api/identity', identityRouter);
app.use('/api/grow-token', growTokenRouter);
app.use('/api/campaign', campaignRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/users', usersRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/bridge', bridgeRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/quests', questsRouter);
app.use('/api/voucher', voucherRouter);
app.use('/api/wvara', wvaraRouter);
app.use('/api/seasons', seasonsRouter);
app.use('/api/super-tokens', superTokensRouter);
app.use('/api/distribution-pools', distributionPoolsRouter);
app.use('/api/solvency', solvencyRouter);
app.use('/api/vara-eth', varaEthRouter);

app.get('/', (req, res) => {
  res.json({
    name: 'GrowStreams V3 API',
    version: '3.0.0',
    description: 'Money streaming infrastructure for Vara Network — like Superfluid, but for Polkadot/Vara',
    docs: {
      tokens: {
        list: 'GET /api/tokens',
        stablecoins: 'GET /api/tokens/stablecoins',
        addresses: 'GET /api/tokens/addresses',
        getToken: 'GET /api/tokens/:symbol',
        balance: 'GET /api/tokens/:symbol/balance/:wallet',
        allBalances: 'GET /api/tokens/balances/:wallet',
        allowance: 'GET /api/tokens/:symbol/allowance/:owner/:spender',
        approve: 'POST /api/tokens/:symbol/approve { spender, amount }',
        convert: 'POST /api/tokens/:symbol/convert { amount, direction }',
        flowRate: 'POST /api/tokens/:symbol/flow-rate { amount, fromInterval, toInterval }',
        resolve: 'GET /api/tokens/:symbol/resolve',
      },
      health: 'GET /health',
      streams: {
        config: 'GET /api/streams/config',
        total: 'GET /api/streams/total',
        active: 'GET /api/streams/active',
        getStream: 'GET /api/streams/:id',
        getBalance: 'GET /api/streams/:id/balance',
        getBuffer: 'GET /api/streams/:id/buffer',
        history: 'GET /api/streams/history/:wallet?limit=&offset=&eventType=&token=',
        stats: 'GET /api/streams/stats/:wallet',
        events: 'GET /api/streams/events/:streamId',
        bySender: 'GET /api/streams/sender/:address',
        byReceiver: 'GET /api/streams/receiver/:address',
        create: 'POST /api/streams { receiver, token, flowRate, initialDeposit, mode? }',
        update: 'PUT /api/streams/:id { flowRate, mode? }',
        pause: 'POST /api/streams/:id/pause',
        resume: 'POST /api/streams/:id/resume',
        deposit: 'POST /api/streams/:id/deposit { amount, mode? }',
        withdraw: 'POST /api/streams/:id/withdraw',
        stop: 'POST /api/streams/:id/stop',
        liquidate: 'POST /api/streams/:id/liquidate',
      },
      vault: {
        config: 'GET /api/vault/config',
        paused: 'GET /api/vault/paused',
        history: 'GET /api/vault/history/:wallet?limit=&offset=&eventType=&token=',
        balance: 'GET /api/vault/balance/:owner/:token (accepts symbol or address)',
        balances: 'GET /api/vault/balances/:wallet (all token vault balances)',
        allocation: 'GET /api/vault/allocation/:streamId',
        deposit: 'POST /api/vault/deposit { token, amount, mode? }',
        withdraw: 'POST /api/vault/withdraw { token, amount, mode? }',
        depositNative: 'POST /api/vault/deposit-native { amount, mode? }',
        withdrawNative: 'POST /api/vault/withdraw-native { amount, mode? }',
        pause: 'POST /api/vault/pause',
        unpause: 'POST /api/vault/unpause',
      },
      splits: {
        total: 'GET /api/splits/total',
        getGroup: 'GET /api/splits/:id',
        ownerGroups: 'GET /api/splits/owner/:address',
        preview: 'GET /api/splits/:id/preview/:amount',
        create: 'POST /api/splits { recipients, mode? }',
        update: 'PUT /api/splits/:id { recipients, mode? }',
        delete: 'DELETE /api/splits/:id',
        distribute: 'POST /api/splits/:id/distribute { token, amount, mode? }',
      },
      permissions: {
        check: 'GET /api/permissions/check/:granter/:grantee/:scope',
        byGranter: 'GET /api/permissions/granter/:address',
        byGrantee: 'GET /api/permissions/grantee/:address',
        grant: 'POST /api/permissions/grant { grantee, scope, expiresAt?, mode? }',
        revoke: 'POST /api/permissions/revoke { grantee, scope, mode? }',
        revokeAll: 'POST /api/permissions/revoke-all { grantee, mode? }',
      },
      bounty: {
        total: 'GET /api/bounty/total',
        open: 'GET /api/bounty/open',
        getBounty: 'GET /api/bounty/:id',
        byCreator: 'GET /api/bounty/creator/:address',
        byClaimer: 'GET /api/bounty/claimer/:address',
        create: 'POST /api/bounty { title, token, maxFlowRate, minScore, totalBudget, mode? }',
        claim: 'POST /api/bounty/:id/claim',
        verify: 'POST /api/bounty/:id/verify { claimer, score, mode? }',
        complete: 'POST /api/bounty/:id/complete',
        cancel: 'POST /api/bounty/:id/cancel',
      },
      growToken: {
        meta: 'GET /api/grow-token/meta',
        balance: 'GET /api/grow-token/balance/:account',
        allowance: 'GET /api/grow-token/allowance/:owner/:spender',
        totalSupply: 'GET /api/grow-token/total-supply',
        transfer: 'POST /api/grow-token/transfer { to, amount, mode? }',
        approve: 'POST /api/grow-token/approve { spender, amount, mode? }',
        transferFrom: 'POST /api/grow-token/transfer-from { from, to, amount, mode? }',
        mint: 'POST /api/grow-token/mint { to, amount, mode? }',
        burn: 'POST /api/grow-token/burn { amount, mode? }',
      },
      identity: {
        oracle: 'GET /api/identity/oracle',
        total: 'GET /api/identity/total',
        getBinding: 'GET /api/identity/binding/:actorId',
        byGithub: 'GET /api/identity/github/:username',
        bind: 'POST /api/identity/bind { actorId, githubUsername, proofHash, score, mode? }',
        revoke: 'POST /api/identity/revoke { actorId, mode? }',
        updateScore: 'POST /api/identity/update-score { actorId, newScore, mode? }',
      },
      users: {
        register: 'POST /api/users/register { wallet, github_handle?, x_handle?, referral_code? }',
        profile: 'GET /api/users/:wallet',
        referrals: 'GET /api/users/:wallet/referrals',
        campaigns: 'GET /api/users/:wallet/campaigns',
      },
      campaign: {
        register: 'POST /api/campaign/register { wallet, github_handle?, x_handle?, track }',
        participant: 'GET /api/campaign/participant/:wallet',
        config: 'GET /api/campaign/config',
        payoutSnapshot: 'POST /api/campaign/payout-snapshot (admin, Bearer token)',
      },
      campaigns: {
        list: 'GET /api/campaigns?status=&track_type=&page=&limit=',
        active: 'GET /api/campaigns/active',
        get: 'GET /api/campaigns/:id',
        create: 'POST /api/campaigns { creator_wallet, title, description?, pool_amount, token?, track_type?, start_date, end_date, required_hashtags?, required_mentions?, github_repo_url?, github_issue_labels?, max_oss_contributions?, max_content_contributions?, score_threshold? }',
        fund: 'POST /api/campaigns/:id/fund { wallet, tx_hash? }',
        enroll: 'POST /api/campaigns/:id/enroll { wallet }',
        leaderboard: 'GET /api/campaigns/:id/leaderboard?page=&limit=',
        participants: 'GET /api/campaigns/:id/participants?page=&limit=',
        payoutPreview: 'GET /api/campaigns/:id/payout-preview',
        executePayout: 'POST /api/campaigns/:id/execute-payout (admin, Bearer token)',
      },
      webhooks: {
        github: 'POST /api/webhooks/github (GitHub webhook endpoint, HMAC verified)',
      },
      leaderboard: {
        list: 'GET /api/leaderboard?page=&limit=&track=',
        stats: 'GET /api/leaderboard/stats',
        participant: 'GET /api/leaderboard/:wallet',
      },
      bridge: {
        info: 'GET /api/bridge/info',
        routes: 'GET /api/bridge/routes',
        routeForToken: 'GET /api/bridge/routes/:token',
        estimate: 'POST /api/bridge/estimate { token, amount, direction? }',
        initiate: 'POST /api/bridge/initiate { wallet, token, amount, direction?, sourceTxHash? }',
        updateStatus: 'PUT /api/bridge/status/:id { status, destinationTxHash?, confirmations? }',
        getTransaction: 'GET /api/bridge/tx/:id',
        getByTxHash: 'GET /api/bridge/status/:txHash',
        history: 'GET /api/bridge/history/:wallet?limit=&offset=&status=&token=',
        stats: 'GET /api/bridge/stats/:wallet',
      },
      distributionPools: {
        config: 'GET /api/distribution-pools/config',
        total: 'GET /api/distribution-pools/total',
        byAdmin: 'GET /api/distribution-pools/by-admin/:admin',
        getPool: 'GET /api/distribution-pools/:poolId',
        getMember: 'GET /api/distribution-pools/:poolId/member/:member',
        allClaimable: 'GET /api/distribution-pools/:poolId/claimable',
        create: 'POST /api/distribution-pools { super_token, mode? }',
        setUnits: 'POST /api/distribution-pools/:poolId/set-units { member, units, mode? }',
        distribute: 'POST /api/distribution-pools/:poolId/distribute { amount, mode? }',
        setInflowRate: 'POST /api/distribution-pools/:poolId/set-inflow-rate { sender, flow_rate, mode? }',
        claim: 'POST /api/distribution-pools/:poolId/claim',
        claimFor: 'POST /api/distribution-pools/:poolId/claim-for { member, mode? }',
      },
      varaEth: {
        info:        'GET /api/vara-eth/info',
        balance:     'GET /api/vara-eth/balance/:address',
        wvara:       'GET /api/vara-eth/wvara/:address',
        claimable:   'GET /api/vara-eth/claimable/:address',
        depositor:   'GET /api/vara-eth/depositor/:streamId',
        streams:     'GET /api/vara-eth/streams/:address',
        deposit:     'POST /api/vara-eth/deposit { receiver, flowRate, amount }',
        addDeposit:  'POST /api/vara-eth/deposit/:streamId { amount }',
        withdraw:    'POST /api/vara-eth/withdraw/:streamId { amount }',
        stop:        'POST /api/vara-eth/stop/:streamId',
        claim:       'POST /api/vara-eth/claim',
      },
      solvency: {
        config: 'GET /api/solvency/config',
        account: 'GET /api/solvency/account/:account?superToken=',
        stream: 'GET /api/solvency/stream/:streamId',
        atRisk: 'GET /api/solvency/at-risk?superToken=&threshold=',
        liquidationRecord: 'GET /api/solvency/liquidation/:streamId',
        totalLiquidations: 'GET /api/solvency/total-liquidations',
        liquidate: 'POST /api/solvency/liquidate { stream_id, sender, super_token, mode? }',
        topUp: 'POST /api/solvency/top-up { sender, super_token, amount, mode? }',
        setStreamCore: 'POST /api/solvency/admin/set-stream-core { stream_core }',
        setThreshold: 'POST /api/solvency/admin/set-threshold { seconds }',
        setReward: 'POST /api/solvency/admin/set-reward { reward }',
        pause: 'POST /api/solvency/admin/pause',
        unpause: 'POST /api/solvency/admin/unpause',
      },
      _note: 'POST routes accept { mode: "payload" } to return encoded payload for client-side wallet signing instead of server-side execution.',
    },
  });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  console.error(`[error] ${req.method} ${req.path}: ${message}`);
  res.status(status).json({ error: message });
});

async function start() {
  try {
    // Run database migrations (creates tables if not exist)
    try {
      await migrate();
      await ensureVoucherTable();
    } catch (dbErr) {
      console.warn(`[db] Migration warning: ${dbErr.message}`);
    }

    await connect();

    // Fix stale PENDING rows for auto-approve quest types (TELEGRAM_JOIN, VISIT_URL)
    // These should never be pending — auto-approve them now
    if (REWARDS_FROZEN) {
      console.log('[startup] Rewards frozen; skipped stale pending auto-approval');
    } else {
      try {
        const { query: dbQuery } = await import('./services/db.mjs');
        const fixed = await dbQuery(`
          UPDATE quest_completions qc
          SET status = 'VERIFIED',
              seeds_awarded = q.seeds_reward,
              verified_at   = NOW()
          FROM quests q
          WHERE qc.quest_id = q.id
            AND qc.status = 'PENDING'
            AND q.quest_type IN ('TELEGRAM_JOIN', 'VISIT_URL')
          RETURNING qc.id
        `);
        if (fixed.rowCount > 0) {
          console.log(`[startup] Auto-approved ${fixed.rowCount} stale PENDING telegram/visit-url quests`);
          // Insert seeds_ledger entries for newly approved ones
          await dbQuery(`
            INSERT INTO seeds_ledger (wallet, delta, reason, quest_id)
            SELECT qc.wallet, q.seeds_reward, 'QUEST_COMPLETE', q.id
            FROM quest_completions qc
            JOIN quests q ON q.id = qc.quest_id
            WHERE qc.status = 'VERIFIED'
              AND qc.verified_at >= NOW() - INTERVAL '10 seconds'
              AND q.quest_type IN ('TELEGRAM_JOIN', 'VISIT_URL')
              AND NOT EXISTS (
                SELECT 1 FROM seeds_ledger sl
                WHERE sl.wallet = qc.wallet AND sl.quest_id = q.id
              )
          `);
        }
      } catch (cleanupErr) {
        console.warn(`[startup] Pending cleanup warning: ${cleanupErr.message}`);
      }
    }

    app.listen(PORT, '0.0.0.0', async () => {
      console.log(`[api] GrowStreams V3 API listening on port ${PORT}`);
      console.log(`[api] http://localhost:${PORT}`);

      // Start campaign cron jobs
      try {
        initCrons();
      } catch (err) {
        console.warn(`[cron] Failed to initialize: ${err.message}`);
      }

      // Start X/Twitter filtered stream (non-blocking, server runs even if this fails)
      try {
        await startXStream();
      } catch (err) {
        console.warn(`[x-agent] Failed to start: ${err.message}`);
      }
    });
  } catch (err) {
    console.error('[fatal]', err.message);
    process.exit(1);
  }
}

start();

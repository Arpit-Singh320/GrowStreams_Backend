import cron from 'node-cron';
import { runDailyXP } from './daily-xp.mjs';
import { runSnapshot } from './leaderboard-snapshot.mjs';
import { runReevaluate } from './x-reevaluate.mjs';
import { runCampaignLifecycle } from './campaign-lifecycle.mjs';
import { runStreamCheck } from './quest-stream-monitor.mjs';
import { runFollowCheck, runMentionCheck } from './quest-x-monitor.mjs';
import { syncOnchainMints } from '../services/quest-service.mjs';

export function initCrons() {
  // Daily XP accumulation — midnight UTC
  cron.schedule('0 0 * * *', async () => {
    try {
      await runDailyXP();
    } catch (err) {
      console.error(`[cron] daily-xp failed: ${err.message}`);
    }
  }, { timezone: 'UTC' });

  // Leaderboard snapshot — 00:05 UTC (after daily XP)
  cron.schedule('5 0 * * *', async () => {
    try {
      await runSnapshot();
    } catch (err) {
      console.error(`[cron] snapshot failed: ${err.message}`);
    }
  }, { timezone: 'UTC' });

  // X tweet re-evaluation — every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    try {
      await runReevaluate();
    } catch (err) {
      console.error(`[cron] x-reevaluate failed: ${err.message}`);
    }
  }, { timezone: 'UTC' });

  // Campaign lifecycle — every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runCampaignLifecycle();
    } catch (err) {
      console.error(`[cron] campaign-lifecycle failed: ${err.message}`);
    }
  }, { timezone: 'UTC' });

  // Quest: stream creation check — every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      await runStreamCheck();
    } catch (err) {
      console.error(`[cron] quest-stream failed: ${err.message}`);
    }
  }, { timezone: 'UTC' });

  // Retry DB-only mints — every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await syncOnchainMints();
      if (result.attempted > 0) {
        console.log(`[cron] sync-onchain: ${result.succeeded}/${result.attempted} mints synced, ${result.failed} failed`);
      }
    } catch (err) {
      console.error(`[cron] sync-onchain failed: ${err.message}`);
    }
  }, { timezone: 'UTC' });

  // Quest: X follow check — every 6 hours (rate limit safe)
  cron.schedule('0 */6 * * *', async () => {
    try {
      await runFollowCheck();
    } catch (err) {
      console.error(`[cron] quest-x-follow failed: ${err.message}`);
    }
  }, { timezone: 'UTC' });

  // Quest: X mention check — every 6 hours offset by 1h (avoid same-window collision)
  cron.schedule('0 1,7,13,19 * * *', async () => {
    try {
      await runMentionCheck();
    } catch (err) {
      console.error(`[cron] quest-x-mention failed: ${err.message}`);
    }
  }, { timezone: 'UTC' });

  console.log('[cron] All cron jobs scheduled:');
  console.log('[cron]   daily-xp:         0 0 * * *      (midnight UTC)');
  console.log('[cron]   snapshot:         5 0 * * *      (00:05 UTC)');
  console.log('[cron]   x-reeval:         0 */6 * * *    (every 6h)');
  console.log('[cron]   campaign-lifecycle: */15 * * * * (every 15m)');
  console.log('[cron]   quest-stream:     */10 * * * *   (every 10m)');
  console.log('[cron]   sync-onchain:     0 * * * *      (every 1h)');
  console.log('[cron]   quest-x-follow:   0 */6 * * *    (every 6h)');
  console.log('[cron]   quest-x-mention:  0 1,7,13,19 * * * (every 6h offset)');
}

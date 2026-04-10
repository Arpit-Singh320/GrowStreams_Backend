import cron from 'node-cron';
import { runDailyXP } from './daily-xp.mjs';
import { runSnapshot } from './leaderboard-snapshot.mjs';
import { runReevaluate } from './x-reevaluate.mjs';
import { runCampaignStatusCheck } from './campaign-status.mjs';
import { pollRecentTweets, pollRegisteredUsers } from '../services/x-agent.mjs';

// Lock map to prevent overlapping cron executions (Bug #5 fix)
const locks = new Map();

async function withLock(name, fn) {
  if (locks.get(name)) {
    console.warn(`[cron] Skipping ${name}: previous run still in progress`);
    return;
  }
  locks.set(name, true);
  try {
    await fn();
  } catch (err) {
    console.error(`[cron] ${name} failed:`, err.message, err.stack);
  } finally {
    locks.set(name, false);
  }
}

export function initCrons() {
  // Daily XP accumulation — midnight UTC
  cron.schedule('0 0 * * *', () => withLock('daily-xp', runDailyXP), { timezone: 'UTC' });

  // Leaderboard snapshot — 00:05 UTC (after daily XP)
  cron.schedule('5 0 * * *', () => withLock('snapshot', runSnapshot), { timezone: 'UTC' });

  // X tweet re-evaluation — every 6 hours
  cron.schedule('0 */6 * * *', () => withLock('x-reevaluate', runReevaluate), { timezone: 'UTC' });

  // X tweet polling — every 15 minutes (fallback for free-tier filtered stream)
  cron.schedule('*/15 * * * *', () => withLock('x-poll', pollRecentTweets), { timezone: 'UTC' });

  // Poll registered users' timelines — every 30 minutes
  cron.schedule('*/30 * * * *', () => withLock('x-user-poll', pollRegisteredUsers), { timezone: 'UTC' });

  // Campaign status check — every hour (Bug #1 fix)
  cron.schedule('0 * * * *', () => withLock('campaign-status', runCampaignStatusCheck), { timezone: 'UTC' });

  console.log('[cron] Campaign jobs scheduled:');
  console.log('[cron]   daily-xp:         0 0 * * *     (midnight UTC)');
  console.log('[cron]   snapshot:         5 0 * * *     (00:05 UTC)');
  console.log('[cron]   x-reeval:         0 */6 * * *   (every 6h)');
  console.log('[cron]   x-poll:           */15 * * * *  (every 15min)');
  console.log('[cron]   x-user-poll:      */30 * * * *  (every 30min)');
  console.log('[cron]   campaign-status:  0 * * * *     (every hour)');
}

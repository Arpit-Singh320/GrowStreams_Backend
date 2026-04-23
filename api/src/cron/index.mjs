import cron from 'node-cron';
import { runDailyXP } from './daily-xp.mjs';
import { runSnapshot } from './leaderboard-snapshot.mjs';
import { runReevaluate } from './x-reevaluate.mjs';
import { runCampaignStatusCheck } from './campaign-status.mjs';
import { pollRecentTweets, pollRegisteredUsers } from '../services/x-agent.mjs';
import { runFollowCheck, runMentionCheck } from './quest-x-monitor.mjs';
import { runStreamCheck } from './quest-stream-monitor.mjs';

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

  // 🚨 ALL X API CRONS DISABLED - BURNING CREDITS 🚨
  // X reads are billed per user-record returned. Pagination was consuming ~$5/request.
  // Do NOT re-enable without redesigning verification strategy.
  // cron.schedule('0 0 * * *', () => withLock('x-reevaluate', runReevaluate), { timezone: 'UTC' });
  // cron.schedule('0 */12 * * *', () => withLock('x-poll', pollRecentTweets), { timezone: 'UTC' });
  // cron.schedule('*/30 * * * *', () => withLock('x-user-poll', pollRegisteredUsers), { timezone: 'UTC' });
  // cron.schedule('0 2 * * *', () => withLock('quest-follow', runFollowCheck), { timezone: 'UTC' });
  // cron.schedule('0 4 * * *', () => withLock('quest-mention', runMentionCheck), { timezone: 'UTC' });

  // Campaign status check — every 12 hours (DB-only, no API cost)
  cron.schedule('0 */12 * * *', () => withLock('campaign-status', runCampaignStatusCheck), { timezone: 'UTC' });

  // Q5: Stream creation check — every 5 minutes
  cron.schedule('*/5 * * * *', () => withLock('quest-stream', runStreamCheck), { timezone: 'UTC' });

  console.log('[cron] Campaign jobs scheduled:');
  console.log('[cron]   daily-xp:         0 0 * * *     (midnight UTC)');
  console.log('[cron]   snapshot:         5 0 * * *     (00:05 UTC)');
  console.log('[cron]   � ALL X API CRONS DISABLED (burning credits)');
  console.log('[cron]   campaign-status:  0 */12 * * *  (every 12h)');
  console.log('[cron]   quest-stream:     */5 * * * *   (every 5min) ✅ on-chain, no API cost');
}

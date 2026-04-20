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

  // X tweet re-evaluation — every 12 hours (reduced from 6h to save credits)
  cron.schedule('0 */12 * * *', () => withLock('x-reevaluate', runReevaluate), { timezone: 'UTC' });

  // X tweet polling — every 2 hours (reduced from 15min to save credits)
  cron.schedule('0 */2 * * *', () => withLock('x-poll', pollRecentTweets), { timezone: 'UTC' });

  // Poll registered users' timelines — DISABLED (too expensive, use manual claim instead)
  // cron.schedule('*/30 * * * *', () => withLock('x-user-poll', pollRegisteredUsers), { timezone: 'UTC' });

  // Campaign status check — every 6 hours (reduced from 1h)
  cron.schedule('0 */6 * * *', () => withLock('campaign-status', runCampaignStatusCheck), { timezone: 'UTC' });

  // Quest monitoring crons
  // Q1: X follow check — every 1 hour (reduced from 5min to save credits - users can use manual claim)
  cron.schedule('0 * * * *', () => withLock('quest-follow', runFollowCheck), { timezone: 'UTC' });

  // Q2: X mention check — every 2 hours (reduced from 10min to save credits)
  cron.schedule('0 */2 * * *', () => withLock('quest-mention', runMentionCheck), { timezone: 'UTC' });

  // Q5: Stream creation check — every 5 minutes
  cron.schedule('*/5 * * * *', () => withLock('quest-stream', runStreamCheck), { timezone: 'UTC' });

  console.log('[cron] Campaign jobs scheduled:');
  console.log('[cron]   daily-xp:         0 0 * * *     (midnight UTC)');
  console.log('[cron]   snapshot:         5 0 * * *     (00:05 UTC)');
  console.log('[cron]   x-reeval:         0 */12 * * *  (every 12h) 💰 REDUCED');
  console.log('[cron]   x-poll:           0 */2 * * *   (every 2h) 💰 REDUCED');
  console.log('[cron]   x-user-poll:      DISABLED     💰 DISABLED TO SAVE CREDITS');
  console.log('[cron]   campaign-status:  0 */6 * * *   (every 6h) 💰 REDUCED');
  console.log('[cron] Quest monitoring jobs scheduled:');
  console.log('[cron]   quest-follow:     0 * * * *     (every 1h) 💰 REDUCED - use manual claim!');
  console.log('[cron]   quest-mention:    0 */2 * * *   (every 2h) 💰 REDUCED');
  console.log('[cron]   quest-stream:     */5 * * * *   (every 5min) ✅ on-chain, no API cost');
}

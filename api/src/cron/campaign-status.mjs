import { queryAll, query } from '../services/db.mjs';

/**
 * Check and update campaign status based on end dates.
 * Marks campaigns as 'ENDED' if past their end date but still 'ACTIVE'.
 * Also freezes XP accumulation for ended campaigns.
 */
export async function runCampaignStatusCheck() {
  const startTime = Date.now();
  console.log('[campaign-status] Checking campaign statuses...');

  try {
    const now = new Date().toISOString();

    // Find campaigns that should be ended but aren't yet
    const endDate = process.env.CAMPAIGN_END_DATE;
    if (endDate && new Date(endDate) < new Date(now)) {
      // Mark contributions as COMPLETED for ended campaigns
      const { rowCount } = await query(
        `UPDATE contributions
         SET status = 'COMPLETED', updated_at = NOW()
         WHERE status IN ('ACTIVE', 'PENDING')
           AND submitted_at < $1`,
        [endDate]
      );

      if (rowCount > 0) {
        console.log(`[campaign-status] Marked ${rowCount} contributions as COMPLETED (campaign ended ${endDate})`);
      }
    }

    // Also handle per-contribution max_daily_until expiry
    const expiredResult = await query(
      `UPDATE contributions
       SET status = 'COMPLETED', updated_at = NOW()
       WHERE status = 'ACTIVE'
         AND max_daily_until IS NOT NULL
         AND max_daily_until < $1`,
      [now]
    );

    if (expiredResult.rowCount > 0) {
      console.log(`[campaign-status] Expired ${expiredResult.rowCount} contributions past max_daily_until`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[campaign-status] Complete (${elapsed}ms)`);
  } catch (err) {
    console.error(`[campaign-status] Error: ${err.message}`, err.stack);
  }
}

import { queryAll, query } from '../services/db.mjs';
import { executeCampaignPayout } from '../services/campaign-service.mjs';

/**
 * Campaign lifecycle cron — runs every 15 minutes.
 *
 * 1. Auto-start: FUNDED campaigns whose start_date has passed → ACTIVE
 * 2. Auto-end:   ACTIVE campaigns whose end_date has passed   → ENDED
 *    On auto-end, also trigger payout calculation (best-effort).
 */
export async function runCampaignLifecycle() {
  const startTime = Date.now();
  console.log('[campaign-lifecycle] Running campaign lifecycle check...');

  let transitioned = 0;

  // -----------------------------------------------------------------------
  // 1. Auto-start: FUNDED → ACTIVE
  // -----------------------------------------------------------------------
  try {
    const fundedReady = await queryAll(
      `SELECT id, title FROM campaigns WHERE status = 'FUNDED' AND start_date <= NOW()`
    );

    for (const campaign of fundedReady) {
      try {
        await query(
          `UPDATE campaigns SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
          [campaign.id]
        );
        console.log(`[campaign-lifecycle] Campaign "${campaign.id}" "${campaign.title}" transitioned: FUNDED → ACTIVE`);
        transitioned++;
      } catch (err) {
        console.error(`[campaign-lifecycle] Failed to activate campaign ${campaign.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[campaign-lifecycle] Failed to query FUNDED campaigns: ${err.message}`);
  }

  // -----------------------------------------------------------------------
  // 2. Auto-end: ACTIVE → ENDED + payout calculation
  // -----------------------------------------------------------------------
  try {
    const activeExpired = await queryAll(
      `SELECT id, title FROM campaigns WHERE status = 'ACTIVE' AND end_date <= NOW()`
    );

    for (const campaign of activeExpired) {
      // Always mark as ENDED first — payout errors must not keep campaign ACTIVE
      try {
        await query(
          `UPDATE campaigns SET status = 'ENDED', ended_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [campaign.id]
        );
        console.log(`[campaign-lifecycle] Campaign "${campaign.id}" "${campaign.title}" transitioned: ACTIVE → ENDED`);
        transitioned++;
      } catch (err) {
        console.error(`[campaign-lifecycle] Failed to end campaign ${campaign.id}: ${err.message}`);
        continue; // If we can't even mark it ENDED, skip payout
      }

      // Best-effort payout calculation
      try {
        await executeCampaignPayout(campaign.id);
        console.log(`[campaign-lifecycle] Payout calculated for campaign ${campaign.id}`);
      } catch (payoutErr) {
        console.error(`[campaign-lifecycle] Payout calculation failed for campaign ${campaign.id}: ${payoutErr.message}`);
      }
    }
  } catch (err) {
    console.error(`[campaign-lifecycle] Failed to query ACTIVE campaigns: ${err.message}`);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[campaign-lifecycle] Complete: ${transitioned} transitions (${elapsed}ms)`);
}

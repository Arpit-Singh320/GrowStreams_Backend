import { persistAnalyticsSnapshot } from '../services/analytics-service.mjs';

export async function runAnalyticsSnapshot() {
  const result = await persistAnalyticsSnapshot();
  if (result.saved) {
    console.log(`[analytics] Snapshot saved at ${result.snappedAt} (${result.tokenCount} tokens)`);
  } else {
    console.log(`[analytics] Snapshot skipped: ${result.reason}`);
  }
  return result;
}

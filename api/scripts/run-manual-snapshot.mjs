import { persistAnalyticsSnapshot } from '../src/services/analytics-service.mjs';
import { connect } from '../src/sails-client.mjs';
import { config } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

config();
config({ path: resolve(__dirname, '../../.env.local'), override: true });

async function runManualSnapshot() {
  console.log('[manual-snapshot] Starting manual analytics snapshot...');
  try {
    console.log('[manual-snapshot] Connecting to Gear API...');
    await connect();
    console.log('[manual-snapshot] Gear API connected');

    const result = await persistAnalyticsSnapshot();
    console.log('[manual-snapshot] Snapshot result:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('[manual-snapshot] Snapshot failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runManualSnapshot();

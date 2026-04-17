import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../api/.env') });

const API = 'https://growstreams-launch-production.up.railway.app';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_SECRET || 'growstreams_admin_test_2026';

async function testStreamQuest(wallet) {
  console.log(`\n🧪 Testing stream quest for wallet: ${wallet}\n`);

  // 1. Check registration
  try {
    const resp = await fetch(`${API}/api/quests/me?wallet=${wallet}`);
    if (resp.ok) {
      const data = await resp.json();
      console.log(`✅ User registered: ${data.registration?.email || 'N/A'}`);
      
      const streamQuest = data.progress?.find(q => q.slug === 'create-stream');
      if (streamQuest) {
        console.log(`   Stream quest status: ${streamQuest.status}`);
        console.log(`   Completed: ${streamQuest.completed ? 'Yes' : 'No'}`);
        if (streamQuest.completed_at) {
          console.log(`   Completed at: ${streamQuest.completed_at}`);
        }
      } else {
        console.log(`   ⚠️  Stream quest not found in progress`);
      }
    } else {
      console.log(`❌ User not registered or API error: HTTP ${resp.status}`);
      return;
    }
  } catch (err) {
    console.error(`❌ Registration check failed: ${err.message}`);
    return;
  }

  // 2. Trigger claim (manual verification)
  console.log(`\n🔄 Triggering manual claim verification...`);
  try {
    const resp = await fetch(`${API}/api/quests/create-stream/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    });
    
    if (resp.ok) {
      const data = await resp.json();
      console.log(`✅ Claim submitted: ${data.message}`);
      console.log(`   Status: ${data.status}`);
    } else {
      const err = await resp.json().catch(() => ({}));
      console.log(`❌ Claim failed: HTTP ${resp.status} - ${err.error || 'unknown'}`);
    }
  } catch (err) {
    console.error(`❌ Claim request failed: ${err.message}`);
  }

  // 3. Wait and check again
  console.log(`\n⏳ Waiting 10 seconds for verification...`);
  await new Promise(r => setTimeout(r, 10000));

  try {
    const resp = await fetch(`${API}/api/quests/me?wallet=${wallet}`);
    if (resp.ok) {
      const data = await resp.json();
      const streamQuest = data.progress?.find(q => q.slug === 'create-stream');
      if (streamQuest) {
        console.log(`\n📊 Final status:`);
        console.log(`   Status: ${streamQuest.status}`);
        console.log(`   Completed: ${streamQuest.completed ? '✅ YES' : '❌ NO'}`);
        if (streamQuest.completed_at) {
          console.log(`   Completed at: ${streamQuest.completed_at}`);
        }
        if (streamQuest.completed) {
          console.log(`\n🎉 Stream quest verified successfully!`);
        } else {
          console.log(`\n⚠️  Quest still pending. Check:`);
          console.log(`   1. Did you create a stream with this wallet address?`);
          console.log(`   2. Is the stream on the correct network (testnet)?`);
          console.log(`   3. Check backend logs for contract query errors`);
        }
      }
    }
  } catch (err) {
    console.error(`❌ Final check failed: ${err.message}`);
  }
}

const wallet = process.argv[2];
if (!wallet) {
  console.error('Usage: node test-stream-quest.mjs <wallet_address>');
  console.error('Example: node test-stream-quest.mjs 0x...');
  process.exit(1);
}

testStreamQuest(wallet).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

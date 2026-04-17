import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TwitterApi } from 'twitter-api-v2';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../api/.env') });

const results = { passed: 0, failed: 0, warnings: 0 };

function pass(msg) { console.log(`  ✅ ${msg}`); results.passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); results.failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); results.warnings++; }

// ─── Test 1: X (Twitter) Bearer Token ──────────────────────────────────────
async function testXAgent() {
  console.log('\n═══ Test 1: X (Twitter) Agent ═══');
  
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) { fail('X_BEARER_TOKEN not set'); return; }
  pass('X_BEARER_TOKEN is set');

  const client = new TwitterApi(bearer);

  // Test 1a: Look up @GrowStreams
  try {
    const user = await client.v2.userByUsername('GrowStreams');
    if (user?.data?.id) {
      pass(`Found @GrowStreams → ID: ${user.data.id}, Name: ${user.data.name}`);
    } else {
      fail('Could not find @GrowStreams user');
    }
  } catch (err) {
    fail(`User lookup failed: ${err.message}`);
  }

  // Test 1b: Check user timeline access (for mention fallback)
  try {
    const user = await client.v2.userByUsername('GrowStreams');
    if (user?.data?.id) {
      const timeline = await client.v2.userTimeline(user.data.id, { max_results: 5 });
      const count = timeline?.data?.data?.length || 0;
      pass(`User timeline access works (${count} recent tweets)`);
    }
  } catch (err) {
    if (err.code === 429) {
      warn(`Rate limited on timeline — expected, try again later`);
    } else {
      warn(`Timeline access failed: ${err.message} (mention fallback may not work)`);
    }
  }

  // Test 1c: Check followers endpoint (for follow quest)
  try {
    const user = await client.v2.userByUsername('GrowStreams');
    if (user?.data?.id) {
      const followers = await client.v2.followers(user.data.id, { max_results: 5 });
      const count = followers?.data?.length || 0;
      pass(`Followers endpoint works (${count} followers in sample)`);
    }
  } catch (err) {
    if (err.code === 429) {
      warn(`Rate limited on followers — expected, try again later`);
    } else {
      fail(`Followers check failed: ${err.message}`);
    }
  }

  // Test 1d: Search API (for mention quest primary strategy)
  try {
    const searchResult = await client.v2.search('@GrowStreams', { max_results: 10 });
    const count = searchResult?.data?.data?.length || 0;
    pass(`Search API works (${count} results) — mention quest primary strategy available`);
  } catch (err) {
    if (err.code === 403 || err.message?.includes('not authorized')) {
      warn('Search API not available (free tier) — will use timeline fallback');
    } else if (err.code === 429) {
      warn('Search API rate limited — try again later');
    } else {
      warn(`Search API error: ${err.message} — will use timeline fallback`);
    }
  }
}

// ─── Test 2: GitHub Agent ───────────────────────────────────────────────────
async function testGitHubAgent() {
  console.log('\n═══ Test 2: GitHub Agent ═══');

  const token = process.env.GITHUB_TOKEN;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const owner = process.env.GITHUB_REPO_OWNER || 'BlockXAI';
  const repo = process.env.GITHUB_REPO_NAME || 'GrowStreams_Backend';

  if (!token) { fail('GITHUB_TOKEN not set'); return; }
  pass('GITHUB_TOKEN is set');

  if (!secret) { fail('GITHUB_WEBHOOK_SECRET not set'); return; }
  pass('GITHUB_WEBHOOK_SECRET is set');

  // Test 2a: Verify token works
  try {
    const resp = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (resp.ok) {
      const data = await resp.json();
      pass(`GitHub token valid — authenticated as @${data.login}`);
    } else {
      fail(`GitHub token invalid — HTTP ${resp.status}`);
    }
  } catch (err) {
    fail(`GitHub API unreachable: ${err.message}`);
  }

  // Test 2b: Check repo access
  try {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (resp.ok) {
      const data = await resp.json();
      pass(`Repo accessible: ${data.full_name} (⭐ ${data.stargazers_count})`);
    } else {
      fail(`Cannot access repo ${owner}/${repo} — HTTP ${resp.status}`);
    }
  } catch (err) {
    fail(`Repo check failed: ${err.message}`);
  }

  // Test 2c: Check stargazers endpoint (for star quest verification)
  try {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/stargazers?per_page=5`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (resp.ok) {
      const stars = await resp.json();
      pass(`Stargazers endpoint works (${stars.length} in sample)`);
    } else {
      fail(`Stargazers endpoint failed — HTTP ${resp.status}`);
    }
  } catch (err) {
    fail(`Stargazers check failed: ${err.message}`);
  }

  // Test 2d: Check webhooks configuration
  try {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (resp.ok) {
      const hooks = await resp.json();
      if (hooks.length > 0) {
        pass(`${hooks.length} webhook(s) configured on repo`);
        for (const hook of hooks) {
          const events = hook.events?.join(', ') || 'unknown';
          console.log(`      → ${hook.config?.url || 'no-url'} [events: ${events}]`);
        }
      } else {
        warn('No webhooks configured — star/PR quests need a webhook');
      }
    } else if (resp.status === 404) {
      warn('Cannot list webhooks — token may lack admin:repo_hook scope');
    }
  } catch (err) {
    warn(`Webhook check failed: ${err.message}`);
  }
}

// ─── Test 3: Quest Endpoints (against production API) ───────────────────────
async function testQuestEndpoints() {
  console.log('\n═══ Test 3: Quest API Endpoints (Production) ═══');

  const API = 'https://growstreams-launch-production.up.railway.app';
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'growstreams_admin_test_2026';

  // Test 3a: List quests
  try {
    const resp = await fetch(`${API}/api/quests`);
    if (resp.ok) {
      const data = await resp.json();
      const count = data.quests?.length || 0;
      pass(`GET /api/quests works — ${count} quests listed`);
      for (const q of (data.quests || [])) {
        console.log(`      → ${q.slug}: ${q.title} (${q.seeds_reward} Seeds)`);
      }
    } else {
      fail(`GET /api/quests failed — HTTP ${resp.status}`);
    }
  } catch (err) {
    fail(`Quest list failed: ${err.message}`);
  }

  // Test 3b: Generate invite codes
  try {
    const resp = await fetch(`${API}/api/quests/admin/generate-invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ count: 3, max_uses: 5 }),
    });
    if (resp.ok) {
      const data = await resp.json();
      pass(`POST /admin/generate-invites works`);
      console.log(`      → Generated ${data.codes?.length || 0} invite codes:`);
      for (const code of (data.codes || [])) {
        console.log(`         🎟️  ${code}`);
      }
    } else {
      const err = await resp.json().catch(() => ({}));
      fail(`Generate invites failed — HTTP ${resp.status}: ${err.error || 'unknown'}`);
    }
  } catch (err) {
    fail(`Generate invites failed: ${err.message}`);
  }

  // Test 3c: Stats
  try {
    const resp = await fetch(`${API}/api/quests/stats`);
    if (resp.ok) {
      const data = await resp.json();
      pass(`GET /api/quests/stats works — ${data.totalRegistered || 0} registered, ${data.totalSeedsMinted || 0} Seeds minted`);
    } else {
      fail(`Stats endpoint failed — HTTP ${resp.status}`);
    }
  } catch (err) {
    fail(`Stats check failed: ${err.message}`);
  }
}

// ─── Run All Tests ──────────────────────────────────────────────────────────
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       GrowStreams Quest Agent Test Suite                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await testXAgent();
  await testGitHubAgent();
  await testQuestEndpoints();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`Results: ${results.passed} passed, ${results.failed} failed, ${results.warnings} warnings`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (results.failed > 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

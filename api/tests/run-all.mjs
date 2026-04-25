// Test Runner -- Executes all test suites sequentially
// Run: node api/tests/run-all.mjs [--integration]
// Without --integration: runs only unit tests (no server needed)
// With --integration: also runs API integration tests (server must be running)

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runIntegration = process.argv.includes('--integration');

const suites = [
  { name: 'Unit: Decimals', cmd: 'node api/tests/unit/decimals.test.mjs', unit: true },
  { name: 'Unit: Token Registry', cmd: 'node api/tests/unit/tokens.test.mjs', unit: true },
  { name: 'Unit: Bridge Service', cmd: 'node api/tests/unit/bridge-service.test.mjs', unit: true },
  { name: 'Integration: API V3', cmd: 'node api/tests/integration/api-v3.test.mjs', unit: false },
];

const root = resolve(__dirname, '../..');
let totalPassed = 0;
let totalFailed = 0;
const results = [];

console.log('=== GrowStreams V3 -- Test Runner ===\n');
console.log(`Mode: ${runIntegration ? 'Unit + Integration' : 'Unit only'}\n`);

for (const suite of suites) {
  if (!suite.unit && !runIntegration) {
    console.log(`SKIP: ${suite.name} (use --integration)\n`);
    results.push({ name: suite.name, status: 'skipped' });
    continue;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${suite.name}`);
  console.log('='.repeat(60));

  try {
    const output = execSync(suite.cmd, { cwd: root, encoding: 'utf-8', timeout: 30000 });
    console.log(output);

    // Parse results from output
    const match = output.match(/RESULTS:\s*(\d+)\s*passed,\s*(\d+)\s*failed/);
    if (match) {
      const p = parseInt(match[1]);
      const f = parseInt(match[2]);
      totalPassed += p;
      totalFailed += f;
      results.push({ name: suite.name, status: f > 0 ? 'FAIL' : 'PASS', passed: p, failed: f });
    } else {
      results.push({ name: suite.name, status: 'PASS (no count)' });
    }
  } catch (err) {
    console.log(err.stdout || '');
    console.log(err.stderr || '');
    totalFailed++;
    results.push({ name: suite.name, status: 'ERROR', error: err.message?.slice(0, 100) });
  }
}

console.log('\n' + '='.repeat(60));
console.log('TEST SUITE SUMMARY');
console.log('='.repeat(60));
for (const r of results) {
  const icon = r.status === 'PASS' ? 'OK' : r.status === 'skipped' ? '--' : 'XX';
  console.log(`  [${icon}] ${r.name} ${r.passed != null ? `(${r.passed}/${r.passed + (r.failed || 0)})` : ''}`);
}
console.log('');
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
console.log('='.repeat(60));

process.exit(totalFailed > 0 ? 1 : 0);

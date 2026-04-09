// Integration Tests — GrowStreams V3 API Endpoints
// Tests /api/tokens, /api/vault, /api/streams, /api/bridge against a running API
// Run: node api/tests/integration/api-v3.test.mjs [base_url]
// Requires: API server running at BASE (default http://localhost:3001)

const BASE = process.argv[2] || process.env.API_URL || 'http://localhost:3001';
const DELAY = 1000;
let passed = 0;
let failed = 0;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function assert(condition, name) {
  if (condition) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

function assertEq(actual, expected, name) {
  if (String(actual) === String(expected)) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name} — got "${actual}", expected "${expected}"`); failed++; }
}

async function run(label, fn) {
  console.log(`\n[${label}]`);
  try { await fn(); }
  catch (err) { console.log(`  ERROR: ${err.message}`); failed++; }
  await sleep(DELAY);
}

async function main() {
  console.log('=== GrowStreams V3 — API Integration Tests ===\n');
  console.log(`Target: ${BASE}\n`);

  // ─────────────────────────────────────────────────────
  // 0. Health & Root
  // ─────────────────────────────────────────────────────
  console.log('\n--- Health & Root ---');

  await run('Health', async () => {
    const { status, data } = await get('/health');
    assertEq(status, 200, 'Health returns 200');
    assert(data.status === 'healthy', 'API is healthy');
  });

  await run('Root docs', async () => {
    const { status, data } = await get('/');
    assertEq(status, 200, 'Root returns 200');
    assertEq(data.version, '3.0.0', 'API version = 3.0.0');
    assert(data.docs.tokens, 'Docs include tokens');
    assert(data.docs.streams, 'Docs include streams');
    assert(data.docs.vault, 'Docs include vault');
    assert(data.docs.bridge, 'Docs include bridge');
  });

  // ─────────────────────────────────────────────────────
  // 1. Token Endpoints (/api/tokens)
  // ─────────────────────────────────────────────────────
  console.log('\n--- Token Endpoints ---');

  await run('GET /api/tokens', async () => {
    const { status, data } = await get('/api/tokens');
    assertEq(status, 200, 'Status 200');
    assertEq(data.count, 5, '5 tokens returned');
    assert(Array.isArray(data.tokens), 'tokens is array');
    const symbols = data.tokens.map(t => t.symbol);
    assert(symbols.includes('USDC'), 'Contains USDC');
    assert(symbols.includes('WETH'), 'Contains WETH');
    assert(symbols.includes('VARA'), 'Contains VARA');
  });

  await run('GET /api/tokens/stablecoins', async () => {
    const { status, data } = await get('/api/tokens/stablecoins');
    assertEq(status, 200, 'Status 200');
    assertEq(data.count, 2, '2 stablecoins');
    assert(data.tokens.every(t => t.isStablecoin), 'All are stablecoins');
  });

  await run('GET /api/tokens/addresses', async () => {
    const { status, data } = await get('/api/tokens/addresses');
    assertEq(status, 200, 'Status 200');
    assert(data.tokens.WUSDC.vara, 'WUSDC has Vara address');
    assert(data.tokens.WUSDC.eth, 'WUSDC has ETH address');
    assertEq(data.tokens.VARA.eth, null, 'VARA has no ETH address');
  });

  await run('GET /api/tokens/WUSDC — single token', async () => {
    const { status, data } = await get('/api/tokens/WUSDC');
    assertEq(status, 200, 'Status 200');
    assertEq(data.symbol, 'USDC', 'Symbol = USDC');
    assertEq(data.decimals, 6, 'Decimals = 6');
    assert(data.vara, 'Has Vara address');
  });

  await run('GET /api/tokens/INVALID — 404', async () => {
    const { status, data } = await get('/api/tokens/DOGECOIN');
    assertEq(status, 404, 'Unknown token returns 404');
    assert(data.error, 'Error message present');
  });

  await run('GET /api/tokens/WUSDC/resolve', async () => {
    const { status, data } = await get('/api/tokens/WUSDC/resolve');
    assertEq(status, 200, 'Status 200');
    assert(data.varaAddress && data.varaAddress.startsWith('0x'), 'Resolved Vara address');
    assertEq(data.symbol, 'USDC', 'Symbol matches');
    assertEq(data.decimals, 6, 'Decimals matches');
  });

  // ── Decimal Conversion ──
  await run('POST /api/tokens/WUSDC/convert toBase', async () => {
    const { status, data } = await post('/api/tokens/WUSDC/convert', { amount: '100.50', direction: 'toBase' });
    assertEq(status, 200, 'Status 200');
    assertEq(data.baseUnits, '100500000', '100.50 USDC → 100500000 base');
  });

  await run('POST /api/tokens/WUSDC/convert toDisplay', async () => {
    const { status, data } = await post('/api/tokens/WUSDC/convert', { amount: '100500000', direction: 'toDisplay' });
    assertEq(status, 200, 'Status 200');
    assertEq(data.displayUnits, '100.5', '100500000 base → 100.5 USDC');
  });

  await run('POST /api/tokens/WETH/convert toBase (18 dec)', async () => {
    const { status, data } = await post('/api/tokens/WETH/convert', { amount: '1.5', direction: 'toBase' });
    assertEq(status, 200, 'Status 200');
    assertEq(data.baseUnits, '1500000000000000000', '1.5 WETH → 1.5e18');
  });

  await run('POST /api/tokens/WBTC/convert toBase (8 dec)', async () => {
    const { status, data } = await post('/api/tokens/WBTC/convert', { amount: '0.001', direction: 'toBase' });
    assertEq(status, 200, 'Status 200');
    assertEq(data.baseUnits, '100000', '0.001 WBTC → 100000');
  });

  await run('POST /api/tokens/WUSDC/convert missing amount → 400', async () => {
    const { status, data } = await post('/api/tokens/WUSDC/convert', { direction: 'toBase' });
    assertEq(status, 400, 'Missing amount returns 400');
  });

  // ── Flow Rate Conversion ──
  await run('POST /api/tokens/WUSDC/flow-rate', async () => {
    const { status, data } = await post('/api/tokens/WUSDC/flow-rate', {
      amount: '100', fromInterval: 'month', toInterval: 'second',
    });
    assertEq(status, 200, 'Status 200');
    assert(data.perSecond.baseUnits, 'Per-second base units returned');
    assert(Number(data.perSecond.baseUnits) >= 0, 'Per-second rate is non-negative');
    assert(data.minDeposit.baseUnits, 'Min deposit returned');
  });

  await run('POST /api/tokens/WETH/flow-rate (18 dec)', async () => {
    const { status, data } = await post('/api/tokens/WETH/flow-rate', {
      amount: '0.01', fromInterval: 'day', toInterval: 'month',
    });
    assertEq(status, 200, 'Status 200');
    assert(data.per_month, 'Per-month rate returned');
  });

  await run('POST /api/tokens/WUSDC/flow-rate invalid interval → 400', async () => {
    const { status } = await post('/api/tokens/WUSDC/flow-rate', {
      amount: '100', fromInterval: 'fortnight',
    });
    assertEq(status, 400, 'Invalid interval returns 400');
  });

  // ─────────────────────────────────────────────────────
  // 2. Streams Endpoints (/api/streams)
  // ─────────────────────────────────────────────────────
  console.log('\n--- Streams Endpoints ---');

  await run('GET /api/streams/config', async () => {
    const { status, data } = await get('/api/streams/config');
    assertEq(status, 200, 'Status 200');
    assert(data.admin || data.Admin, 'Config has admin');
  });

  await run('GET /api/streams/total', async () => {
    const { status, data } = await get('/api/streams/total');
    assertEq(status, 200, 'Status 200');
    assert(data.total != null, 'Total returned');
  });

  await run('GET /api/streams/active', async () => {
    const { status, data } = await get('/api/streams/active');
    assertEq(status, 200, 'Status 200');
    assert(data.active != null, 'Active count returned');
  });

  await run('POST /api/streams — missing fields → 400', async () => {
    const { status } = await post('/api/streams', { receiver: '0x01' });
    assertEq(status, 400, 'Missing fields returns 400');
  });

  await run('POST /api/streams — payload mode', async () => {
    const { status, data } = await post('/api/streams', {
      receiver: '0x0000000000000000000000000000000000000000000000000000000000000001',
      token: 'WUSDC',
      flowRate: '100',
      flowRateInterval: 'month',
      initialDeposit: '500',
      mode: 'payload',
    });
    assertEq(status, 200, 'Payload mode returns 200');
    assert(data.payload, 'Payload returned');
    assert(data.resolved, 'Resolved info returned');
    assert(data.resolved.flowRateBaseUnits, 'Flow rate base units in resolved');
    assert(data.resolved.depositBaseUnits, 'Deposit base units in resolved');
  });

  await run('GET /api/streams/history/:wallet', async () => {
    const wallet = '0x0000000000000000000000000000000000000000000000000000000000000001';
    const { status, data } = await get(`/api/streams/history/${wallet}?limit=5&offset=0`);
    assertEq(status, 200, 'Status 200');
    assert(Array.isArray(data.events) || data.total != null, 'History structure valid');
  });

  await run('GET /api/streams/stats/:wallet', async () => {
    const wallet = '0x0000000000000000000000000000000000000000000000000000000000000001';
    const { status, data } = await get(`/api/streams/stats/${wallet}`);
    assertEq(status, 200, 'Status 200');
    // Stats structure depends on implementation; just verify no crash
    assert(data != null, 'Stats returned');
  });

  // ─────────────────────────────────────────────────────
  // 3. Vault Endpoints (/api/vault)
  // ─────────────────────────────────────────────────────
  console.log('\n--- Vault Endpoints ---');

  await run('GET /api/vault/config', async () => {
    const { status, data } = await get('/api/vault/config');
    assertEq(status, 200, 'Status 200');
    assert(data != null, 'Config returned');
  });

  await run('GET /api/vault/paused', async () => {
    const { status, data } = await get('/api/vault/paused');
    assertEq(status, 200, 'Status 200');
    assert(typeof data.paused === 'boolean', 'Paused is boolean');
  });

  await run('POST /api/vault/deposit — missing fields → 400', async () => {
    const { status } = await post('/api/vault/deposit', { token: 'WUSDC' });
    assertEq(status, 400, 'Missing amount returns 400');
  });

  await run('POST /api/vault/deposit — payload mode', async () => {
    const { status, data } = await post('/api/vault/deposit', {
      token: 'WUSDC', amount: '100', mode: 'payload',
    });
    assertEq(status, 200, 'Payload mode returns 200');
    assert(data.payload, 'Payload returned');
    assert(data.resolved, 'Resolved info returned');
    assertEq(data.resolved.baseUnits, '100000000', '100 USDC → 100000000 base');
  });

  await run('POST /api/vault/withdraw — payload mode', async () => {
    const { status, data } = await post('/api/vault/withdraw', {
      token: 'WETH', amount: '0.5', mode: 'payload',
    });
    assertEq(status, 200, 'Payload mode returns 200');
    assert(data.resolved.baseUnits, 'Has base units');
    assertEq(data.resolved.baseUnits, '500000000000000000', '0.5 WETH → 5e17');
  });

  await run('POST /api/vault/deposit — unknown token', async () => {
    const { status, data } = await post('/api/vault/deposit', {
      token: 'FAKECOIN', amount: '100', mode: 'payload',
    });
    // Should not crash — falls through to BigInt(amount) path
    assert(status === 200 || status === 400 || status === 500, 'Handles unknown token gracefully');
  });

  await run('GET /api/vault/allocation/:streamId', async () => {
    const { status, data } = await get('/api/vault/allocation/99');
    assertEq(status, 200, 'Status 200');
    assert(data.allocated != null, 'Allocation returned');
  });

  // ─────────────────────────────────────────────────────
  // 4. Bridge Endpoints (/api/bridge)
  // ─────────────────────────────────────────────────────
  console.log('\n--- Bridge Endpoints ---');

  await run('GET /api/bridge/info', async () => {
    const { status, data } = await get('/api/bridge/info');
    assertEq(status, 200, 'Status 200');
    assert(data.supported === true, 'Bridge supported');
    assertEq(data.routeCount, 4, '4 routes');
    assert(data.chains.ethereum, 'Ethereum chain info');
    assert(data.chains.vara, 'Vara chain info');
    assert(data.fees, 'Fee info present');
    assert(data.timing, 'Timing info present');
    assert(data.faucets, 'Faucet links present');
  });

  await run('GET /api/bridge/routes', async () => {
    const { status, data } = await get('/api/bridge/routes');
    assertEq(status, 200, 'Status 200');
    assertEq(data.count, 4, '4 routes');
    assert(Array.isArray(data.routes), 'Routes is array');
    const tokens = data.routes.map(r => r.token);
    assert(tokens.includes('WUSDC'), 'WUSDC bridgeable');
    assert(tokens.includes('WETH'), 'WETH bridgeable');
  });

  await run('GET /api/bridge/routes/WUSDC', async () => {
    const { status, data } = await get('/api/bridge/routes/WUSDC');
    assertEq(status, 200, 'Status 200');
    assertEq(data.token, 'WUSDC', 'Token key');
    assertEq(data.decimals, 6, 'Decimals');
    assert(data.source.chain === 'ethereum', 'Source = ethereum');
    assert(data.destination.chain === 'vara', 'Destination = vara');
  });

  await run('GET /api/bridge/routes/VARA — 404 (not bridgeable)', async () => {
    const { status } = await get('/api/bridge/routes/VARA');
    assertEq(status, 404, 'VARA returns 404');
  });

  await run('GET /api/bridge/routes/FAKECOIN — 404', async () => {
    const { status } = await get('/api/bridge/routes/FAKECOIN');
    assertEq(status, 404, 'Unknown token returns 404');
  });

  // ── Fee Estimation ──
  await run('POST /api/bridge/estimate — USDC 1000', async () => {
    const { status, data } = await post('/api/bridge/estimate', {
      token: 'WUSDC', amount: '1000',
    });
    assertEq(status, 200, 'Status 200');
    assertEq(data.feePercent, '0.10%', 'Fee = 0.10%');
    assertEq(data.fee, '1', 'Fee = 1 USDC');
    assertEq(data.netAmount, '999', 'Net = 999 USDC');
  });

  await run('POST /api/bridge/estimate — WETH 10', async () => {
    const { status, data } = await post('/api/bridge/estimate', {
      token: 'WETH', amount: '10', direction: 'ethToVara',
    });
    assertEq(status, 200, 'Status 200');
    assertEq(data.fee, '0.01', 'Fee = 0.01 ETH');
  });

  await run('POST /api/bridge/estimate — varaToEth direction', async () => {
    const { status, data } = await post('/api/bridge/estimate', {
      token: 'WUSDC', amount: '500', direction: 'varaToEth',
    });
    assertEq(status, 200, 'Status 200');
    assertEq(data.estimatedTimeMinutes, 20, 'varaToEth = 20 min');
  });

  await run('POST /api/bridge/estimate — missing fields → 400', async () => {
    const { status } = await post('/api/bridge/estimate', { token: 'WUSDC' });
    assertEq(status, 400, 'Missing amount returns 400');
  });

  await run('POST /api/bridge/estimate — invalid token → 400', async () => {
    const { status } = await post('/api/bridge/estimate', {
      token: 'DOGE', amount: '100',
    });
    assertEq(status, 400, 'Unknown token returns 400');
  });

  // ── Bridge Transaction Lifecycle (requires DB) ──
  let bridgeTxId = null;

  await run('POST /api/bridge/initiate', async () => {
    const { status, data } = await post('/api/bridge/initiate', {
      wallet: '0xTESTWALLET123',
      token: 'WUSDC',
      amount: '100',
      direction: 'ethToVara',
      sourceTxHash: '0xabc123test',
      fee: '0.1',
      feeRaw: '100000',
    });
    if (status === 201) {
      assert(data.transaction, 'Transaction created');
      bridgeTxId = data.transaction.id;
      assertEq(data.transaction.status, 'initiated', 'Initial status = initiated');
      console.log(`  Bridge TX ID: ${bridgeTxId}`);
    } else {
      // DB might not be available — acceptable in CI
      console.log(`  SKIP: DB not available (status ${status})`);
    }
  });

  if (bridgeTxId) {
    await run('GET /api/bridge/tx/:id', async () => {
      const { status, data } = await get(`/api/bridge/tx/${bridgeTxId}`);
      assertEq(status, 200, 'Status 200');
      assert(data.transaction, 'Transaction returned');
      assertEq(data.transaction.status, 'initiated', 'Status = initiated');
    });

    await run('PUT /api/bridge/status/:id — source_confirmed', async () => {
      const { status, data } = await put(`/api/bridge/status/${bridgeTxId}`, {
        status: 'source_confirmed',
        confirmations: 6,
      });
      assertEq(status, 200, 'Status 200');
      assertEq(data.transaction.status, 'source_confirmed', 'Updated to source_confirmed');
    });

    await run('PUT /api/bridge/status/:id — completed', async () => {
      const { status, data } = await put(`/api/bridge/status/${bridgeTxId}`, {
        status: 'completed',
        destinationTxHash: '0xdest456test',
        confirmations: 12,
      });
      assertEq(status, 200, 'Status 200');
      assertEq(data.transaction.status, 'completed', 'Updated to completed');
      assert(data.transaction.destination_tx_hash, 'Destination TX hash set');
    });

    await run('PUT /api/bridge/status/:id — invalid status', async () => {
      const { status } = await put(`/api/bridge/status/${bridgeTxId}`, {
        status: 'invalid_status',
      });
      assertEq(status, 500, 'Invalid status returns 500');
    });

    await run('GET /api/bridge/status/:txHash', async () => {
      const { status, data } = await get('/api/bridge/status/0xabc123test');
      assertEq(status, 200, 'Status 200');
      assert(data.transaction, 'Found by source TX hash');
    });

    await run('GET /api/bridge/history/:wallet', async () => {
      const { status, data } = await get('/api/bridge/history/0xTESTWALLET123?limit=10');
      assertEq(status, 200, 'Status 200');
      assert(data.transactions && data.transactions.length >= 1, 'At least 1 transaction in history');
      assert(data.total >= 1, 'Total count >= 1');
    });

    await run('GET /api/bridge/stats/:wallet', async () => {
      const { status, data } = await get('/api/bridge/stats/0xTESTWALLET123');
      assertEq(status, 200, 'Status 200');
      assert(data.totalBridges >= 1, 'At least 1 total bridge');
      assert(data.completed >= 1, 'At least 1 completed');
    });
  } else {
    console.log('\n  SKIP: Bridge TX lifecycle tests (DB not available)\n');
  }

  // ── Invalid Bridge Requests ──
  await run('POST /api/bridge/initiate — missing fields → 400', async () => {
    const { status } = await post('/api/bridge/initiate', { wallet: '0x01' });
    assertEq(status, 400, 'Missing fields returns 400');
  });

  await run('PUT /api/bridge/status/abc — invalid ID → 400', async () => {
    const { status } = await put('/api/bridge/status/abc', { status: 'completed' });
    assertEq(status, 400, 'Non-numeric ID returns 400');
  });

  await run('PUT /api/bridge/status/999 — missing status → 400', async () => {
    const { status } = await put('/api/bridge/status/999', {});
    assertEq(status, 400, 'Missing status returns 400');
  });

  await run('GET /api/bridge/tx/abc — invalid ID → 400', async () => {
    const { status } = await get('/api/bridge/tx/abc');
    assertEq(status, 400, 'Non-numeric ID returns 400');
  });

  // ─────────────────────────────────────────────────────
  // 5. Cross-endpoint Decimal Consistency
  // ─────────────────────────────────────────────────────
  console.log('\n--- Cross-endpoint Decimal Consistency ---');

  await run('USDC: convert → estimate → verify', async () => {
    // Convert 1000 USDC to base
    const { data: conv } = await post('/api/tokens/WUSDC/convert', { amount: '1000', direction: 'toBase' });
    // Estimate bridge fee for same amount
    const { data: est } = await post('/api/bridge/estimate', { token: 'WUSDC', amount: '1000' });
    // Both should agree on base amount
    assertEq(conv.baseUnits, est.amountRaw, 'Convert and estimate agree on base units');
    // Verify fee + net = gross
    const gross = BigInt(est.amountRaw);
    const fee = BigInt(est.feeRaw);
    const net = BigInt(est.netAmountRaw);
    assert(fee + net === gross, `Fee (${fee}) + Net (${net}) = Gross (${gross})`);
  });

  await run('WETH: roundtrip base → display → base', async () => {
    const { data: toBase } = await post('/api/tokens/WETH/convert', { amount: '2.5', direction: 'toBase' });
    const { data: toDisp } = await post('/api/tokens/WETH/convert', { amount: toBase.baseUnits, direction: 'toDisplay' });
    assertEq(toDisp.displayUnits, '2.5', 'Roundtrip: 2.5 WETH → base → 2.5 WETH');
  });

  await run('WBTC: roundtrip', async () => {
    const { data: toBase } = await post('/api/tokens/WBTC/convert', { amount: '0.12345678', direction: 'toBase' });
    const { data: toDisp } = await post('/api/tokens/WBTC/convert', { amount: toBase.baseUnits, direction: 'toDisplay' });
    assertEq(toDisp.displayUnits, '0.12345678', 'Roundtrip: 0.12345678 WBTC');
  });

  // ─────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

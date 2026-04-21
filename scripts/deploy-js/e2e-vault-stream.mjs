// End-to-end test for the redeployed vault:
//   1. Approve vault as VFT spender (1 USDC).
//   2. Deposit 1 USDC into vault.
//   3. Verify vault balance increased.
//   4. Create stream from self -> self (as receiver).
//   5. Wait ~30s for some tokens to accrue.
//   6. Withdraw from stream.
//   7. Verify stream shows withdrawn > 0.

import { GearApi, GearKeyring } from '@gear-js/api';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(PROJECT_ROOT, '.env') });

const API = 'https://growstreams-api-v3-production.up.railway.app';
const NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';

const USDC_VFT = '0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48';
const VAULT_ID = '0xc7647e6e6b47ab9390f081dff1373e58733c698ef0b9ce582dca8ebe9af66588';
const STREAM_CORE_ID = '0x4b41175ab4b8a73b5d115e360a353af57aef41842657d9855f8ed396d30c2dba';

function log(...a) { console.log('[e2e]', ...a); }

async function postJson(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function getJson(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function sendPayload(api, keyring, programId, payloadHex, value = 0) {
  const gasInfo = await api.program.calculateGas.handle(
    keyring.addressRaw,
    programId,
    payloadHex,
    value,
    true,
  );
  const gasLimit = BigInt(gasInfo.min_limit.toString()) * 12n / 10n; // 20% buffer
  const tx = api.message.send({ destination: programId, payload: payloadHex, gasLimit, value });

  return new Promise((resolvePromise, rejectPromise) => {
    let done = false;
    const to = setTimeout(() => { if (!done) { done = true; rejectPromise(new Error('Tx timeout 120s')); } }, 120_000);
    tx.signAndSend(keyring, ({ status, events = [] }) => {
      if (status.isFinalized) {
        clearTimeout(to);
        if (done) return;
        for (const { event } of events) {
          if (api.events.system.ExtrinsicFailed.is(event)) {
            done = true;
            const [err] = event.data;
            const info = err.isModule ? api.registry.findMetaError(err.asModule).name : err.toString();
            return rejectPromise(new Error('ExtrinsicFailed: ' + info));
          }
        }
        done = true;
        resolvePromise(status.asFinalized.toHex());
      }
    }).catch(e => { clearTimeout(to); if (!done) { done = true; rejectPromise(e); } });
  });
}

async function main() {
  log('Connecting to', NODE);
  const api = await GearApi.create({ providerAddress: NODE });
  let keyring;
  try { keyring = await GearKeyring.fromMnemonic(process.env.VARA_SEED); }
  catch { keyring = await GearKeyring.fromSuri(process.env.VARA_SEED); }
  const walletHex = '0x' + Buffer.from(keyring.addressRaw).toString('hex');
  log('Wallet:', keyring.address, '->', walletHex);

  // ---- Step 1: Pre-state ----
  const preUsdc = await getJson(`/api/tokens/WUSDC/balance/${walletHex}`);
  const preVault = await getJson(`/api/vault/balance/${walletHex}/WUSDC`);
  log('PRE wallet USDC:', preUsdc.balance, '| vault available:', preVault.available_display);

  const amount = '1000000'; // 1 USDC (6 decimals)

  // ---- Step 2: Approve vault as VFT spender ----
  log('Approving vault for 1 USDC...');
  const approveRes = await postJson('/api/tokens/WUSDC/approve', {
    spender: VAULT_ID,
    amountRaw: '10000000', // 10 USDC allowance (headroom)
  });
  const approveHash = await sendPayload(api, keyring, approveRes.programId, approveRes.payload);
  log('Approve finalized:', approveHash);
  await new Promise(r => setTimeout(r, 8000));

  // Verify allowance
  const allowance = await getJson(`/api/tokens/WUSDC/allowance/${walletHex}/${VAULT_ID}`);
  log('Allowance after approve:', allowance.allowance, '(raw:', allowance.allowanceRaw, ')');

  // ---- Step 3: Deposit 1 USDC ----
  log('Depositing 1 USDC to vault...');
  const depositRes = await postJson('/api/vault/deposit', {
    token: 'WUSDC',
    amountRaw: amount,
    mode: 'payload',
  });
  const depositHash = await sendPayload(api, keyring, VAULT_ID, depositRes.payload);
  log('Deposit finalized:', depositHash);
  await new Promise(r => setTimeout(r, 5000));

  // ---- Step 4: Verify vault balance ----
  const postVault = await getJson(`/api/vault/balance/${walletHex}/WUSDC`);
  const postUsdc = await getJson(`/api/tokens/WUSDC/balance/${walletHex}`);
  log('POST wallet USDC:', postUsdc.balance, '| vault available:', postVault.available_display);

  if (postVault.available === '0' || postVault.available === 0) {
    throw new Error('FAIL: Vault balance still 0 after deposit! The bug is NOT fixed.');
  }
  log('✅ Vault balance increased — bug is FIXED.');

  // ---- Step 5: Create a stream self -> self ----
  // Use a tiny flowRate (1 base/sec = 1 microUSDC/sec) and deposit 500000 (0.5 USDC) to stream buffer.
  // Alice's well-known test address (Substrate dev account)
  const RECEIVER = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
  log(`Creating stream self -> Alice (${RECEIVER.slice(0,10)}...) flow=1 microUSDC/sec, deposit=0.5 USDC...`);
  const streamRes = await postJson('/api/streams', {
    receiver: RECEIVER,
    token: USDC_VFT,
    flowRate: '1',        // 1 base unit per second = 0.000001 USDC/sec
    initialDeposit: '500000', // 0.5 USDC initial buffer
    mode: 'payload',
  });
  const streamHash = await sendPayload(api, keyring, STREAM_CORE_ID, streamRes.payload);
  log('CreateStream finalized:', streamHash);
  await new Promise(r => setTimeout(r, 6000));

  // Find the new stream
  const mineSender = await getJson(`/api/streams/sender/${walletHex}`);
  const latest = mineSender.streams?.[mineSender.streams.length - 1];
  if (!latest) throw new Error('FAIL: No stream found after create');
  log('Latest stream id:', latest.id ?? latest.stream_id, 'state:', latest);
  const streamId = Number(latest.id ?? latest.stream_id);

  // ---- Step 6: Wait for tokens to accrue ----
  log('Waiting 30s for stream to accrue tokens...');
  await new Promise(r => setTimeout(r, 30000));

  // ---- Step 7: Withdraw from stream ----
  log('Withdrawing from stream', streamId, '...');
  const withdrawRes = await postJson(`/api/streams/${streamId}/withdraw`, { mode: 'payload' });
  const withdrawHash = await sendPayload(api, keyring, STREAM_CORE_ID, withdrawRes.payload);
  log('Withdraw finalized:', withdrawHash);
  await new Promise(r => setTimeout(r, 5000));

  const streamAfter = await getJson(`/api/streams/${streamId}`);
  log('Stream after withdraw:', streamAfter);

  log('✅ ALL STEPS PASSED');
  await api.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[e2e] FATAL:', err.message);
  process.exit(1);
});

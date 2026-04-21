// Full end-to-end: derive receiver sub-wallet, fund it with gas,
// create a stream A -> B, then B withdraws.
import { GearApi, GearKeyring } from '@gear-js/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
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

function log(...a) { console.log('[e2e-full]', ...a); }

async function postJson(path, body) {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
async function getJson(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function sendPayload(api, keyring, programId, payloadHex, value = 0) {
  const gasInfo = await api.program.calculateGas.handle(keyring.addressRaw, programId, payloadHex, value, true);
  const gasLimit = BigInt(gasInfo.min_limit.toString()) * 12n / 10n;
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

async function transferVara(api, from, toAddress, amountPlanck) {
  const tx = api.tx.balances.transferKeepAlive(toAddress, amountPlanck);
  return new Promise((resolvePromise, rejectPromise) => {
    let done = false;
    const to = setTimeout(() => { if (!done) { done = true; rejectPromise(new Error('Transfer timeout 90s')); } }, 90_000);
    tx.signAndSend(from, ({ status, events = [] }) => {
      if (status.isFinalized) {
        clearTimeout(to);
        if (done) return;
        for (const { event } of events) {
          if (api.events.system.ExtrinsicFailed.is(event)) {
            done = true;
            const [err] = event.data;
            const info = err.isModule ? api.registry.findMetaError(err.asModule).name : err.toString();
            return rejectPromise(new Error('Transfer failed: ' + info));
          }
        }
        done = true;
        resolvePromise(status.asFinalized.toHex());
      }
    }).catch(e => { clearTimeout(to); if (!done) { done = true; rejectPromise(e); } });
  });
}

async function main() {
  await cryptoWaitReady();
  log('Connecting to', NODE);
  const api = await GearApi.create({ providerAddress: NODE });

  // Parent wallet (sender)
  let sender;
  try { sender = await GearKeyring.fromMnemonic(process.env.VARA_SEED); }
  catch { sender = await GearKeyring.fromSuri(process.env.VARA_SEED); }
  const senderHex = '0x' + Buffer.from(sender.addressRaw).toString('hex');
  log('Sender:', sender.address);

  // Derived receiver wallet via SURI soft-derivation //receiver2
  const kr = new Keyring({ type: 'sr25519', ss58Format: 137 });
  const receiver = kr.addFromUri(process.env.VARA_SEED + '//receiver2');
  const receiverHex = '0x' + Buffer.from(receiver.addressRaw).toString('hex');
  log('Receiver:', receiver.address, '->', receiverHex);

  // Fund receiver with 2 VARA (gas)
  const recvAcct = await api.query.system.account(receiver.address);
  const recvFree = BigInt(recvAcct.data.free.toString());
  log('Receiver VARA:', Number(recvFree) / 1e12);
  if (recvFree < 2_000_000_000_000n) {
    log('Funding receiver with 3 VARA...');
    const h = await transferVara(api, sender, receiver.address, 3_000_000_000_000n);
    log('Fund tx:', h);
    await new Promise(r => setTimeout(r, 4000));
  }

  // Confirm sender has a stream to this receiver; if not, create it.
  const existing = await getJson(`/api/streams/sender/${senderHex}`).catch(() => ({ streamIds: [] }));
  let streamId = null;
  for (const id of existing.streamIds ?? []) {
    const s = await getJson(`/api/streams/${id}`).catch(() => null);
    if (s && s.receiver?.toLowerCase() === receiverHex.toLowerCase() && s.status === 'Active') {
      streamId = Number(id);
      log('Reusing existing active stream:', streamId);
      break;
    }
  }

  if (streamId == null) {
    // Make sure vault has funds first
    const vb = await getJson(`/api/vault/balance/${senderHex}/WUSDC`);
    log('Vault available:', vb.available_display, 'USDC');
    if (Number(vb.available) < 500_000) {
      throw new Error('Vault needs at least 0.5 USDC; deposit more first.');
    }

    log('Creating stream sender -> receiver (flow=0.000001 USDC/sec, deposit=0.3 USDC)...');
    // NB: backend interprets values as base units (raw) when fields end in Raw;
    // use /api/streams with raw string amounts
    const streamRes = await postJson('/api/streams', {
      receiver: receiverHex,
      token: USDC_VFT,
      flowRate: '1',         // 1 base / sec
      initialDeposit: '300000', // 0.3 USDC
      mode: 'payload',
    });
    const h = await sendPayload(api, sender, STREAM_CORE_ID, streamRes.payload);
    log('CreateStream finalized:', h);
    await new Promise(r => setTimeout(r, 8000));

    const listAfter = await getJson(`/api/streams/sender/${senderHex}`);
    for (const id of listAfter.streamIds ?? []) {
      const s = await getJson(`/api/streams/${id}`).catch(() => null);
      if (s && s.receiver?.toLowerCase() === receiverHex.toLowerCase() && s.status === 'Active') {
        streamId = Number(id);
        break;
      }
    }
    if (streamId == null) throw new Error('Could not find newly created stream');
    log('Created stream id:', streamId);
  }

  // Wait for some accrual
  log('Waiting 20s for stream to accrue...');
  await new Promise(r => setTimeout(r, 20000));

  const pre = await getJson(`/api/streams/${streamId}`);
  log('Stream PRE withdraw:', { deposited: pre.deposited, withdrawn: pre.withdrawn, streamed: pre.streamed });

  const preUsdc = await getJson(`/api/tokens/WUSDC/balance/${receiverHex}`);
  log('Receiver USDC PRE:', preUsdc.balance);

  // Build withdraw payload and sign WITH THE RECEIVER keyring
  log('Receiver signing withdraw for stream', streamId, '...');
  const wres = await postJson(`/api/streams/${streamId}/withdraw`, { mode: 'payload' });
  const wh = await sendPayload(api, receiver, STREAM_CORE_ID, wres.payload);
  log('Withdraw finalized:', wh);
  await new Promise(r => setTimeout(r, 8000));

  const post = await getJson(`/api/streams/${streamId}`);
  log('Stream POST withdraw:', { deposited: post.deposited, withdrawn: post.withdrawn, streamed: post.streamed });

  const postUsdc = await getJson(`/api/tokens/WUSDC/balance/${receiverHex}`);
  log('Receiver USDC POST:', postUsdc.balance);

  if (BigInt(post.withdrawn) > BigInt(pre.withdrawn)) {
    log('✅ WITHDRAW WORKS — withdrawn increased by', (BigInt(post.withdrawn) - BigInt(pre.withdrawn)).toString(), 'base units');
    log('✅ FULL FLOW VERIFIED: approve -> deposit -> stream -> withdraw');
  } else {
    log('⚠️  withdrawn did not increase on chain.');
  }

  await api.disconnect();
  process.exit(0);
}

main().catch(err => { console.error('[e2e-full] FATAL:', err.message); process.exit(1); });

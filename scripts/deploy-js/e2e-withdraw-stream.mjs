// Test withdraw from existing stream 3.
import { GearApi, GearKeyring } from '@gear-js/api';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(PROJECT_ROOT, '.env') });

const API = 'https://growstreams-api-v3-production.up.railway.app';
const NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const STREAM_CORE_ID = '0x4b41175ab4b8a73b5d115e360a353af57aef41842657d9855f8ed396d30c2dba';
const STREAM_ID = 3;

function log(...a) { console.log('[e2e-withdraw]', ...a); }

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

async function main() {
  log('Connecting to', NODE);
  const api = await GearApi.create({ providerAddress: NODE });
  let keyring;
  try { keyring = await GearKeyring.fromMnemonic(process.env.VARA_SEED); }
  catch { keyring = await GearKeyring.fromSuri(process.env.VARA_SEED); }
  log('Wallet:', keyring.address);

  const pre = await getJson(`/api/streams/${STREAM_ID}`);
  log('Stream PRE:', { deposited: pre.deposited, withdrawn: pre.withdrawn, streamed: pre.streamed, status: pre.status });

  // Receiver's USDC balance pre-withdraw
  const preBal = await getJson(`/api/tokens/WUSDC/balance/${pre.receiver}`);
  log('Receiver (Alice) USDC pre:', preBal.balance);

  log('Submitting withdraw for stream', STREAM_ID, '...');
  const withdrawRes = await postJson(`/api/streams/${STREAM_ID}/withdraw`, { mode: 'payload' });
  const hash = await sendPayload(api, keyring, STREAM_CORE_ID, withdrawRes.payload);
  log('Withdraw finalized:', hash);
  await new Promise(r => setTimeout(r, 8000));

  const post = await getJson(`/api/streams/${STREAM_ID}`);
  log('Stream POST:', { deposited: post.deposited, withdrawn: post.withdrawn, streamed: post.streamed, status: post.status });

  const postBal = await getJson(`/api/tokens/WUSDC/balance/${pre.receiver}`);
  log('Receiver (Alice) USDC post:', postBal.balance);

  if (Number(post.withdrawn) > Number(pre.withdrawn)) {
    log('✅ Withdraw succeeded — withdrawn increased by', Number(post.withdrawn) - Number(pre.withdrawn), 'base units');
  } else {
    log('⚠️  withdrawn did not increase.');
  }

  await api.disconnect();
  process.exit(0);
}

main().catch(err => { console.error('[e2e-withdraw] FATAL:', err.message); process.exit(1); });

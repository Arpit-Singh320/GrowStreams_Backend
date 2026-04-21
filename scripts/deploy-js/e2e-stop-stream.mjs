// Verify stop_stream releases unused buffer back to sender's vault available balance.
import { GearApi, GearKeyring } from '@gear-js/api';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

const API = 'https://growstreams-api-v3-production.up.railway.app';
const NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const STREAM_CORE_ID = '0x0998ba27a7b2a0d8a383dc23054164bac1fc2e4b64694f0d7ec4db3bd6265957';
const SENDER_HEX = '0x868111d85b4c429dbf5f2d54111c580cd9bc12a53ac377760d89bfe2813e7410';
const STREAM_ID = 1;

async function postJson(p, b) { const r = await fetch(API+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}); if(!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`); return r.json(); }
async function getJson(p) { const r = await fetch(API+p); if(!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`); return r.json(); }

async function sendPayload(api, kp, dest, payload) {
  const gi = await api.program.calculateGas.handle(kp.addressRaw, dest, payload, 0, true);
  const tx = api.message.send({ destination: dest, payload, gasLimit: BigInt(gi.min_limit.toString())*12n/10n, value: 0 });
  return new Promise((res,rej)=>{ let d=false; const t=setTimeout(()=>{if(!d){d=true;rej(new Error('timeout'));}},120_000);
    tx.signAndSend(kp, ({status,events=[]})=>{ if(status.isFinalized){clearTimeout(t); if(d) return;
      for (const {event} of events) { if (api.events.system.ExtrinsicFailed.is(event)) { d=true; const [e]=event.data; const info=e.isModule?api.registry.findMetaError(e.asModule).name:e.toString(); return rej(new Error('ExtrinsicFailed: '+info)); } }
      d=true; res(status.asFinalized.toHex()); }}).catch(e=>{clearTimeout(t); if(!d){d=true;rej(e);}});
  });
}

async function main() {
  const api = await GearApi.create({ providerAddress: NODE });
  let sender; try { sender = await GearKeyring.fromMnemonic(process.env.VARA_SEED); } catch { sender = await GearKeyring.fromSuri(process.env.VARA_SEED); }
  console.log('Sender:', sender.address);

  const pre = await getJson(`/api/streams/${STREAM_ID}`);
  const preVault = await getJson(`/api/vault/balance/${SENDER_HEX}/WUSDC`);
  console.log('PRE:  stream.deposited:', pre.deposited, '| stream.streamed:', pre.streamed, '| vault.available:', preVault.available, '| vault.allocated:', preVault.total_allocated);

  console.log('Submitting stop_stream...');
  const stopRes = await postJson(`/api/streams/${STREAM_ID}/stop`, { mode: 'payload' });
  const h = await sendPayload(api, sender, STREAM_CORE_ID, stopRes.payload);
  console.log('Stop finalized:', h);
  await new Promise(r => setTimeout(r, 8000));

  const post = await getJson(`/api/streams/${STREAM_ID}`);
  const postVault = await getJson(`/api/vault/balance/${SENDER_HEX}/WUSDC`);
  console.log('POST: stream.status:', post.status, '| stream.streamed:', post.streamed, '| vault.available:', postVault.available, '| vault.allocated:', postVault.total_allocated);

  const releasedAmount = BigInt(postVault.available) - BigInt(preVault.available);
  const allocationReduced = BigInt(preVault.total_allocated) - BigInt(postVault.total_allocated);
  console.log('Released back to vault.available:', releasedAmount.toString(), 'base units');
  console.log('Allocation reduced by:', allocationReduced.toString(), 'base units');

  if (post.status === 'Stopped' && releasedAmount > 0n && releasedAmount === allocationReduced) {
    console.log('\u2705 stop_stream released unused buffer back to sender\'s vault balance');
  } else if (post.status === 'Stopped') {
    console.log('\u26a0\ufe0f  Stream stopped but release accounting looks off');
  } else {
    console.log('\u274c Stream did not reach Stopped status');
  }

  await api.disconnect(); process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

// Verify raw:true path works end-to-end (matches what the fixed frontend sends).
import { GearApi, GearKeyring, decodeAddress } from '@gear-js/api';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

const BACKEND = 'https://growstreams-api-v3-production.up.railway.app';
const NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const STREAM_CORE_ID = '0x0998ba27a7b2a0d8a383dc23054164bac1fc2e4b64694f0d7ec4db3bd6265957';
const RECEIVER = 'kGjPM6Ba9K2wtFQXkdycSGZdtCxN12rCKAY863UaMPp9d5oxy';

const api = await GearApi.create({ providerAddress: NODE });
let kp; try { kp = await GearKeyring.fromMnemonic(process.env.VARA_SEED); } catch { kp = await GearKeyring.fromSuri(process.env.VARA_SEED); }

const receiverHex = decodeAddress(RECEIVER);
console.log('Signer:', kp.address);
console.log('Receiver:', receiverHex);

// Exactly what the fixed frontend sends: raw:true + pre-converted base units
const body = {
  receiver: receiverHex,
  token: '0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48',
  flowRate: '100',        // 100 raw/sec = 0.0001 USDC/sec (frontend pre-converted)
  initialDeposit: '1000000', // 1 USDC in base units
  mode: 'payload',
  raw: true,
};
console.log('Body:', body);
const res = await (await fetch(BACKEND + '/api/streams', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) })).json();
console.log('Resolved:', res.resolved);

const gas = await api.program.calculateGas.handle(kp.addressRaw, STREAM_CORE_ID, res.payload, 0, true);
console.log('Gas min_limit:', gas.min_limit.toString());

const gasLimit = BigInt(gas.min_limit.toString()) * 6n / 5n;
const tx = api.message.send({ destination: STREAM_CORE_ID, payload: res.payload, gasLimit, value: 0 });
const hash = await new Promise((resolve, reject) => {
  let done = false;
  setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); } }, 120_000);
  tx.signAndSend(kp, ({ status, events = [] }) => {
    if (status.isFinalized) {
      if (done) return; done = true;
      for (const { event } of events) {
        if (api.events.system.ExtrinsicFailed.is(event)) {
          const [err] = event.data;
          const info = err.isModule ? api.registry.findMetaError(err.asModule).name : err.toString();
          return reject(new Error('ExtrinsicFailed: ' + info));
        }
      }
      resolve(status.asFinalized.toHex());
    }
  }).catch(e => { if (!done) { done = true; reject(e); } });
});
console.log('Tx finalized:', hash);
console.log('\u2705 raw:true flow works end-to-end \u2014 frontend fix verified');
await api.disconnect();

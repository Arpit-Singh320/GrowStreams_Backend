// Actually send the create-stream tx to verify the flow works live right now.
import { GearApi, GearKeyring, decodeAddress } from '@gear-js/api';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

const BACKEND = 'https://growstreams-api-v3-production.up.railway.app';
const NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const STREAM_CORE_ID = '0x0998ba27a7b2a0d8a383dc23054164bac1fc2e4b64694f0d7ec4db3bd6265957';
const RECEIVER_SS58 = 'kGjPM6Ba9K2wtFQXkdycSGZdtCxN12rCKAY863UaMPp9d5oxy';

const api = await GearApi.create({ providerAddress: NODE });
let kp; try { kp = await GearKeyring.fromMnemonic(process.env.VARA_SEED); } catch { kp = await GearKeyring.fromSuri(process.env.VARA_SEED); }
console.log('Signer:', kp.address, '=', '0x' + Buffer.from(kp.addressRaw).toString('hex'));

const receiverHex = decodeAddress(RECEIVER_SS58);
console.log('Receiver hex:', receiverHex);

const res = await (await fetch(BACKEND + '/api/streams', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({
  receiver: receiverHex, token: '0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48',
  flowRate: '0.0001', initialDeposit: '1', mode: 'payload',
}) })).json();
console.log('Resolved:', res.resolved);

const gas = await api.program.calculateGas.handle(kp.addressRaw, STREAM_CORE_ID, res.payload, 0, true);
console.log('Gas:', gas.min_limit.toString());
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
await api.disconnect();

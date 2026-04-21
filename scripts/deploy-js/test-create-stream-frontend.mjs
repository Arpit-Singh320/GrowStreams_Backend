// Reproduce the exact frontend scenario: flowRate 0.0001, initialDeposit 1, receiver = Alice
import { GearApi, GearKeyring, decodeAddress } from '@gear-js/api';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

const API = 'https://growstreams-api-v3-production.up.railway.app';
const NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const STREAM_CORE_ID = '0x0998ba27a7b2a0d8a383dc23054164bac1fc2e4b64694f0d7ec4db3bd6265957';
const RECEIVER_SS58 = 'kGjPM6Ba9K2wtFQXkdycSGZdtCxN12rCKAY863UaMPp9d5oxy'; // user's input
async function p(path, body){const r=await fetch(API+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`); return r.json();}

const api = await GearApi.create({ providerAddress: NODE });
let kp; try { kp = await GearKeyring.fromMnemonic(process.env.VARA_SEED); } catch { kp = await GearKeyring.fromSuri(process.env.VARA_SEED); }
console.log('Sender:', kp.address);
console.log('Receiver SS58:', RECEIVER_SS58);
const rhex = '0x' + Buffer.from(decodeAddress(RECEIVER_SS58)).toString('hex');
console.log('Receiver hex:', rhex);

const res = await p('/api/streams', {
  receiver: RECEIVER_SS58,
  token: 'WUSDC',
  flowRate: '0.0001',
  initialDeposit: '1',
  mode: 'payload',
});
console.log('Backend payload len:', res.payload.length);
console.log('Resolved:', res.resolved);

// Calculate gas to see the actual panic/success
try {
  const gi = await api.program.calculateGas.handle(kp.addressRaw, STREAM_CORE_ID, res.payload, 0, true);
  console.log('Gas min_limit:', gi.min_limit.toString());
  console.log('Would reserve:', gi.reserved?.toString(), 'burned:', gi.burned?.toString());
  console.log('Success! Dry-run passed.');
} catch (e) {
  console.error('Dry-run failed:', e.message);
}

await api.disconnect();

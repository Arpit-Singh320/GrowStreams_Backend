// Replicate exactly what the frontend does
import { GearApi, GearKeyring, decodeAddress } from '@gear-js/api';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

const API = 'https://growstreams-v3.vercel.app/api'; // what frontend uses? check NEXT_PUBLIC
const BACKEND = 'https://growstreams-api-v3-production.up.railway.app';
const NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const STREAM_CORE_ID = '0x0998ba27a7b2a0d8a383dc23054164bac1fc2e4b64694f0d7ec4db3bd6265957';
const RECEIVER_SS58 = 'kGjPM6Ba9K2wtFQXkdycSGZdtCxN12rCKAY863UaMPp9d5oxy';

function toHex(address) {
  if (address.startsWith('0x') && address.length === 66) return address;
  try { return decodeAddress(address); } catch { return address; }
}

const api = await GearApi.create({ providerAddress: NODE });
let kp; try { kp = await GearKeyring.fromMnemonic(process.env.VARA_SEED); } catch { kp = await GearKeyring.fromSuri(process.env.VARA_SEED); }
console.log('Signer (decodedAddress):', '0x' + Buffer.from(kp.addressRaw).toString('hex'));

const receiverHex = toHex(RECEIVER_SS58);
console.log('toHex(receiver):', receiverHex, 'type:', typeof receiverHex);

const body = {
  receiver: receiverHex,
  token: toHex('0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48'),
  flowRate: '0.0001',
  initialDeposit: '1',
  mode: 'payload',
};
console.log('Body:', JSON.stringify(body));

const res = await (await fetch(BACKEND + '/api/streams', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) })).json();
console.log('Backend returned:', res.resolved);
console.log('Payload len:', res.payload?.length);

// calculateGas exactly like frontend
try {
  const gas = await api.program.calculateGas.handle(
    '0x' + Buffer.from(kp.addressRaw).toString('hex'),
    STREAM_CORE_ID,
    res.payload,
    0,
    true,
  );
  console.log('Gas min_limit:', gas.min_limit.toString());
  const gasLimit = (BigInt(gas.min_limit.toString()) * 6n / 5n).toString();
  console.log('GasLimit (1.2x):', gasLimit);
  console.log('Dry-run PASSED');
} catch (e) {
  console.error('Dry-run FAILED:', e.message);
}

await api.disconnect();

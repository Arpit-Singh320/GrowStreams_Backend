// Query stream-core GetConfig and decode with full Config type (including token_vault)
import { GearApi, GearKeyring } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

const NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const STREAM_CORE_ID = '0x0998ba27a7b2a0d8a383dc23054164bac1fc2e4b64694f0d7ec4db3bd6265957';

function compactU32(n) {
  if (n < 64) return Buffer.from([n << 2]);
  if (n < 16384) { const v=(n<<2)|1; return Buffer.from([v&0xff, (v>>8)&0xff]); }
  const v=(n<<2)|2; return Buffer.from([v&0xff,(v>>8)&0xff,(v>>16)&0xff,(v>>24)&0xff]);
}
function encStr(s){ const b=Buffer.from(s,'utf-8'); return Buffer.concat([compactU32(b.length),b]); }

const api = await GearApi.create({ providerAddress: NODE });
let kp; try { kp = await GearKeyring.fromMnemonic(process.env.VARA_SEED); } catch { kp = await GearKeyring.fromSuri(process.env.VARA_SEED); }

const payload = '0x' + Buffer.concat([encStr('StreamService'), encStr('GetConfig')]).toString('hex');

const reply = await api.message.calculateReply({
  origin: kp.addressRaw,
  destination: STREAM_CORE_ID,
  payload,
  gasLimit: 50_000_000_000n,
  value: 0,
});

const raw = reply.payload.toU8a(true); // strip compact length prefix
console.log('Raw reply hex:', '0x' + Buffer.from(raw).toString('hex'));
console.log('Raw length:', raw.length);

// Decode: SCALE(service: String) + SCALE(method: String) + Config { admin, min_buffer_seconds, next_stream_id, token_vault }
const reg = new TypeRegistry();
const input = Buffer.from(raw);
let off = 0;

// read compact-length string
function readStr(buf, o) {
  let len; const b0 = buf[o]; const mode = b0 & 0x03;
  if (mode === 0) { len = b0 >> 2; o += 1; }
  else if (mode === 1) { len = ((buf[o] | (buf[o+1]<<8)) >> 2); o += 2; }
  else { len = ((buf[o] | (buf[o+1]<<8) | (buf[o+2]<<16) | (buf[o+3]<<24)) >>> 2); o += 4; }
  const s = buf.slice(o, o+len).toString('utf-8');
  return { value: s, offset: o + len };
}
const svc = readStr(input, off); off = svc.offset;
const mth = readStr(input, off); off = mth.offset;
console.log('Service:', svc.value, '| Method:', mth.value);

// admin: 32 bytes, min_buffer_seconds: u64 (8 bytes LE), next_stream_id: u64 (8 bytes LE), token_vault: 32 bytes
const admin = '0x' + input.slice(off, off+32).toString('hex'); off += 32;
const minBuf = input.readBigUInt64LE(off); off += 8;
const nextId = input.readBigUInt64LE(off); off += 8;
const tokenVault = '0x' + input.slice(off, off+32).toString('hex'); off += 32;
console.log('admin:', admin);
console.log('min_buffer_seconds:', minBuf.toString());
console.log('next_stream_id:', nextId.toString());
console.log('token_vault:', tokenVault);
console.log('remaining bytes:', input.length - off);

await api.disconnect();

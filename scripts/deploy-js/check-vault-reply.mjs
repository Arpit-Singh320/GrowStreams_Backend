// Simulate vault.AllocateToStream call from stream-core and inspect the raw reply.
import { GearApi, GearKeyring } from '@gear-js/api';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

const NODE = process.env.VARA_NODE || 'wss://testnet.vara.network';
const STREAM_CORE_ID = '0x0998ba27a7b2a0d8a383dc23054164bac1fc2e4b64694f0d7ec4db3bd6265957';
const VAULT_ID = '0xc7647e6e6b47ab9390f081dff1373e58733c698ef0b9ce582dca8ebe9af66588';
const USDC_VFT = '0x9f332e61589e0850dce6d8e6070ea5618de33d9f134a4a35d6d1164dc9002f48';
const SENDER = '0x868111d85b4c429dbf5f2d54111c580cd9bc12a53ac377760d89bfe2813e7410';

function cU32(n){ if(n<64) return Buffer.from([n<<2]); if(n<16384){const v=(n<<2)|1;return Buffer.from([v&0xff,(v>>8)&0xff]);} const v=(n<<2)|2; return Buffer.from([v&0xff,(v>>8)&0xff,(v>>16)&0xff,(v>>24)&0xff]); }
function eS(s){ const b=Buffer.from(s,'utf-8'); return Buffer.concat([cU32(b.length),b]); }
function eA(h){ const c=h.startsWith('0x')?h.slice(2):h; return Buffer.from(c.padStart(64,'0'),'hex'); }
function eU128(v){ const b=Buffer.alloc(16); let x=BigInt(v); for(let i=0;i<16;i++){b[i]=Number(x & 0xffn); x>>=8n;} return b; }
function eU64(v){ const b=Buffer.alloc(8); let x=BigInt(v); for(let i=0;i<8;i++){b[i]=Number(x & 0xffn); x>>=8n;} return b; }

const api = await GearApi.create({ providerAddress: NODE });

// Build: VaultService + AllocateToStream + (owner, token, amount, stream_id)
const payloadBuf = Buffer.concat([
  eS('VaultService'),
  eS('AllocateToStream'),
  eA(SENDER),       // owner
  eA(USDC_VFT),     // token
  eU128(1_000_000), // amount = 1 USDC
  eU64(99),         // stream_id
]);
const payload = '0x' + payloadBuf.toString('hex');
console.log('Sending payload length:', payloadBuf.length);

// Simulate call FROM stream-core
const reply = await api.message.calculateReply({
  origin: STREAM_CORE_ID,
  destination: VAULT_ID,
  payload,
  gasLimit: 50_000_000_000n,
  value: 0,
});

console.log('code:', reply.code.toHuman ? reply.code.toHuman() : reply.code.toString());
const raw = reply.payload.toU8a(true);
console.log('Raw reply hex:', '0x' + Buffer.from(raw).toString('hex'));
console.log('Raw length:', raw.length);

if (reply.code && reply.code.isSuccess) {
  console.log('Reply code: Success');
} else {
  console.log('Reply code:', reply.code.toString());
}

await api.disconnect();

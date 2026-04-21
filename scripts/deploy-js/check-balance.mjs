import { GearApi, GearKeyring } from '@gear-js/api';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') });

const api = await GearApi.create({ providerAddress: process.env.VARA_NODE || 'wss://testnet.vara.network' });
const chain = await api.chain();
console.log(`Chain: ${chain}`);

let keyring;
try { keyring = await GearKeyring.fromMnemonic(process.env.VARA_SEED); }
catch { keyring = await GearKeyring.fromSuri(process.env.VARA_SEED); }

console.log(`Address: ${keyring.address}`);
console.log(`AddressRaw: 0x${Buffer.from(keyring.addressRaw).toString('hex')}`);

const acct = await api.query.system.account(keyring.address);
const free = BigInt(acct.data.free.toString());
console.log(`Balance: ${Number(free) / 1e12} VARA (raw: ${free})`);

await api.disconnect();
process.exit(0);

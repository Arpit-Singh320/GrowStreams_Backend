import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

await cryptoWaitReady();
const kr = new Keyring({ type: 'sr25519' });
const pair = kr.addFromUri(process.env.VARA_SEED);
console.log('Relayer address:', pair.address);

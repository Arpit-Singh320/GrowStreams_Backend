// Debug: print all function keys from super-token IDL
import { Sails } from 'sails-js';
import { SailsIdlParser } from 'sails-js-parser';
import { GearApi } from '@gear-js/api';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(__dirname, '../..');
config({ path: resolve(API_ROOT, '.env') });

const VARA_NODE = process.env.VARA_NODE || 'wss://rpc.vara.network';
const SUPER_TOKEN_ID = process.env.SUPER_TOKEN_ID;

const api = await GearApi.create({ providerAddress: VARA_NODE });
const parser = await SailsIdlParser.new();
const idl = readFileSync(resolve(PROJECT_ROOT, 'contracts/super-token/super-token.idl'), 'utf-8');
const sails = new Sails(parser);
sails.parseIdl(idl);
sails.setApi(api);
sails.setProgramId(SUPER_TOKEN_ID);

const svc = sails.services['SuperTokenService'];
console.log('Service keys:', Object.keys(sails.services));
console.log('Function keys:', Object.keys(svc.functions));
console.log('Query keys:', Object.keys(svc.queries));

// Try calling AddFlowController — test what the fn returns
const fn = svc.functions['AddFlowController'];
console.log('\nfn type:', typeof fn);
console.log('fn itself:', fn);
if (fn) {
  try {
    const tx = fn('0xfbd656f8082749bc4d8949718d539b5affd76f3004857f889d73fba61013cfe4');
    console.log('tx type:', typeof tx, tx?.constructor?.name);
    console.log('tx:', tx);
  } catch (e) {
    console.error('fn() threw:', e.message);
  }
}

await api.disconnect();
process.exit(0);

#!/usr/bin/env node
/**
 * test-vara-eth-api.mjs
 *
 * Smoke-tests the Phase 4 Vara.eth client functions directly
 * (without needing the HTTP server running).
 *
 * Usage: node scripts/deploy-js/test-vara-eth-api.mjs
 */

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const envPath = existsSync(resolve(ROOT, 'api/.env')) ? resolve(ROOT, 'api/.env') : resolve(ROOT, '.env');
loadEnv({ path: envPath });

const { getEscrowInfo, getRelayerBalance, getWvaraBalance, getEscrowTokenBalance, getClaimableBalance } =
  await import('../../api/src/vara-eth-client.mjs');

const addr = process.env.ETH_ADDRESS;
console.log('=== Phase 4 Vara.eth Client Smoke Test ===\n');

const [info, relayer, wvara, tokenBal, claimable] = await Promise.all([
  getEscrowInfo(),
  getRelayerBalance(),
  getWvaraBalance(addr),
  getEscrowTokenBalance(addr),
  getClaimableBalance(addr),
]);

console.log('getEscrowInfo():', JSON.stringify(info, null, 2));
console.log('\ngetRelayerBalance():', relayer);
console.log('\ngetWvaraBalance():', wvara);
console.log('\ngetEscrowTokenBalance():', tokenBal);
console.log('\ngetClaimableBalance():', claimable);
console.log('\n=== All reads OK ===');

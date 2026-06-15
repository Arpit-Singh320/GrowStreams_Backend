#!/usr/bin/env node
/**
 * poll-and-finish.mjs
 *
 * Polls wVARA balance every 30s.
 * Once >= VARA_ETH_TOPUP (default 1 wVARA) arrives, automatically runs:
 *   1. topup-balance.mjs    — approve + executableBalanceTopUp
 *   2. init-stream-core-eth.mjs — call ABI.initialize()
 *   3. deploy-eth.mjs       — deploy StreamEscrow.sol
 *
 * Usage:
 *   node scripts/deploy-js/poll-and-finish.mjs
 *
 * Leave this running while the bridge transfer completes (~1 hour).
 */

import { createPublicClient, http } from 'viem';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const envPath = existsSync(resolve(ROOT, 'api/.env'))
  ? resolve(ROOT, 'api/.env')
  : resolve(ROOT, '.env');
loadEnv({ path: envPath });

const { VARA_ETH_RPC, VARA_ETH_CHAIN_ID, VARA_ETH_ROUTER, ETH_ADDRESS } = process.env;
const topupAmount = BigInt(process.env.VARA_ETH_TOPUP || '1000000000000');
const POLL_INTERVAL_MS = 30_000;

const hoodiChain = {
  id: parseInt(VARA_ETH_CHAIN_ID, 10),
  name: 'Vara.eth Hoodi Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [VARA_ETH_RPC] } },
};

const client = createPublicClient({ chain: hoodiChain, transport: http(VARA_ETH_RPC) });

const ROUTER_ABI = [{ type: 'function', name: 'wrappedVara', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }];
const ERC20_ABI  = [{ type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }];

const wvaraAddr = await client.readContract({ address: VARA_ETH_ROUTER, abi: ROUTER_ABI, functionName: 'wrappedVara' });
console.log('wVARA address  :', wvaraAddr);
console.log('Watching wallet:', ETH_ADDRESS);
console.log(`Need           : ${topupAmount} wVARA units (${Number(topupAmount) / 1e12} wVARA)`);
console.log('Polling every  : 30s');
console.log('');

function runScript(name) {
  const scriptPath = resolve(__dirname, name);
  console.log(`\n>>> Running ${name} ...`);
  execFileSync(process.execPath, [scriptPath], { stdio: 'inherit' });
  console.log(`<<< ${name} done\n`);
}

async function checkAndRun() {
  const balance = await client.readContract({ address: wvaraAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [ETH_ADDRESS] });
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] wVARA balance: ${balance} / ${topupAmount}`);

  if (balance >= topupAmount) {
    console.log('\n✓ wVARA arrived! Proceeding with deployment...\n');
    runScript('topup-balance.mjs');
    runScript('init-stream-core-eth.mjs');
    runScript('deploy-eth.mjs');
    console.log('\n=== Phase 3 complete ===');
    console.log('All contracts deployed. Check api/.env and deploy-state.json for addresses.');
    process.exit(0);
  }
}

await checkAndRun();
setInterval(checkAndRun, POLL_INTERVAL_MS);

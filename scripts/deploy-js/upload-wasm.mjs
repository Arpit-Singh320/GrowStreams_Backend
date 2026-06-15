#!/usr/bin/env node
/**
 * upload-wasm.mjs
 *
 * Uploads stream_core_eth.opt.wasm to Vara.eth (Hoodi) via ethexe CLI.
 * Requires ethexe binary: cargo install --git https://github.com/gear-tech/gear --bin ethexe --locked
 *
 * Usage:
 *   node scripts/deploy-js/upload-wasm.mjs
 *
 * Required .env vars:
 *   ETH_PRIVATE_KEY   — deployer private key
 *   ETH_ADDRESS       — deployer EVM address
 *   VARA_ETH_RPC      — https://hoodi-reth-rpc.gear-tech.io
 *   VARA_ETH_ROUTER   — Hoodi router contract address
 *
 * On success writes STREAM_CORE_ETH_CODE_ID to .env and deploy-state.json.
 */

import { execFileSync } from 'child_process';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const envPath = existsSync(resolve(ROOT, 'api/.env'))
  ? resolve(ROOT, 'api/.env')
  : resolve(ROOT, '.env');
loadEnv({ path: envPath });

const required = ['ETH_PRIVATE_KEY', 'ETH_ADDRESS', 'VARA_ETH_RPC', 'VARA_ETH_ROUTER'];
for (const k of required) {
  if (!process.env[k]) { console.error(`Error: ${k} not set in .env`); process.exit(1); }
}

const { ETH_PRIVATE_KEY, ETH_ADDRESS, VARA_ETH_RPC, VARA_ETH_ROUTER } = process.env;

// Check ethexe binary
let ethexePath = 'ethexe';
try {
  execFileSync('ethexe', ['--version'], { stdio: 'pipe' });
} catch {
  // Try common cargo bin paths
  const homedir = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    resolve(homedir, '.cargo/bin/ethexe.exe'),
    resolve(homedir, '.cargo/bin/ethexe'),
    'C:/Users/' + (process.env.USERNAME || '') + '/.cargo/bin/ethexe.exe',
  ];
  const found = candidates.find(p => existsSync(p));
  if (!found) {
    console.error('Error: ethexe binary not found.');
    console.error('Install: cargo install --git https://github.com/gear-tech/gear --bin ethexe --locked');
    process.exit(1);
  }
  ethexePath = found;
}

const WASM_PATH = resolve(ROOT, 'contracts/vara-eth/target/wasm32v1-none/wasm32-gear/release/stream_core_eth.opt.wasm');
if (!existsSync(WASM_PATH)) {
  console.error('Error: WASM not found at', WASM_PATH);
  console.error('Build first: cd contracts/vara-eth && cargo build --release --target wasm32v1-none');
  process.exit(1);
}

console.log('=== Upload stream-core-eth WASM to Vara.eth (Hoodi) ===');
console.log('ethexe  :', ethexePath);
console.log('WASM    :', WASM_PATH);
console.log('RPC     :', VARA_ETH_RPC);
console.log('Router  :', VARA_ETH_ROUTER);
console.log('Sender  :', ETH_ADDRESS);
console.log('');
console.log('Step 1: Import key into ethexe keyring...');

try {
  execFileSync(ethexePath, ['key', 'keyring', 'import', '--private-key', ETH_PRIVATE_KEY], { stdio: 'inherit' });
} catch {
  // May already be imported — not fatal
}

console.log('');
console.log('Step 2: Upload WASM (EIP-4844 blob tx, may take 1-2 min)...');

let uploadOutput;
try {
  uploadOutput = execFileSync(ethexePath, [
    'tx',
    '--ethereum-rpc', VARA_ETH_RPC,
    '--ethereum-router', VARA_ETH_ROUTER,
    '--sender', ETH_ADDRESS,
    'upload', WASM_PATH,
    '--watch',
  ], { encoding: 'utf8', timeout: 300_000 });
} catch (err) {
  console.error('Upload failed:', err.message);
  if (err.stdout) console.error('stdout:', err.stdout);
  if (err.stderr) console.error('stderr:', err.stderr);
  process.exit(1);
}

console.log(uploadOutput);

// Parse code_id — try multiple patterns
let codeId = '';
const patterns = [
  /code[_\s-]?id["\s:=]+(0x[a-fA-F0-9]{64})/i,
  /CodeGotValidated[^0x]*(0x[a-fA-F0-9]{64})/,
  /0x[a-fA-F0-9]{64}/,
];
for (const pat of patterns) {
  const m = uploadOutput.match(pat);
  if (m) { codeId = m[1] || m[0]; break; }
}

if (!codeId) {
  console.error('Could not parse code_id from output.');
  console.error('Set STREAM_CORE_ETH_CODE_ID manually in .env, then run: node scripts/deploy-js/create-program.mjs');
  process.exit(1);
}

console.log('');
console.log('Code ID:', codeId);

// Write to .env
let envContent = readFileSync(envPath, 'utf8');
const line = `STREAM_CORE_ETH_CODE_ID=${codeId}`;
if (/STREAM_CORE_ETH_CODE_ID=/.test(envContent)) {
  envContent = envContent.replace(/STREAM_CORE_ETH_CODE_ID=.*/, line);
} else {
  envContent += `\n${line}\n`;
}
writeFileSync(envPath, envContent);
console.log('Written STREAM_CORE_ETH_CODE_ID to .env');

// Write to deploy-state.json
const stateFile = resolve(ROOT, 'deploy-state.json');
let state = {};
try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
state['stream-core-eth'] = { ...(state['stream-core-eth'] || {}), codeId, network: 'vara-eth-hoodi', uploadedAt: new Date().toISOString() };
writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('Saved to deploy-state.json');
console.log('');
console.log('Next: node scripts/deploy-js/create-program.mjs');

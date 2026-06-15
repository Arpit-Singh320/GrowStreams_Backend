#!/usr/bin/env node
/**
 * derive-eth-key.mjs
 *
 * Derives the Ethereum private key from a BIP-39 mnemonic (MetaMask default
 * derivation path: m/44'/60'/0'/0/0) and writes ETH_PRIVATE_KEY to .env.
 *
 * Usage:
 *   node scripts/deploy-js/derive-eth-key.mjs
 *
 * Reads META_MASK_SEEDS from api/.env (or root .env).
 * Writes ETH_PRIVATE_KEY back to the same .env file.
 *
 * This script never sends the key anywhere — it runs 100% locally.
 */

import { mnemonicToAccount } from 'viem/accounts';
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

const mnemonic = process.env.META_MASK_SEEDS;
if (!mnemonic) {
  console.error('Error: META_MASK_SEEDS not set in .env');
  process.exit(1);
}

// Derive account at MetaMask default path m/44'/60'/0'/0/0 (index 0)
const account = mnemonicToAccount(mnemonic, { addressIndex: 0 });

// viem's mnemonicToAccount gives us the address but not the raw private key directly.
// Use the HDKey under the hood via @scure/bip32 + @scure/bip39 which viem already bundles.
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';

const seed = mnemonicToSeedSync(mnemonic);
const hdKey = HDKey.fromMasterSeed(seed);
const derived = hdKey.derive("m/44'/60'/0'/0/0");

if (!derived.privateKey) {
  console.error('Error: Could not derive private key.');
  process.exit(1);
}

const privateKeyHex = '0x' + Buffer.from(derived.privateKey).toString('hex');
const address = account.address;

console.log('=== Derived Ethereum account ===');
console.log('Address     :', address);
console.log('Private key : [hidden — writing to .env]');
console.log('');

// Sanity check: address should match what user put in ETH_ADDRESS
const existingAddress = process.env.ETH_ADDRESS;
if (existingAddress && existingAddress.toLowerCase() !== address.toLowerCase()) {
  console.warn(`Warning: Derived address (${address}) does not match ETH_ADDRESS in .env (${existingAddress}).`);
  console.warn('Make sure you are using the correct seed phrase for this wallet.');
  console.warn('Proceeding anyway — verify manually before deploying.');
  console.warn('');
}

// Write ETH_PRIVATE_KEY into .env (update first occurrence, add if missing)
let envContent = readFileSync(envPath, 'utf8');

// Remove any blank ETH_PRIVATE_KEY= lines and set the real value once
const keyLine = `ETH_PRIVATE_KEY=${privateKeyHex}`;

// Replace all occurrences of ETH_PRIVATE_KEY=... with the real value on first occurrence
// then remove extra blank ones
let replaced = false;
envContent = envContent
  .split('\n')
  .map(line => {
    if (line.startsWith('ETH_PRIVATE_KEY=')) {
      if (!replaced) {
        replaced = true;
        return keyLine;
      }
      return null; // remove duplicates
    }
    return line;
  })
  .filter(l => l !== null)
  .join('\n');

if (!replaced) {
  envContent += `\n${keyLine}\n`;
}

writeFileSync(envPath, envContent);
console.log(`ETH_PRIVATE_KEY written to ${envPath}`);
console.log('');
console.log('Next: node scripts/deploy-js/compile-escrow.mjs');

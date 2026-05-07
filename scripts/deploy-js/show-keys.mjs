#!/usr/bin/env node
/**
 * show-keys.mjs — Derive Ethereum and Vara addresses from the VARA_SEED mnemonic.
 *
 * Usage:
 *   node scripts/deploy-js/show-keys.mjs
 *
 * Output:
 *   - Ethereum address + private key  (use for ETH_ADDRESS / ETH_PRIVATE_KEY in .env)
 *   - Vara SS58 address               (use for ADMIN_ADDRESS in .env)
 *
 * The Ethereum key is derived via BIP-44 path m/44'/60'/0'/0/0 (MetaMask standard).
 * The Vara SS58 address uses sr25519 (Polkadot/Vara default).
 *
 * SECURITY: Never share or commit your private key.
 */

import { Wallet, HDNodeWallet } from 'ethers';
import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const mnemonic = process.env.VARA_SEED;
if (!mnemonic) {
  console.error('Error: VARA_SEED not set in .env');
  process.exit(1);
}

await cryptoWaitReady();

const ethWallet = HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");

const keyring = new Keyring({ type: 'sr25519', ss58Format: 137 });
const pair = keyring.addFromMnemonic(mnemonic);

console.log('\n=== GrowStreams Key Derivation ===\n');
console.log('Mnemonic (keep secret):');
console.log(' ', mnemonic);
console.log('');
console.log('── Ethereum (Vara.eth / Hoodi) ──');
console.log('  Address    :', ethWallet.address);
console.log('  Private Key:', ethWallet.privateKey);
console.log('');
console.log('── Vara Native (Substrate / sr25519) ──');
console.log('  SS58 Address:', pair.address);
console.log('  Public Key  :', '0x' + Buffer.from(pair.publicKey).toString('hex'));
console.log('');
console.log('Next steps:');
console.log('  1. Copy ETH Address      → ETH_ADDRESS in .env');
console.log('  2. Copy ETH Private Key  → ETH_PRIVATE_KEY in .env');
console.log('  3. Copy SS58 Address     → ADMIN_ADDRESS in .env');
console.log('  4. Fund ETH address at:    https://eth.vara.network/faucet');
console.log('  5. Fund Vara address at:   https://idea.gear-tech.io (faucet tab)');
console.log('');

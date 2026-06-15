import { createPublicClient, http } from 'viem';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const envPath = existsSync(resolve(ROOT, 'api/.env')) ? resolve(ROOT, 'api/.env') : resolve(ROOT, '.env');
loadEnv({ path: envPath });

const hoodiChain = { id: 560048, name: 'Hoodi', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://hoodi-reth-rpc.gear-tech.io'] } } };
const client = createPublicClient({ chain: hoodiChain, transport: http('https://hoodi-reth-rpc.gear-tech.io') });

const WVARA = '0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464';

// Try to read the bytecode to check for faucet/mint selectors
const code = await client.getBytecode({ address: WVARA });
const hex = code || '';

// Common faucet/mint selectors
const selectors = {
  'mint(address,uint256)':       '40c10f19',
  'faucet()':                    'de5f72fd',
  'drip(address)':               'f7888aec',
  'requestTokens()':             'a0712d68',  // actually mint(uint256)
  'deposit()':                   'd0e30db0',  // WETH-style deposit
};

console.log('wVARA bytecode length:', hex.length / 2 - 1, 'bytes');
console.log('');
console.log('Checking for function selectors:');
for (const [name, sel] of Object.entries(selectors)) {
  const found = hex.includes(sel);
  console.log(`  ${found ? '✓' : '✗'} ${name} (${sel})`);
}

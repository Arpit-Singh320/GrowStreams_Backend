import { createPublicClient, http, formatUnits } from 'viem';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const envPath = existsSync(resolve(ROOT, 'api/.env')) ? resolve(ROOT, 'api/.env') : resolve(ROOT, '.env');
loadEnv({ path: envPath });

const { VARA_ETH_RPC, VARA_ETH_CHAIN_ID, VARA_ETH_ROUTER, ETH_ADDRESS } = process.env;
const hoodiChain = { id: parseInt(VARA_ETH_CHAIN_ID), name: 'Hoodi', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [VARA_ETH_RPC] } } };
const client = createPublicClient({ chain: hoodiChain, transport: http(VARA_ETH_RPC) });

const ROUTER_ABI = [{ type: 'function', name: 'wrappedVara', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }];
const ERC20_ABI  = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals',  inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
];

const wvaraAddr = await client.readContract({ address: VARA_ETH_ROUTER, abi: ROUTER_ABI, functionName: 'wrappedVara' });
console.log('wVARA contract  :', wvaraAddr);

const [balance, decimals] = await Promise.all([
  client.readContract({ address: wvaraAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [ETH_ADDRESS] }),
  client.readContract({ address: wvaraAddr, abi: ERC20_ABI, functionName: 'decimals' }),
]);

console.log('Wallet          :', ETH_ADDRESS);
console.log('wVARA balance   :', balance.toString(), 'units');
console.log('Decimals        :', decimals);
console.log('Human readable  :', formatUnits(balance, decimals), 'wVARA');

const ethBalance = await client.getBalance({ address: ETH_ADDRESS });
console.log('ETH balance     :', formatUnits(ethBalance, 18), 'ETH');

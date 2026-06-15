#!/usr/bin/env node
/**
 * deploy-mock-token.mjs
 *
 * Deploys a minimal mintable ERC-20 "MockUSDC" on Hoodi testnet,
 * then mints 1,000,000 tokens to the deployer.
 *
 * Sets VARA_ETH_TOKEN in api/.env on success.
 *
 * Usage:
 *   node scripts/deploy-js/deploy-mock-token.mjs
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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

const { ETH_PRIVATE_KEY, VARA_ETH_RPC, VARA_ETH_CHAIN_ID } = process.env;
if (!ETH_PRIVATE_KEY || !VARA_ETH_RPC || !VARA_ETH_CHAIN_ID) {
  console.error('Missing ETH_PRIVATE_KEY / VARA_ETH_RPC / VARA_ETH_CHAIN_ID'); process.exit(1);
}

// Minimal ERC-20 with mint — compiled bytecode (solc 0.8.24, optimized)
// Source:
//   pragma solidity ^0.8.24;
//   contract MockUSDC {
//     string public name = "Mock USDC"; string public symbol = "mUSDC"; uint8 public decimals = 6;
//     uint256 public totalSupply; mapping(address=>uint256) public balanceOf;
//     mapping(address=>mapping(address=>uint256)) public allowance;
//     address public owner;
//     event Transfer(address indexed from, address indexed to, uint256 value);
//     event Approval(address indexed owner, address indexed spender, uint256 value);
//     constructor() { owner = msg.sender; }
//     function mint(address to, uint256 amount) external { require(msg.sender==owner); totalSupply+=amount; balanceOf[to]+=amount; emit Transfer(address(0),to,amount); }
//     function transfer(address to, uint256 amount) external returns (bool) { balanceOf[msg.sender]-=amount; balanceOf[to]+=amount; emit Transfer(msg.sender,to,amount); return true; }
//     function approve(address sp, uint256 amount) external returns (bool) { allowance[msg.sender][sp]=amount; emit Approval(msg.sender,sp,amount); return true; }
//     function transferFrom(address from, address to, uint256 amount) external returns (bool) { allowance[from][msg.sender]-=amount; balanceOf[from]-=amount; balanceOf[to]+=amount; emit Transfer(from,to,amount); return true; }
//   }

// Use solc to compile at runtime rather than hardcoding bytecode
import solc from 'solc';

const SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public owner;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor() { owner = msg.sender; }
    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}`;

console.log('Compiling MockUSDC...');
const input = { language: 'Solidity', sources: { 'MockUSDC.sol': { content: SOURCE } }, settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } } };
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const contract = output.contracts['MockUSDC.sol']['MockUSDC'];
if (!contract) { console.error('Compilation failed:', JSON.stringify(output.errors, null, 2)); process.exit(1); }

const MOCK_ABI = contract.abi;
const MOCK_BYTECODE = '0x' + contract.evm.bytecode.object;
console.log('Compiled. Bytecode size:', MOCK_BYTECODE.length / 2 - 1, 'bytes');

const hoodiChain = {
  id: parseInt(VARA_ETH_CHAIN_ID, 10),
  name: 'Vara.eth Hoodi Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [VARA_ETH_RPC] } },
};

const account = privateKeyToAccount(ETH_PRIVATE_KEY.startsWith('0x') ? ETH_PRIVATE_KEY : `0x${ETH_PRIVATE_KEY}`);
const publicClient = createPublicClient({ chain: hoodiChain, transport: http(VARA_ETH_RPC) });
const walletClient = createWalletClient({ account, chain: hoodiChain, transport: http(VARA_ETH_RPC) });

console.log('Deploying MockUSDC to Hoodi...');
const deployHash = await walletClient.deployContract({ abi: MOCK_ABI, bytecode: MOCK_BYTECODE, args: [] });
console.log('Deploy tx:', deployHash);
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const tokenAddr = deployReceipt.contractAddress;
if (!tokenAddr) { console.error('Deploy failed - no contractAddress in receipt'); process.exit(1); }
console.log('MockUSDC deployed:', tokenAddr);

// Mint 1,000,000 mUSDC (6 decimals = 1_000_000_000_000 units) to deployer
const MINT_AMOUNT = 1_000_000n * 10n ** 6n;
console.log('Minting', (MINT_AMOUNT / 10n ** 6n).toString(), 'mUSDC to', account.address, '...');
const mintHash = await walletClient.writeContract({
  address: tokenAddr, abi: MOCK_ABI, functionName: 'mint',
  args: [account.address, MINT_AMOUNT],
});
await publicClient.waitForTransactionReceipt({ hash: mintHash });
console.log('Minted. Mint tx:', mintHash);

// Write VARA_ETH_TOKEN to .env
let envContent = readFileSync(envPath, 'utf8');
const line = `VARA_ETH_TOKEN=${tokenAddr}`;
if (/^VARA_ETH_TOKEN=/m.test(envContent)) {
  envContent = envContent.replace(/^VARA_ETH_TOKEN=.*/m, line);
} else {
  envContent += `\n${line}\n`;
}
writeFileSync(envPath, envContent);
console.log('Written VARA_ETH_TOKEN to .env');

// Save to deploy-state.json
const stateFile = resolve(ROOT, 'deploy-state.json');
let state = {};
try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
state['mock-usdc'] = { address: tokenAddr, network: 'vara-eth-hoodi', deployedAt: new Date().toISOString(), deployTxHash: deployHash };
writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('Saved to deploy-state.json');
console.log('');
console.log('Next: node scripts/deploy-js/deploy-eth.mjs');

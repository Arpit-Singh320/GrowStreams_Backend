// Token Service — VFT balance queries, allowance checks, and approval payload generation
// Uses the Sails client to interact with VFT (Vara Fungible Token) contracts on-chain

import { getApi, getKeyring } from '../sails-client.mjs';
import { Sails } from 'sails-js';
import { SailsIdlParser } from 'sails-js-parser';
import { SUPPORTED_TOKENS, getToken, resolveVaraAddress } from '../config/tokens.mjs';
import { toDisplayUnits } from '../utils/decimals.mjs';

// Minimal VFT IDL for balance/allowance/approve queries
// All VFT tokens on Vara implement the same standard interface
// Note: events block removed — not supported by sails-js-parser 0.3.1
const VFT_IDL = `
constructor {
  New : (name: str, symbol: str, decimals: u8);
};

service Vft {
  Approve : (spender: actor_id, value: u256) -> bool;
  Transfer : (to: actor_id, value: u256) -> bool;
  TransferFrom : (from: actor_id, to: actor_id, value: u256) -> bool;
  query Allowance : (owner: actor_id, spender: actor_id) -> u256;
  query BalanceOf : (account: actor_id) -> u256;
  query Decimals : () -> u8;
  query Name : () -> str;
  query Symbol : () -> str;
  query TotalSupply : () -> u256;
};
`;

// GROW token IDL — uses VftService (not Vft) and u128 (not u256)
const GROW_IDL = `
constructor {
  New : ();
};

service VftService {
  Transfer : (to: actor_id, amount: u128) -> bool;
  Approve : (spender: actor_id, amount: u128) -> bool;
  TransferFrom : (from: actor_id, to: actor_id, amount: u128) -> bool;
  query BalanceOf : (account: actor_id) -> u128;
  query Allowance : (owner: actor_id, spender: actor_id) -> u128;
  query TotalSupply : () -> u128;
  query Name : () -> str;
  query Symbol : () -> str;
  query Decimals : () -> u8;
};
`;

let parser = null;
const vftInstances = new Map(); // vara address -> Sails instance

/**
 * Parse a u256 value returned by Sails queries.
 * The value might be a hex string (0x...), BigInt, number, or object with toString().
 */
function parseU256(val) {
  if (val == null) return '0';
  if (typeof val === 'bigint') return val.toString();
  if (typeof val === 'number') return String(val);
  const s = val.toString();
  if (s.startsWith('0x') || s.startsWith('0X')) {
    try { return BigInt(s).toString(); } catch { return '0'; }
  }
  return s || '0';
}

async function getParser() {
  if (!parser) {
    parser = await SailsIdlParser.new();
  }
  return parser;
}

/**
 * Get or create a Sails instance for a VFT token contract.
 */
async function getVftInstance(varaAddress) {
  if (vftInstances.has(varaAddress)) return vftInstances.get(varaAddress);

  const api = getApi();
  if (!api) throw new Error('Gear API not connected');

  // Use GROW-specific IDL for the GROW token contract
  const growTok = getToken('GROW');
  const isGrow = growTok && growTok.vara === varaAddress;
  const idl = isGrow ? GROW_IDL : VFT_IDL;

  const p = await getParser();
  const sails = new Sails(p);
  sails.parseIdl(idl);
  sails.setApi(api);
  sails.setProgramId(varaAddress);

  vftInstances.set(varaAddress, sails);
  return sails;
}

/**
 * Return the VFT service object from a Sails instance.
 * Standard VFT uses 'Vft'; GROW token uses 'VftService'.
 */
function getVftService(sails) {
  return sails.services.Vft || sails.services.VftService;
}

/**
 * Query the on-chain VFT balance for a wallet.
 * @param {string} tokenSymbol - e.g. 'WUSDC', 'USDC', 'WETH'
 * @param {string} walletAddress - Vara account address
 * @returns {{ balance: string, balanceRaw: string, decimals: number, symbol: string }}
 */
export async function getVftBalance(tokenSymbol, walletAddress) {
  const tok = getToken(tokenSymbol);
  if (!tok) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (tok.vara === 'native') {
    return getNativeBalance(walletAddress, tok);
  }

  const sails = await getVftInstance(tok.vara);
  const service = getVftService(sails);
  if (!service) throw new Error('VFT service not found in IDL');

  const origin = walletAddress || getKeyring()?.address || '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
  const raw = await service.queries.BalanceOf(origin, null, null, walletAddress);

  const rawStr = parseU256(raw);
  return {
    symbol: tok.symbol,
    balance: toDisplayUnits(rawStr, tok.decimals),
    balanceRaw: rawStr,
    decimals: tok.decimals,
  };
}

/**
 * Query native VARA balance.
 */
async function getNativeBalance(walletAddress, tok) {
  const api = getApi();
  if (!api) throw new Error('Gear API not connected');

  const { data: { free } } = await api.query.system.account(walletAddress);
  const rawStr = free.toString();
  return {
    symbol: tok.symbol,
    balance: toDisplayUnits(rawStr, tok.decimals),
    balanceRaw: rawStr,
    decimals: tok.decimals,
  };
}

/**
 * Query VFT allowance (how much spender can spend on behalf of owner).
 * @param {string} tokenSymbol
 * @param {string} ownerAddress
 * @param {string} spenderAddress
 */
export async function getVftAllowance(tokenSymbol, ownerAddress, spenderAddress) {
  const tok = getToken(tokenSymbol);
  if (!tok) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (tok.vara === 'native') return { allowance: '0', allowanceRaw: '0' };

  const sails = await getVftInstance(tok.vara);
  const service = getVftService(sails);
  const origin = ownerAddress || getKeyring()?.address || '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
  const raw = await service.queries.Allowance(origin, null, null, ownerAddress, spenderAddress);

  const rawStr = parseU256(raw);
  return {
    symbol: tok.symbol,
    allowance: toDisplayUnits(rawStr, tok.decimals),
    allowanceRaw: rawStr,
    decimals: tok.decimals,
  };
}

/**
 * Generate an encoded VFT.Approve payload for client-side signing.
 * The frontend will send this payload via the wallet extension.
 * @param {string} tokenSymbol
 * @param {string} spenderAddress - typically the token-vault contract
 * @param {string|bigint} amount - base units amount to approve
 * @returns {{ payload: string, programId: string }}
 */
export async function generateApprovePayload(tokenSymbol, spenderAddress, amount) {
  const tok = getToken(tokenSymbol);
  if (!tok) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (tok.vara === 'native') throw new Error('Cannot approve native VARA');

  const sails = await getVftInstance(tok.vara);
  const service = getVftService(sails);
  const fn = service.functions.Approve;
  if (!fn) throw new Error('Approve function not found in VFT IDL');

  const payload = fn.encodePayload(spenderAddress, BigInt(amount));
  const hex = typeof payload === 'string' ? payload : '0x' + Buffer.from(payload).toString('hex');

  return {
    payload: hex,
    programId: tok.vara,
    token: tok.symbol,
    spender: spenderAddress,
    amount: amount.toString(),
  };
}

/**
 * Get balances for all supported tokens for a wallet.
 * @param {string} walletAddress
 * @returns {Array<{ key, symbol, name, balance, balanceRaw, decimals }>}
 */
export async function getAllBalances(walletAddress) {
  const results = [];
  for (const [key, tok] of Object.entries(SUPPORTED_TOKENS)) {
    try {
      const bal = await getVftBalance(key, walletAddress);
      results.push({
        key,
        name: tok.name,
        icon: tok.icon,
        category: tok.category,
        isStablecoin: tok.isStablecoin,
        vara: tok.vara,
        eth: tok.eth,
        ...bal,
      });
    } catch (err) {
      // If a token query fails, still include it with zero balance
      results.push({
        key,
        symbol: tok.symbol,
        name: tok.name,
        icon: tok.icon,
        category: tok.category,
        isStablecoin: tok.isStablecoin,
        vara: tok.vara,
        eth: tok.eth,
        balance: '0',
        balanceRaw: '0',
        decimals: tok.decimals,
        error: err.message,
      });
    }
  }
  return results;
}

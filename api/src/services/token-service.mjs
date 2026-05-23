// Token Service — VFT balance queries, allowance checks, and approval payload generation
// Uses the Sails client to interact with VFT (Vara Fungible Token) contracts on-chain

import { getApi, getKeyring } from '../sails-client.mjs';
import { Sails } from 'sails-js';
import { SailsIdlParser } from 'sails-js-parser';
import { SUPPORTED_TOKENS, getToken, resolveVaraAddress } from '../config/tokens.mjs';
import { toDisplayUnits } from '../utils/decimals.mjs';
import { decodeAddress } from '@polkadot/keyring';

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

// wVARA IDL — uses service Vft (matching token-vault), u256 for transfers but u128 for queries
// Our wVARA contract accepts U256Le for Transfer/Approve/TransferFrom but returns u128 for queries
const WVARA_IDL = `
constructor {
  New : ();
};

service Vft {
  Approve : (spender: actor_id, value: u256) -> bool;
  Transfer : (to: actor_id, value: u256) -> bool;
  TransferFrom : (from: actor_id, to: actor_id, value: u256) -> bool;
  Wrap : () -> null;
  Unwrap : (amount: u128) -> null;
  Mint : (to: actor_id, amount: u128) -> null;
  Burn : (amount: u128) -> null;
  query BalanceOf : (account: actor_id) -> u128;
  query Allowance : (owner: actor_id, spender: actor_id) -> u128;
  query TotalSupply : () -> u128;
  query Name : () -> str;
  query Symbol : () -> str;
  query Decimals : () -> u8;
};
`;

// GROW token IDL — uses VftService (not Vft) and u128 (not u256)
// ⚠️  KNOWN INCOMPATIBILITY: The token-vault contract calls "Vft" + u256 for all VFT
// cross-contract calls, which is correct for bridge-wrapped tokens (WUSDC/WUSDT/WETH/WBTC)
// but breaks for GROW which exposes "VftService" + u128. GROW cannot be deposited/withdrawn
// through the vault until the GROW token contract is migrated to standard VFT (M3 milestone).
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
  // Handle objects (e.g. SCALE-decoded u128/u256 wrappers from sails-js)
  if (typeof val === 'object') {
    try { return BigInt(val.toString()).toString(); } catch { return '0'; }
  }
  const s = String(val);
  if (s.startsWith('0x') || s.startsWith('0X')) {
    try { return BigInt(s).toString(); } catch { return '0'; }
  }
  // Plain decimal string
  try { return BigInt(s).toString(); } catch { return s || '0'; }
}

/**
 * Convert any wallet address format to a 0x-prefixed 32-byte hex string (actor_id).
 * Handles SS58 (e.g. kGiaMA7..., 5GrwvaE...), 0x hex (padded to 32 bytes), and raw hex.
 * Gear actor_id is always 32 bytes.
 */
function toActorId(address) {
  if (!address || typeof address !== 'string') return address;

  // Already 0x-prefixed hex
  if (address.startsWith('0x')) {
    const hex = address.slice(2);
    if (hex.length === 64) return address;
    if (hex.length < 64) return '0x' + hex.padStart(64, '0');
    return address;
  }

  // SS58-encoded Substrate/Vara address — decode to raw 32-byte public key
  try {
    const decoded = decodeAddress(address);
    const hex = Buffer.from(decoded).toString('hex');
    return '0x' + hex.padStart(64, '0');
  } catch {
    // Fallback — return as-is and let the caller handle the error
    return address;
  }
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

  // Use token-specific IDL
  const growTok = getToken('GROW');
  const wvaraTok = getToken('WTVARA');
  const isGrow = growTok && growTok.vara === varaAddress;
  const isWvara = wvaraTok && wvaraTok.vara === varaAddress;
  const idl = isGrow ? GROW_IDL : isWvara ? WVARA_IDL : VFT_IDL;

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

  const actorId = toActorId(walletAddress);
  const origin = actorId || getKeyring()?.address || '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
  const raw = await service.queries.BalanceOf(origin, null, null, actorId);

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
  const ownerActorId = toActorId(ownerAddress);
  const spenderActorId = toActorId(spenderAddress);
  const origin = ownerActorId || getKeyring()?.address || '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
  const raw = await service.queries.Allowance(origin, null, null, ownerActorId, spenderActorId);

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
 * Generate an encoded VFT.Transfer payload for client-side signing.
 * Used when a user must send tokens to another address (e.g. campaign pool escrow).
 * @param {string} tokenSymbol
 * @param {string} toAddress - recipient (SS58 or 0x hex)
 * @param {string|bigint} amount - base units amount
 * @returns {{ payload: string, programId: string, token: string, to: string, amount: string }}
 */
export async function generateTransferPayload(tokenSymbol, toAddress, amount) {
  const tok = getToken(tokenSymbol);
  if (!tok) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (tok.vara === 'native') throw new Error('Use native VARA transfer for native token');

  const sails = await getVftInstance(tok.vara);
  const service = getVftService(sails);
  const fn = service.functions.Transfer;
  if (!fn) throw new Error('Transfer function not found in VFT IDL');

  const toActor = toActorId(toAddress);
  const payload = fn.encodePayload(toActor, BigInt(amount));
  const hex = typeof payload === 'string' ? payload : '0x' + Buffer.from(payload).toString('hex');

  return {
    payload: hex,
    programId: tok.vara,
    token: tok.symbol,
    to: toActor,
    amount: amount.toString(),
  };
}

/**
 * Server-signed VFT transfer. Used by the backend (platform escrow wallet)
 * to distribute campaign payouts to winners.
 * @param {string} tokenSymbol
 * @param {string} toAddress
 * @param {string|bigint} amount - base units
 * @returns {Promise<{ txHash: string, blockHash: string }>}
 */
export async function executeVftTransfer(tokenSymbol, toAddress, amount) {
  const tok = getToken(tokenSymbol);
  if (!tok) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (tok.vara === 'native') throw new Error('executeVftTransfer does not support native VARA');

  const keyring = getKeyring();
  if (!keyring) throw new Error('Server keyring not configured (VARA_SEED missing)');

  const sails = await getVftInstance(tok.vara);
  const service = getVftService(sails);
  const fn = service.functions.Transfer;
  if (!fn) throw new Error('Transfer function not found in VFT IDL');

  const toActor = toActorId(toAddress);
  const tx = fn(toActor, BigInt(amount));
  tx.withAccount(keyring);
  await tx.calculateGas();
  const { blockHash, txHash } = await tx.signAndSend();
  try { await tx.response?.(); } catch { /* response decoding may fail but the tx succeeded */ }

  return { txHash: txHash?.toString() || '', blockHash: blockHash?.toString() || '' };
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

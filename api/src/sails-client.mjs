import { Sails } from 'sails-js';
import { SailsIdlParser } from 'sails-js-parser';
import { GearApi, GearKeyring } from '@gear-js/api';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(__dirname, '../..');

function findIdl(filename) {
  const bundled = resolve(API_ROOT, 'idl', filename);
  if (existsSync(bundled)) return bundled;
  const contractMap = {
    'stream-core.idl': 'contracts/stream-core/stream-core.idl',
    'token-vault.idl': 'contracts/token-vault/token-vault.idl',
    'splits-router.idl': 'contracts/splits-router/splits-router.idl',
    'permission-manager.idl': 'contracts/permission-manager/permission-manager.idl',
    'bounty-adapter.idl': 'contracts/adapters/bounty-adapter/bounty-adapter.idl',
    'identity-registry.idl': 'contracts/identity-registry/identity-registry.idl',
    'grow-token.idl': 'contracts/grow-token/grow-token.idl',
    'quest-seeds.idl': 'contracts/quest-seeds/quest-seeds.idl',
    'wvara.idl': 'contracts/wvara/wvara.idl',
  };
  return resolve(PROJECT_ROOT, contractMap[filename] || filename);
}

const IDL_PATHS = {
  streamCore: findIdl('stream-core.idl'),
  tokenVault: findIdl('token-vault.idl'),
  splitsRouter: findIdl('splits-router.idl'),
  permissionManager: findIdl('permission-manager.idl'),
  bountyAdapter: findIdl('bounty-adapter.idl'),
  identityRegistry: findIdl('identity-registry.idl'),
  growToken: findIdl('grow-token.idl'),
  questSeeds: findIdl('quest-seeds.idl'),
  wvara: findIdl('wvara.idl'),
};

let gearApi = null;
let keyring = null;
let parser = null;

let _mintQueue = Promise.resolve();
function serialCommand(fn) {
  const result = _mintQueue.then(() => fn());
  _mintQueue = result.catch(() => {});
  return result;
}

const contracts = {
  streamCore: null,
  tokenVault: null,
  splitsRouter: null,
  permissionManager: null,
  bountyAdapter: null,
  identityRegistry: null,
  growToken: null,
  questSeeds: null,
  wvara: null,
};

const SERVICE_NAMES = {
  streamCore: 'StreamService',
  tokenVault: 'VaultService',
  splitsRouter: 'SplitsService',
  permissionManager: 'PermissionService',
  bountyAdapter: 'BountyService',
  identityRegistry: 'IdentityService',
  growToken: 'VftService',
  questSeeds: 'SeedsService',
  wvara: 'Vft',
};

function loadDeployState() {
  const candidates = [
    resolve(API_ROOT, 'deploy-state.json'),
    resolve(PROJECT_ROOT, 'deploy-state.json'),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        console.log(`[sails] Loading deploy state from ${p}`);
        return JSON.parse(readFileSync(p, 'utf-8'));
      }
    } catch { /* skip */ }
  }
  return {};
}

const DEPLOY_KEY_MAP = {
  streamCore: 'stream-core',
  tokenVault: 'token-vault',
  splitsRouter: 'splits-router',
  permissionManager: 'permission-manager',
  bountyAdapter: 'bounty-adapter',
  identityRegistry: 'identity-registry',
  growToken: 'grow-token',
  questSeeds: 'quest-seeds',
  wvara: 'wvara',
};

async function initSailsInstance(name, idlPath, programId) {
  const idl = readFileSync(idlPath, 'utf-8');
  const sails = new Sails(parser);
  sails.parseIdl(idl);
  sails.setApi(gearApi);
  if (programId) {
    sails.setProgramId(programId);
  }
  return sails;
}

export async function connect() {
  const nodeUrl = process.env.VARA_NODE || 'wss://rpc.vara.network';
  const seed = process.env.VARA_SEED;

  console.log(`[sails] Connecting to ${nodeUrl}...`);
  gearApi = await GearApi.create({ providerAddress: nodeUrl });
  const chain = await gearApi.chain();
  console.log(`[sails] Connected: ${chain}`);

  gearApi.on('disconnected', () => {
    console.warn('[sails] WebSocket disconnected — reconnecting...');
    gearApi.connect().catch(err => console.error('[sails] Reconnect failed:', err.message));
  });

  if (seed) {
    try {
      keyring = await GearKeyring.fromMnemonic(seed);
    } catch {
      keyring = await GearKeyring.fromSuri(seed);
    }
    console.log(`[sails] Account: ${keyring.address}`);
  }

  parser = await SailsIdlParser.new();

  const deployState = loadDeployState();

  const envOverrides = {
    streamCore: process.env.STREAM_CORE_ID,
    tokenVault: process.env.TOKEN_VAULT_ID,
    splitsRouter: process.env.SPLITS_ROUTER_ID,
    permissionManager: process.env.PERMISSION_MANAGER_ID,
    bountyAdapter: process.env.BOUNTY_ADAPTER_ID,
    identityRegistry: process.env.IDENTITY_REGISTRY_ID,
    growToken: process.env.GROW_TOKEN_ID,
    questSeeds: process.env.QUEST_SEEDS_ID,
    wvara: process.env.WVARA_TOKEN_ID, // wVARA wrapped token contract
  };

  for (const [name, idlPath] of Object.entries(IDL_PATHS)) {
    const programId =
      envOverrides[name] ||
      deployState[DEPLOY_KEY_MAP[name]]?.programId ||
      null;

    try {
      contracts[name] = await initSailsInstance(name, idlPath, programId);
      console.log(`[sails] ${name} loaded${programId ? ` @ ${programId.slice(0, 18)}...` : ' (no program ID)'}`);
    } catch (err) {
      console.error(`[sails] Failed to load ${name}: ${err.message}`);
      console.error(`[sails] IDL path: ${idlPath}, programId: ${programId}`);
      console.error(err.stack);
    }
  }

  return { gearApi, keyring, contracts };
}

export function getApi() {
  return gearApi;
}

export function getKeyring() {
  return keyring;
}

export function getContract(name) {
  return contracts[name];
}

export function getServiceName(name) {
  return SERVICE_NAMES[name];
}

export function getAllContracts() {
  return contracts;
}

export function getProgramIds() {
  const ids = {};
  for (const [name, sails] of Object.entries(contracts)) {
    try {
      ids[DEPLOY_KEY_MAP[name]] = sails?.programId || null;
    } catch {
      ids[DEPLOY_KEY_MAP[name]] = null;
    }
  }
  return ids;
}

/**
 * Normalize an address to hex format (0x...).
 * Accepts both SS58 (e.g., kGiaMA7...) and hex (0x...) formats.
 */
async function normalizeAddress(addr) {
  if (!addr) return addr;
  // Already hex format
  if (addr.startsWith('0x') && addr.length === 66) return addr;
  // SS58 format - decode to hex
  try {
    const { decodeAddress } = await import('@polkadot/util-crypto');
    const publicKey = decodeAddress(addr);
    return '0x' + Buffer.from(publicKey).toString('hex');
  } catch (err) {
    console.warn(`[sails] Failed to decode address ${addr}: ${err.message}`);
    return addr;
  }
}

export async function query(contractName, fnName, ...args) {
  const sails = contracts[contractName];
  if (!sails) throw new Error(`Contract ${contractName} not loaded`);

  const serviceName = SERVICE_NAMES[contractName];
  const service = sails.services[serviceName];
  if (!service) throw new Error(`Service ${serviceName} not found in ${contractName}`);

  const queryFn = service.queries[fnName];
  if (!queryFn) throw new Error(`Query ${fnName} not found in ${serviceName}`);

  // Normalize any address arguments (SS58 -> hex)
  const normalizedArgs = await Promise.all(args.map(async (arg) => {
    if (typeof arg === 'string' && (arg.startsWith('0x') || arg.length === 48 || arg.length === 47)) {
      return await normalizeAddress(arg);
    }
    return arg;
  }));

  // queryFn(...args) returns a QueryBuilder; set origin then call()
  const qb = queryFn(...normalizedArgs);
  if (keyring) {
    qb.withAddress(keyring.address);
  }
  const result = await qb.call();
  return result;
}

export function command(contractName, fnName, ...args) {
  return serialCommand(async () => {
    const sails = contracts[contractName];
    if (!sails) throw new Error(`Contract ${contractName} not loaded`);
    if (!keyring) throw new Error('No keyring configured for signing');

    const serviceName = SERVICE_NAMES[contractName];
    const service = sails.services[serviceName];
    if (!service) throw new Error(`Service ${serviceName} not found in ${contractName}`);

    const fn = service.functions[fnName];
    if (!fn) throw new Error(`Function ${fnName} not found in ${serviceName}`);

    const tx = fn(...args);
    tx.withAccount(keyring);
    tx.withGas(50_000_000_000n); // fixed gas — avoids calculateGas WebSocket hangs on mainnet
    const { response, blockHash } = await tx.signAndSend();
    let result = null;
    try {
      result = await response();
    } catch (decodeErr) {
      console.warn(`[sails] Response decode warning for ${contractName}.${fnName}: ${decodeErr.message.slice(0, 80)}`);
    }
    return { result, blockHash };
  });
}

export function encodePayload(contractName, fnName, ...args) {
  const sails = contracts[contractName];
  if (!sails) throw new Error(`Contract ${contractName} not loaded`);

  const serviceName = SERVICE_NAMES[contractName];
  const service = sails.services[serviceName];
  if (!service) throw new Error(`Service ${serviceName} not found`);

  const fn = service.functions[fnName];
  if (!fn) throw new Error(`Function ${fnName} not found`);

  const payload = fn.encodePayload(...args);
  if (typeof payload === 'string') return payload;
  return '0x' + Buffer.from(payload).toString('hex');
}

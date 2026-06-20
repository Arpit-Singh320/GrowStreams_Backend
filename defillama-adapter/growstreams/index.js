/*
 * GrowStreams — TVL adapter for DeFiLlama
 * Chain: Vara Network (Gear Protocol, Substrate-based)
 *
 * TVL = the value locked in the GrowStreams TokenVault on Vara mainnet,
 * denominated in VARA. GrowStreams streams value using VARA wrappers:
 *   - gVARA  (native super-token wrapper, the streaming token)
 *   - wVARA  (Ethereum-bridged wrapped VARA)
 * plus native VARA held by the vault. All three are economically VARA, so
 * their balances are summed and priced as VARA (coingecko:vara-network).
 *
 * On-chain reads only (per DeFiLlama policy): balances are fetched directly
 * from the Vara RPC via `gear_calculateReplyForHandle`, which simulates a
 * read-only VFT/SuperToken `BalanceOf(vault)` query and returns the SCALE-
 * encoded reply. No project API is used. Only `axios` is required (already a
 * repo dependency); no new packages and no @polkadot/api.
 */

const axios = require("axios");
const { default: BigNumber } = require("bignumber.js");

const VARA_RPC = "https://rpc.vara.network";

// GrowStreams mainnet program IDs (Gear ActorIds, 32-byte hex).
const TOKEN_VAULT =
  "0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef";

// VARA-denominated tokens held by the vault. `service` is the Sails service
// name exposed by each contract; both expose `BalanceOf(actor_id) -> u128`.
const VARA_TOKENS = [
  { symbol: "gVARA", program: "0x71de1ef1f4dec1a4fe862aa6c92747c8499bbf1af128625749027392709f4a72", service: "SuperTokenService" },
  { symbol: "wVARA", program: "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d", service: "Vft" },
];

const VARA_DECIMALS = 12;
const CG_VARA = "coingecko:vara-network";
// Zero account is a valid read-only origin for calculateReplyForHandle.
const ZERO_ORIGIN = "0x" + "00".repeat(32);
const READ_GAS = 250_000_000_000; // ample gas for a state read; not consumed

// Storage key for system.account(TOKEN_VAULT). Constant because the vault
// address is fixed: twox128("System") ++ twox128("Account") ++ blake2_128_concat(vault).
// Used to read the vault's real native VARA balance via state_getStorage.
const VAULT_ACCOUNT_STORAGE_KEY =
  "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9" +
  "1d1272ab84d552529d97118672b376d8" +
  "20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef";

// SCALE compact-length prefix for short strings (length < 64), as used by the
// Sails routing prefix: value is (len << 2) in a single byte.
function compactStr(s) {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([Buffer.from([b.length << 2]), b]);
}

// Build a Sails query payload: [service][method][SCALE args].
// For BalanceOf the only arg is the 32-byte account id.
function balanceOfPayload(service, accountHex) {
  const account = Buffer.from(accountHex.slice(2), "hex");
  const bytes = Buffer.concat([
    compactStr(service),
    compactStr("BalanceOf"),
    account,
  ]);
  return "0x" + bytes.toString("hex");
}

// Decode a u128 from the tail of the reply payload (little-endian, 16 bytes).
// The reply echoes [service][method] then the SCALE-encoded u128 return value.
function decodeTailU128(replyHex) {
  const raw = Buffer.from(replyHex.slice(2), "hex");
  const u128le = raw.subarray(raw.length - 16);
  const be = Buffer.from(u128le).reverse().toString("hex");
  return new BigNumber("0x" + be);
}

async function readVftBalance(program, service, account) {
  const { data } = await axios.post(VARA_RPC, {
    jsonrpc: "2.0",
    id: 1,
    method: "gear_calculateReplyForHandle",
    params: [ZERO_ORIGIN, program, balanceOfPayload(service, account), READ_GAS, 0],
  });
  if (data.error) throw new Error(`Vara RPC error for ${program}: ${data.error.message}`);
  const code = data.result?.code;
  // Gear returns { Success: ... } on a successful reply.
  if (!code || code.Success === undefined) {
    throw new Error(`Non-success reply for ${program}: ${JSON.stringify(code)}`);
  }
  return decodeTailU128(data.result.payload);
}

// Read the vault's real native VARA balance from system.account free balance.
// AccountInfo layout: nonce(u32) consumers(u32) providers(u32) sufficients(u32)
// = 16 bytes, then AccountData.free (u128, little-endian) = next 16 bytes.
async function readNativeBalance() {
  const { data } = await axios.post(VARA_RPC, {
    jsonrpc: "2.0",
    id: 1,
    method: "state_getStorage",
    params: [VAULT_ACCOUNT_STORAGE_KEY],
  });
  if (data.error) throw new Error(`Vara RPC error (native): ${data.error.message}`);
  if (!data.result) return new BigNumber(0); // empty account
  const raw = Buffer.from(data.result.slice(2), "hex");
  const freeLE = raw.subarray(16, 32);
  const be = Buffer.from(freeLE).reverse().toString("hex");
  return new BigNumber("0x" + be);
}

async function tvl(api) {
  // Sum the wrapped streaming tokens (gVARA + wVARA) plus the vault's real
  // native VARA balance. All are economically VARA and priced as such.
  let totalVaraRaw = new BigNumber(0);
  for (const t of VARA_TOKENS) {
    const bal = await readVftBalance(t.program, t.service, TOKEN_VAULT);
    totalVaraRaw = totalVaraRaw.plus(bal);
  }
  totalVaraRaw = totalVaraRaw.plus(await readNativeBalance());

  // Decimal-adjust and add under the VARA coingecko id.
  const amount = totalVaraRaw.div(new BigNumber(10).pow(VARA_DECIMALS)).toString();
  api.add(CG_VARA, amount);
}

module.exports = {
  timetravel: false, // values are read from current chain state
  misrepresentedTokens: false,
  methodology:
    "TVL is the VARA-denominated value locked in the GrowStreams TokenVault on Vara Network. " +
    "GrowStreams streams value using gVARA (native super-token wrapper) and wVARA (bridged wrapped VARA), " +
    "both economically VARA, plus the vault's native VARA balance. The adapter reads each wrapper's " +
    "BalanceOf(vault) via gear_calculateReplyForHandle and the native balance via state_getStorage, " +
    "directly from the Vara RPC, then sums them priced as VARA.",
  vara: {
    tvl,
  },
};

import { getApi, getKeyring, getProgramIds } from '../sails-client.mjs';
import { queryOne, queryAll, query } from './db.mjs';

const VOUCHER_AMOUNT = process.env.VOUCHER_AMOUNT || '20000000000000'; // 20 VARA (12 decimals) — refundable on expiry
const VOUCHER_DURATION_BLOCKS = parseInt(process.env.VOUCHER_DURATION_BLOCKS || '201600', 10); // ~7 days at 3s/block
const MAX_VOUCHERS_PER_USER = parseInt(process.env.MAX_VOUCHERS_PER_USER || '5', 10);
const VOUCHER_COOLDOWN_MS = parseInt(process.env.VOUCHER_COOLDOWN_MS || '60000', 10); // 1 min between requests

// Program IDs that users can interact with (gasless).
//
// IMPORTANT: this whitelist MUST match the program IDs the sails-client actually
// connected to (env override -> deploy-state.json). Reading only from
// process.env caused vouchers to whitelist a stale/empty set when the app ran
// off deploy-state, which made every gasless call fail on-chain with
// `gearVoucher.InappropriateDestination`. We source from the resolved IDs first
// and fall back to env vars only for anything the client didn't load.
function getAllowedPrograms() {
  // getProgramIds() -> { 'stream-core': '0x..', 'token-vault': '0x..', ... }
  const resolved = getProgramIds();
  const programs = [
    resolved['stream-core']        || process.env.STREAM_CORE_ID,
    resolved['token-vault']        || process.env.TOKEN_VAULT_ID,
    resolved['splits-router']      || process.env.SPLITS_ROUTER_ID,
    resolved['permission-manager'] || process.env.PERMISSION_MANAGER_ID,
    resolved['bounty-adapter']     || process.env.BOUNTY_ADAPTER_ID,
    resolved['identity-registry']  || process.env.IDENTITY_REGISTRY_ID,
    resolved['grow-token']         || process.env.GROW_TOKEN_ID,
    resolved['quest-seeds']        || process.env.QUEST_SEEDS_ID,
    resolved['wvara']              || process.env.WVARA_TOKEN_ID,
    // gVARA super-token: stream-core routes wVARA streams through it, so a
    // gasless stream of gVARA needs it whitelisted too.
    resolved['gvara-token']        || process.env.GVARA_TOKEN_ID,
    resolved['super-token']        || process.env.SUPER_TOKEN_ID,
  ];
  // De-dupe and drop empties.
  return [...new Set(programs.filter(Boolean))];
}

export async function ensureVoucherTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id            SERIAL PRIMARY KEY,
      wallet        TEXT NOT NULL,
      voucher_id    TEXT NOT NULL,
      program_ids   TEXT[] NOT NULL DEFAULT '{}',
      amount        TEXT NOT NULL,
      duration      INTEGER NOT NULL,
      issued_at     TIMESTAMP DEFAULT NOW(),
      expires_at    TIMESTAMP,
      status        TEXT NOT NULL DEFAULT 'ACTIVE'
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_vouchers_wallet ON vouchers(wallet)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status)`);
}

// Maximum VARA that can be in-flight across all active vouchers (30,000 VARA in base units)
const MAX_INFLIGHT_BUDGET = BigInt(process.env.VOUCHER_MAX_BUDGET || '30000000000000000'); // 30,000 VARA

export async function issueVoucher(userWallet) {
  const api = getApi();
  const keyring = getKeyring();

  if (!api) throw Object.assign(new Error('Gear API not connected'), { status: 503 });
  if (!keyring) throw Object.assign(new Error('Relayer keyring not configured'), { status: 503 });

  // Rate limit: check cooldown
  const recent = await queryOne(
    `SELECT id FROM vouchers WHERE wallet = $1 AND issued_at > NOW() - INTERVAL '${VOUCHER_COOLDOWN_MS} milliseconds' LIMIT 1`,
    [userWallet]
  );
  if (recent) {
    throw Object.assign(new Error('Please wait before requesting another voucher.'), { status: 429 });
  }

  // Check max active vouchers per user
  const activeCount = await queryOne(
    `SELECT COUNT(*)::int AS cnt FROM vouchers WHERE wallet = $1 AND status = 'ACTIVE'`,
    [userWallet]
  );
  if (activeCount && activeCount.cnt >= MAX_VOUCHERS_PER_USER) {
    throw Object.assign(new Error(`Maximum active vouchers (${MAX_VOUCHERS_PER_USER}) reached. Use existing vouchers first.`), { status: 429 });
  }

  // Global budget guard: prevent exceeding 30,000 VARA in-flight
  const totalActive = await queryOne(
    `SELECT COALESCE(SUM(amount::bigint), 0)::text AS total FROM vouchers WHERE status = 'ACTIVE' AND expires_at > NOW()`
  );
  if (totalActive && BigInt(totalActive.total) + BigInt(VOUCHER_AMOUNT) > MAX_INFLIGHT_BUDGET) {
    throw Object.assign(new Error('Voucher budget limit reached. Please try again later as expired vouchers are reclaimed.'), { status: 503 });
  }

  const programs = getAllowedPrograms();
  if (programs.length === 0) {
    throw Object.assign(new Error('No program IDs configured for voucher issuance'), { status: 500 });
  }

  // Issue voucher on-chain
  const { extrinsic, voucherId } = await api.voucher.issue(
    userWallet,
    VOUCHER_AMOUNT,
    VOUCHER_DURATION_BLOCKS,
    programs
  );

  // Sign and send with the relayer (project wallet pays)
  await new Promise((resolve, reject) => {
    extrinsic.signAndSend(keyring, ({ status, events }) => {
      if (status.isInBlock || status.isFinalized) {
        resolve({ blockHash: status.isInBlock ? status.asInBlock.toHex() : status.asFinalized.toHex() });
      } else if (status.isInvalid) {
        reject(new Error('Voucher issuance transaction invalid'));
      }
    }).catch(reject);
  });

  // Calculate expiry
  const blockTime = 3; // seconds per block on Vara
  const expiresAt = new Date(Date.now() + VOUCHER_DURATION_BLOCKS * blockTime * 1000);

  // Record in DB
  const record = await queryOne(
    `INSERT INTO vouchers (wallet, voucher_id, program_ids, amount, duration, expires_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE') RETURNING *`,
    [userWallet, voucherId, programs, VOUCHER_AMOUNT, VOUCHER_DURATION_BLOCKS, expiresAt.toISOString()]
  );

  console.log(`[voucher] Issued ${voucherId} to ${userWallet} (${VOUCHER_AMOUNT} for ${VOUCHER_DURATION_BLOCKS} blocks)`);

  return {
    voucherId,
    amount: VOUCHER_AMOUNT,
    durationBlocks: VOUCHER_DURATION_BLOCKS,
    expiresAt: expiresAt.toISOString(),
    programs,
    record,
  };
}

export async function getVoucherForUser(userWallet) {
  const api = getApi();

  // Check DB for active voucher
  const dbVoucher = await queryOne(
    `SELECT * FROM vouchers WHERE wallet = $1 AND status = 'ACTIVE' AND expires_at > NOW() ORDER BY issued_at DESC LIMIT 1`,
    [userWallet]
  );

  if (!dbVoucher) return null;

  // Reject vouchers whose whitelisted program set is stale — i.e. it doesn't
  // cover the program IDs the client is actually calling now (after a redeploy
  // or a whitelist-source change). Reusing such a voucher fails on-chain with
  // gearVoucher.InappropriateDestination, so we retire it and force a reissue.
  const required = getAllowedPrograms();
  const have = new Set((dbVoucher.program_ids || []).map((p) => String(p).toLowerCase()));
  const missing = required.filter((p) => !have.has(String(p).toLowerCase()));
  if (missing.length > 0) {
    console.warn(
      `[voucher] Retiring stale voucher ${dbVoucher.voucher_id} for ${userWallet}: ` +
      `missing ${missing.length} program(s) from whitelist — forcing reissue.`
    );
    await query(`UPDATE vouchers SET status = 'EXPIRED' WHERE id = $1`, [dbVoucher.id]);
    return null;
  }

  // Verify on-chain it's still valid
  if (api) {
    try {
      const details = await api.voucher.getDetails(userWallet, dbVoucher.voucher_id);
      if (!details || details.expiry === 0) {
        await query(`UPDATE vouchers SET status = 'EXPIRED' WHERE id = $1`, [dbVoucher.id]);
        return null;
      }
    } catch {
      // If we can't verify, trust the DB expiry
    }
  }

  return {
    voucherId: dbVoucher.voucher_id,
    amount: dbVoucher.amount,
    expiresAt: dbVoucher.expires_at,
    programs: dbVoucher.program_ids,
    issuedAt: dbVoucher.issued_at,
  };
}

export async function listVouchersForUser(userWallet) {
  return queryAll(
    `SELECT voucher_id, amount, duration, issued_at, expires_at, status, program_ids
     FROM vouchers WHERE wallet = $1 ORDER BY issued_at DESC LIMIT 10`,
    [userWallet]
  );
}

export async function revokeExpiredVouchers() {
  const api = getApi();
  const keyring = getKeyring();

  const expired = await queryAll(
    `SELECT id, voucher_id, wallet FROM vouchers WHERE status = 'ACTIVE' AND expires_at < NOW()`
  );

  let revokedCount = 0;
  let markedCount = 0;

  for (const v of expired) {
    // Try to revoke on-chain to reclaim VARA back to project wallet
    if (api && keyring) {
      try {
        const revokeTx = api.voucher.revoke(v.wallet, v.voucher_id);
        await new Promise((resolve, reject) => {
          revokeTx.signAndSend(keyring, ({ status }) => {
            if (status.isInBlock || status.isFinalized) resolve();
            else if (status.isInvalid) reject(new Error('revoke tx invalid'));
          }).catch(reject);
        });
        revokedCount++;
      } catch (err) {
        // Voucher may already be expired/revoked on-chain — just mark in DB
        console.warn(`[voucher] On-chain revoke failed for ${v.voucher_id}: ${err.message}`);
      }
    }
    await query(`UPDATE vouchers SET status = 'EXPIRED' WHERE id = $1`, [v.id]);
    markedCount++;
  }

  if (markedCount > 0) {
    console.log(`[voucher] Expired: ${markedCount} marked, ${revokedCount} revoked on-chain (VARA reclaimed)`);
  }
  return { marked: markedCount, revoked: revokedCount };
}

export async function getVoucherStats() {
  const total = await queryOne(`SELECT COUNT(*)::int AS cnt FROM vouchers`);
  const active = await queryOne(`SELECT COUNT(*)::int AS cnt FROM vouchers WHERE status = 'ACTIVE' AND expires_at > NOW()`);
  const expired = await queryOne(`SELECT COUNT(*)::int AS cnt FROM vouchers WHERE status = 'EXPIRED' OR expires_at <= NOW()`);
  const uniqueUsers = await queryOne(`SELECT COUNT(DISTINCT wallet)::int AS cnt FROM vouchers`);

  return {
    total: total?.cnt || 0,
    active: active?.cnt || 0,
    expired: expired?.cnt || 0,
    uniqueUsers: uniqueUsers?.cnt || 0,
  };
}

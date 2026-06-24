import { Router } from 'express';
import { query as dbQuery, queryOne } from '../services/db.mjs';
import { getApi, getKeyring } from '../sails-client.mjs';

const router = Router();

const REWARD_AMOUNT_VARA = 50;
const REWARD_AMOUNT_UNITS = BigInt(REWARD_AMOUNT_VARA) * BigInt(1_000_000_000_000n);

async function ensureRewardTable() {
  const pool = (await import('../services/db.mjs')).getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vara_rewards (
      id          SERIAL PRIMARY KEY,
      wallet      TEXT UNIQUE NOT NULL,
      tx_hash     TEXT,
      block_hash  TEXT,
      amount      TEXT NOT NULL DEFAULT '50',
      claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

ensureRewardTable().catch(err => console.warn('[reward] Table ensure failed:', err.message));

router.get('/wallet-balance', async (req, res, next) => {
  try {
    const api = getApi();
    const keyring = getKeyring();
    if (!api || !keyring) {
      return res.json({ balance: '0', address: null });
    }
    
    const { data: { free } } = await api.query.system.account(keyring.address);
    const balanceVara = Number(free.toString()) / 1e12;
    
    res.json({
      balance: balanceVara.toFixed(4),
      balanceRaw: free.toString(),
      address: keyring.address,
    });
  } catch (err) { next(err); }
});

router.get('/status/:wallet', async (req, res, next) => {
  try {
    const { wallet } = req.params;
    if (!wallet) return res.status(400).json({ error: 'Missing wallet' });
    const row = await queryOne('SELECT * FROM vara_rewards WHERE wallet = $1', [wallet]);
    res.json({
      claimed: !!row,
      claimed_at: row?.claimed_at || null,
      tx_hash: row?.tx_hash || null,
      amount: row?.amount || null,
    });
  } catch (err) { next(err); }
});

router.post('/claim', async (req, res, next) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: 'Missing: wallet' });

    const registered = await queryOne('SELECT id FROM quest_registrations WHERE wallet = $1', [wallet]);
    if (!registered) {
      return res.status(403).json({ error: 'Wallet not registered. Complete quest registration first.' });
    }

    const existing = await queryOne('SELECT id FROM vara_rewards WHERE wallet = $1', [wallet]);
    if (existing) {
      return res.status(409).json({ error: 'Reward already claimed for this wallet.' });
    }

    const api = getApi();
    const keyring = getKeyring();
    if (!api) return res.status(503).json({ error: 'Vara API not connected' });
    if (!keyring) return res.status(503).json({ error: 'Server wallet not configured (VARA_SEED missing)' });

    const { data: { free: senderBalance } } = await api.query.system.account(keyring.address);
    const senderFree = BigInt(senderBalance.toString());
    if (senderFree < REWARD_AMOUNT_UNITS + BigInt(1_000_000_000_000n)) {
      return res.status(503).json({ error: 'Faucet wallet has insufficient funds' });
    }

    const tx = api.tx.balances.transferKeepAlive(wallet, REWARD_AMOUNT_UNITS);

    const { blockHash, txHash } = await new Promise((resolve, reject) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (!done) { done = true; reject(new Error('Transaction timeout after 60s')); }
      }, 60_000);

      tx.signAndSend(keyring, ({ status, events }) => {
        if (status.isFinalized) {
          clearTimeout(timeout);
          if (done) return;
          done = true;

          for (const { event } of events) {
            if (api.events.system.ExtrinsicFailed.is(event)) {
              const [err] = event.data;
              const info = err.isModule
                ? api.registry.findMetaError(err.asModule).name
                : err.toString();
              return reject(new Error('Transfer failed: ' + info));
            }
          }
          resolve({ blockHash: status.asFinalized.toHex(), txHash: tx.hash?.toHex?.() || '' });
        }
      }).catch(err => {
        clearTimeout(timeout);
        if (!done) { done = true; reject(err); }
      });
    });

    await dbQuery(
      `INSERT INTO vara_rewards (wallet, tx_hash, block_hash, amount) VALUES ($1, $2, $3, $4)
       ON CONFLICT (wallet) DO NOTHING`,
      [wallet, txHash, blockHash, REWARD_AMOUNT_VARA.toString()]
    );

    res.json({
      success: true,
      wallet,
      amount: REWARD_AMOUNT_VARA,
      amountHuman: `${REWARD_AMOUNT_VARA} VARA`,
      tx_hash: txHash,
      block_hash: blockHash,
    });
  } catch (err) { next(err); }
});

export default router;

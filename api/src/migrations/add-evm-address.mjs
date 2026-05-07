import { query } from '../services/db.mjs';

export async function addEvmAddress() {
  console.log('[migration] Adding evm_address column to quest_registrations...');

  await query(`
    ALTER TABLE quest_registrations
    ADD COLUMN IF NOT EXISTS evm_address TEXT,
    ADD COLUMN IF NOT EXISTS wallet_type TEXT DEFAULT 'substrate'
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS quest_registrations_evm_address_unique
    ON quest_registrations (evm_address)
    WHERE evm_address IS NOT NULL
  `);

  console.log('[migration] evm_address column added.');
}

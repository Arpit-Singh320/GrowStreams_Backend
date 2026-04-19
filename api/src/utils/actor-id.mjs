// Utility to convert any wallet address format to a 0x-prefixed 32-byte hex string (actor_id).
// Handles SS58 (e.g. kGiaMA7..., 5GrwvaE...), 0x hex (padded to 32 bytes), and raw hex.
// Gear actor_id is always 32 bytes.

import { decodeAddress } from '@polkadot/keyring';

export function toActorId(address) {
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

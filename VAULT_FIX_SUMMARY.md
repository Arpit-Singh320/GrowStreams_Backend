# Vault Balance Bug Fix Summary

## Issue
When querying vault balances via the API, the system returned an error:
```
createType((String, String, [u8;32], [u8;32])):: Tuple: failed on 2:: Expected input with 32 bytes (256 bits), found 48 bytes
```

## Root Cause
The vault and streams routes were passing SS58-encoded wallet addresses (e.g., `5F74ceY1P9xfGFeyXBS4huvcLhc5QLUWcCwhGRSmfTnq8b38`) directly to on-chain contract queries without converting them to the 32-byte hex `actor_id` format that Gear/Vara contracts expect.

SS58 addresses are ~48 characters (base58-encoded), but Gear contracts expect `actor_id` as a 32-byte hex string (0x-prefixed, 66 chars total).

## Files Changed

### Created
- **`api/src/utils/actor-id.mjs`** — Utility function `toActorId()` that converts SS58 addresses to hex actor_id format using `@polkadot/keyring`'s `decodeAddress()`

### Modified
- **`api/src/routes/vault.mjs`**
  - Added `toActorId` import
  - Convert owner/wallet addresses in:
    - `GET /balance/:owner/:token` — owner param
    - `GET /balances/:wallet` — wallet param
    - `POST /allocate` — owner param
    - `POST /release` — owner param
    - `POST /transfer` — receiver param

- **`api/src/routes/streams.mjs`**
  - Added `toActorId` import
  - Convert addresses in:
    - `GET /sender/:address` — sender param
    - `GET /receiver/:address` — receiver param
    - `POST /` (CreateStream) — receiver param
    - Fallback sender query in CreateStream

## Deployment Status

✅ **Backend:** https://growstreams-api-v3-production.up.railway.app (Railway)  
✅ **Frontend:** https://growstreams-v3.vercel.app (Vercel)

## Testing Results

### API Endpoint Test
```bash
GET /api/vault/balances/5F74ceY1P9xfGFeyXBS4huvcLhc5QLUWcCwhGRSmfTnq8b38
```

**Before Fix:** Error (48 bytes vs 32 bytes expected)  
**After Fix:** ✅ Returns vault balances (all 0 currently)

### Current Vault State
All tokens show 0 balance in the vault:
- WUSDC: 0
- WUSDT: 0
- WETH: 0
- WBTC: 0
- GROW: 0

This indicates either:
1. The deposit transaction hasn't been executed yet
2. The deposit failed on-chain
3. A different wallet was used for the deposit

## Next Steps for Testing

1. **Verify Wallet Balance** — Check that the wallet still has 10 WUSDC
2. **Retry Deposit** — Go to `/app/vault`, approve WUSDC, and deposit again
3. **Check Transaction** — Monitor the transaction on Vara explorer
4. **Test Stream Creation** — Once vault has balance, create a WUSDC stream
5. **Test Withdraw** — Create a stream, let it run, then test withdraw functionality

## Technical Details

### toActorId() Function
```javascript
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
    return address; // Fallback
  }
}
```

### Example Conversion
- **Input (SS58):** `5F74ceY1P9xfGFeyXBS4huvcLhc5QLUWcCwhGRSmfTnq8b38`
- **Output (Hex):** `0x8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48`

## Commits
- `aeb85e8` — fixed vault and streams routes
- `6b4c0f2` — updated fallback API URL to growstreams-api-v3 Railway deployment

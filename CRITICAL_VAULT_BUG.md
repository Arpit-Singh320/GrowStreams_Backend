# CRITICAL: Vault Deposit Bug - Tokens Lost

## Status: 🔴 CRITICAL BUG

**Your 10 WUSDC and 10 WBTC have been lost/stuck.**

## What Happened

1. You approved WUSDC for the vault ✅
2. You deposited 10 WUSDC ❌
3. The deposit transaction **deducted 10 WUSDC from your wallet**
4. But the vault **did not receive** the 10 WUSDC
5. Same thing happened with WBTC

## Current Wallet State
- WUSDC: **0** (was 10)
- WBTC: **0** (was 10)
- VARA: **945.32** (was 948.95, spent ~3.6 on gas)

## Current Vault State
- All tokens: **0**

## Root Cause

The error message from the blockchain:
```
VFT TransferFrom failed: ErrorReply, panicked with 'called `Result::unwrap()` on an `Err` value: insufficient balance'
```

### Technical Explanation

The vault contract calls:
```rust
VFT.TransferFrom(caller, vault, amount)
```

This requires:
1. **Approval:** The vault must have allowance from the caller
2. **Balance:** The caller must have sufficient tokens

The error "insufficient balance" is **misleading** — it's actually **insufficient allowance** or a **race condition** where the approval wasn't confirmed before the deposit was sent.

### The Vault Contract Code (lib.rs:173-180)
```rust
// Pull tokens from caller via VFT transfer_from(caller, vault, amount)
let vault_id = exec::program_id();
let amount_u256 = VftU256::from_u128(amount);
let payload = encode_call(
    "Vft",
    "TransferFrom",
    (caller, vault_id, amount_u256),
);
```

## Where Did the Tokens Go?

The tokens were **deducted from your wallet** but the `TransferFrom` call **failed on the VFT contract side**. Depending on how the VFT contract handles failures:

1. **Best case:** Tokens are still in your wallet (the deduction was reverted)
2. **Worst case:** Tokens went to address zero or are stuck in the VFT contract

To find out, we need to check the transaction hash on Vara explorer.

## Immediate Actions Required

### 1. Check Transaction on Explorer
Go to https://idea.gear-tech.io/ and search for your wallet address to see the failed transactions.

### 2. Do NOT Attempt More Deposits
The bug will cause you to lose more tokens.

### 3. Possible Solutions

#### Option A: Fix the Race Condition (Quick Fix)
Add a delay between approval and deposit in the frontend:
```typescript
await handleApprove();
await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
await handleDeposit();
```

#### Option B: Check Allowance Before Deposit (Better Fix)
```typescript
const allowance = await api.tokens.allowance(token, wallet, vaultAddress);
if (BigInt(allowance.allowanceRaw) < BigInt(amountRaw)) {
  await handleApprove();
  await new Promise(resolve => setTimeout(resolve, 10000));
}
await handleDeposit();
```

#### Option C: Change Vault Contract to Use Transfer (Best Fix)
Instead of `TransferFrom`, the user should call `Transfer` directly on the VFT token to send tokens to the vault, then the vault credits them. This requires a 2-step process:
1. User calls `VFT.Transfer(vault, amount)`
2. Vault detects incoming transfer and credits the user's balance

This is more complex but eliminates the approval step entirely.

## Testing Plan

1. **Get new test tokens** from faucet
2. **Implement Option B** (check allowance before deposit)
3. **Test with small amount** (1 USDC)
4. **Verify vault balance** increases
5. **Test stream creation** with deposited tokens
6. **Test withdraw** from stream

## Recovery Steps

1. Check if tokens can be recovered from the VFT contract
2. If not, get new tokens from faucet:
   - WUSDC faucet: [link needed]
   - WBTC faucet: [link needed]

## Prevention

- Add allowance check before every deposit
- Add confirmation wait time after approval
- Add better error messages in the UI
- Consider redesigning the vault to use direct transfers instead of TransferFrom

## Files to Modify

### Frontend Fix (Option B)
- `frontend/components/v3/VaultDashboard.tsx` — Add allowance check before deposit
- `frontend/hooks/useTokens.ts` — Add `useTokenAllowance` hook

### Contract Fix (Option C - if needed)
- `contracts/token-vault/src/lib.rs` — Change deposit mechanism
- Requires redeployment and migration

## Next Steps

1. **STOP** attempting deposits immediately
2. Check transaction history on Vara explorer
3. Implement allowance check (Option B)
4. Get new test tokens
5. Test with 1 USDC first
6. Document the fix

---

**Status:** Awaiting user confirmation to proceed with fix implementation.

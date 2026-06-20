# Analytics Enhancement TODO List

## Completed Tasks

- [x] Review current database schema for event tables (stream_events, vault_events, bridge_transactions)
- [x] Create migration to add missing on-chain fields (block_number, tx_timestamp, from_address, to_address, gas_used, gas_price, status)
- [x] Restart backend to trigger migration and verify it runs successfully
- [x] Update event logging functions to capture complete on-chain transaction data
- [x] Fix explorer links to use extrinsic_hash instead of block_hash (Gear explorer requires transaction hash)
- [x] Fix token symbol resolution in /transactions endpoint (zero-address symbols instead of actual symbols)

## Priority-Based Tasks for Real-Time Analytics

### Priority 1: Fix Explorer Links for New Transactions
- [x] Update streams.mjs route handlers to pass txHash as extrinsicHash to logStreamEvent
- [x] Update vault.mjs route handlers to pass txHash as extrinsicHash to logVaultEvent
- [x] Update liquidation.mjs to pass txHash as extrinsicHash
- [ ] Test new transactions have working explorer links

### Priority 2: Fix TVL Balance Queries
- [x] Investigate Gear API error: "Failed to get last message from the queue" - Root cause: Alice fallback account doesn't exist on mainnet
- [x] Fix token balance queries in token-service.mjs - Replaced Alice fallback with real keyring address
- [x] Implement indexed-events TVL calculation (robust fallback) - Added getIndexedTvl() function
- [x] Restart API server to pick up indexed-events TVL changes
- [x] Verify TVL calculations work correctly after restart - TVL now returns $5 USD with real-time pricing
- [x] Test /tvl endpoint returns accurate data - Using indexed-events with CoinGecko prices

### Priority 3: Add Real-Time Pricing
- [x] Integrate price feed API (CoinGecko) - Created price-service.mjs
- [x] Update token configuration with price sources - Added priceSource and coingeckoId to tokens
- [x] Modify TVL and volume calculations to use real-time prices - Updated analytics-service.mjs
- [ ] Test USD calculations for volatile tokens

### Priority 4: Enable Event Indexer
- [ ] Research Gear API event subscription methods
- [ ] Implement event subscription for StreamCore and TokenVault contracts
- [ ] Test event indexer captures all on-chain events
- [ ] Enable indexer in production

### Priority 5: Data Quality
- [x] Clean up XSS injection test data from users table - Cleaned 37 users with XSS content
- [x] Add input validation to prevent XSS injection in wallet addresses - Enhanced validation.mjs with XSS detection

## Notes

### Database Schema Updates
The following fields have been added to event tables:
- `block_number` - Block number where transaction was included
- `tx_timestamp` - Actual blockchain timestamp of the transaction
- `from_address` - Standardized sender address field
- `to_address` - Standardized receiver address field
- `gas_used` - Gas consumed by the transaction
- `gas_price` - Gas price used for the transaction
- `chain_id` - Chain identifier (for multi-chain support)
- `tx_status` - Transaction status (pending, confirmed, failed)

### Explorer Links
- Explorer links now use `extrinsic_hash` (transaction hash) instead of `block_hash`
- Existing transactions may not have `extrinsic_hash` populated
- New API-initiated transactions will have working explorer links once route handlers are updated to pass transaction hash

### Event Indexer Status
- **Status: DISABLED**
- The event indexer subscribes to on-chain events from Gear API
- Currently disabled because Gear API event subscription requires further research
- When enabled, it will capture all on-chain transactions including those that bypass the API

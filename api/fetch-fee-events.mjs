#!/usr/bin/env node
// Script to calculate fees from FeeCollected events using IDEA Explorer API
// This fetches events from the explorer and sums the fee amounts

const GVARA_PROGRAM_ID = '0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee';
const EXPLORER_API = 'https://explorer-idea.gear-tech.io/api';
const GENESIS = '0xfe1b4c55fd4d668101126434206571a7838a8b6b93a6d1b95d607e78e6c53763';

// Function to decode u128 from SCALE-encoded bytes (little-endian)
function decodeU128LE(bytes, offset) {
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value += BigInt(bytes[offset + i]) << (BigInt(i) * 8n);
  }
  return value;
}

// Function to decode FeeCollected event from raw payload
function decodeFeeCollectedEvent(payloadHex) {
  try {
    // Remove 0x prefix
    const hex = payloadHex.startsWith('0x') ? payloadHex.slice(2) : payloadHex;
    const bytes = Buffer.from(hex, 'hex');

    // Find "FeeCollected" marker in the payload
    const marker = Buffer.from('FeeCollected');
    const idx = bytes.indexOf(marker);

    if (idx === -1) {
      return null;
    }

    // Structure: "SuperTokenService" + "FeeCollected" + payer (32) + amount (16) + treasury (32)
    // After "FeeCollected" marker, skip 32 bytes (payer) to get to amount
    const amountOffset = idx + marker.length + 32;
    const amount = decodeU128LE(bytes, amountOffset);

    // Treasury is after amount (16 bytes)
    const treasuryOffset = amountOffset + 16;
    const treasury = '0x' + bytes.slice(treasuryOffset, treasuryOffset + 32).toString('hex');

    return { amount, treasury };
  } catch (err) {
    console.error('Failed to decode event:', err.message);
    return null;
  }
}

// Query events from explorer API
async function queryEventsFromExplorer(service = '', name = '', offset = 0) {
  const response = await fetch(EXPLORER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'event.all',
      params: {
        source: GVARA_PROGRAM_ID,
        service,
        name,
        offset,
        genesis: GENESIS
      }
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`API error: ${data.error.message}`);
  }

  return data.result;
}

// Main function to fetch and sum fees
async function fetchFeeEvents() {
  console.log('=== FeeCollected Events Query (Explorer API) ===\n');
  console.log('Program ID:', GVARA_PROGRAM_ID);
  console.log('API:', EXPLORER_API);
  console.log('');

  try {
    // Query all events from the program with pagination
    console.log('Fetching events from explorer...');
    let allEvents = [];
    let offset = 0;
    const batchSize = 20;
    let totalCount = 0;

    do {
      const result = await queryEventsFromExplorer('', '', offset);
      const events = result.result || [];
      totalCount = result.count || 0;

      allEvents = allEvents.concat(events);
      offset += batchSize;

      console.log(`Fetched ${events.length} events (total: ${allEvents.length}/${totalCount})`);

      if (events.length < batchSize) {
        break;
      }
    } while (allEvents.length < totalCount);

    console.log(`\nTotal events fetched: ${allEvents.length}`);
    console.log('');

    // Filter for FeeCollected events
    const feeEvents = allEvents.filter(
      e => e.service === 'SuperTokenService' && e.name === 'FeeCollected'
    );

    console.log(`FeeCollected events: ${feeEvents.length}`);
    console.log('');

    if (feeEvents.length === 0) {
      console.log('No FeeCollected events found.');
      return;
    }

    // Decode and sum fees
    let totalFees = 0n;
    const decodedEvents = [];

    for (const event of feeEvents) {
      const decoded = decodeFeeCollectedEvent(event.payload);
      if (decoded) {
        totalFees += decoded.amount;
        decodedEvents.push({
          blockNumber: event.blockNumber,
          timestamp: event.timestamp,
          amount: decoded.amount.toString(),
          treasury: decoded.treasury
        });
      }
    }

    // Display results
    console.log('=== Results ===');
    console.log('Total fees collected (raw):', totalFees.toString());

    // Convert to gVARA (12 decimals)
    const gvaraAmount = Number(totalFees) / 1e12;
    console.log('Total fees collected (gVARA):', gvaraAmount.toFixed(12));

    // Get VARA price for USD value
    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=vara-network&vs_currencies=usd');
      const priceData = await priceResponse.json();
      const varaPrice = priceData['vara-network']?.usd || 0;
      const usdValue = gvaraAmount * varaPrice;
      console.log('Total fees collected (USD):', `$${usdValue.toFixed(4)}`);
    } catch (err) {
      console.log('Could not fetch VARA price for USD conversion');
    }

    console.log('');

    // Show recent events
    console.log('=== Recent FeeCollected Events ===');
    const recentEvents = decodedEvents.slice(-10).reverse();
    recentEvents.forEach((evt, i) => {
      const amountGVARA = Number(evt.amount) / 1e12;
      console.log(`\nEvent ${i + 1}:`);
      console.log(`  Block: ${evt.blockNumber}`);
      console.log(`  Timestamp: ${evt.timestamp}`);
      console.log(`  Amount: ${amountGVARA.toFixed(12)} gVARA`);
      console.log(`  Treasury: ${evt.treasury}`);
    });

    console.log('\n=== Summary ===');
    console.log('This represents TOTAL FEES GENERATED (DeFiLlama KPI)');
    console.log('Not the treasury balance (which may have withdrawals/spending)');
    console.log('');
    console.log('For DeFiLlama adapter:');
    console.log('  dailyFees = sum(FeeCollected events during day)');
    console.log('  dailyRevenue = dailyFees');
    console.log('  totalFees = cumulative sum(FeeCollected)');
    console.log('');
    console.log('Note: This uses the explorer API which is indexed data.');
    console.log('For pure on-chain DeFiLlama submission, use block scanning instead.');

  } catch (error) {
    console.error('Error querying events:', error.message);
  }
}

// Run the script
fetchFeeEvents().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

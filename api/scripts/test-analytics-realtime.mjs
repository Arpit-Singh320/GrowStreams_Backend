#!/usr/bin/env node

/**
 * Real-Time Analytics Test Script
 * Tests complete analytics pipeline with mock Gear API calls
 * Uses unique data characteristics for easy cleanup
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Unique identifier for mock data - used for cleanup
const MOCK_PREFIX = 'TEST_MOCK_';
const MOCK_SIGNATURE = 'analytics_test_' + Date.now();

// Test configuration
const API_BASE = 'http://127.0.0.1:1337/api';
const TEST_CONFIG = {
  userCount: 5,
  streamsPerUser: 2,
  transactionsPerStream: 3,
  delayBetweenActions: 100, // ms
};

// Mock data storage for cleanup
const mockData = {
  users: [],
  streams: [],
  transactions: [],
};

/**
 * Generate unique mock wallet address
 */
function generateMockWallet(suffix) {
  const suffixHex = suffix.replace(/-/g, '').substring(0, 16);
  return `0x${MOCK_SIGNATURE}${suffixHex.padEnd(64 - MOCK_SIGNATURE.length, '0')}`;
}

/**
 * Generate unique mock user data
 */
function generateMockUser(index, referralCode = null) {
  const userId = `${MOCK_SIGNATURE}_user_${index}`;
  return {
    wallet: generateMockWallet(userId),
    github_handle: `${MOCK_PREFIX}github_${index}`,
    x_handle: `${MOCK_PREFIX}twitter_${index}`,
    display_name: `${MOCK_PREFIX}Test User ${index}`,
    referral_code: referralCode,
  };
}

/**
 * Create mock user via API
 */
async function createMockUser(userData) {
  try {
    const response = await fetch(`${API_BASE}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: userData.wallet,
        github_handle: userData.github_handle,
        x_handle: userData.x_handle,
        referral_code: userData.referral_code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`[test] User creation failed (may already exist): ${error.substring(0, 100)}`);
      return null;
    }

    const result = await response.json();
    console.log(`[test] Created mock user: ${userData.wallet.substring(0, 16)}...`);
    return result;
  } catch (error) {
    console.error(`[test] Error creating user:`, error.message);
    return null;
  }
}

/**
 * Create mock stream via API
 */
async function createMockStream(userWallet, receiver, token, flowRate, deposit) {
  try {
    const response = await fetch(`${API_BASE}/streams/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiver,
        token,
        flowRate,
        initialDeposit: deposit,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`[test] Stream creation failed: ${error}`);
      return null;
    }

    const result = await response.json();
    console.log(`[test] Created stream: ${result.streamId}`);
    return result;
  } catch (error) {
    console.error(`[test] Error creating stream:`, error.message);
    return null;
  }
}

/**
 * Make mock deposit via API
 */
async function makeMockDeposit(streamId, amount) {
  try {
    const response = await fetch(`${API_BASE}/streams/${streamId}/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`[test] Deposit failed: ${error}`);
      return null;
    }

    const result = await response.json();
    console.log(`[test] Made deposit: ${amount}`);
    return result;
  } catch (error) {
    console.error(`[test] Error making deposit:`, error.message);
    return null;
  }
}

/**
 * Get analytics summary
 */
async function getAnalyticsSummary() {
  try {
    const response = await fetch(`${API_BASE}/analytics/summary?days=30`);
    if (!response.ok) throw new Error('Analytics summary failed');
    return await response.json();
  } catch (error) {
    console.error('[test] Error getting analytics:', error.message);
    return null;
  }
}

/**
 * Get TVL data
 */
async function getTVL() {
  try {
    const response = await fetch(`${API_BASE}/analytics/tvl`);
    if (!response.ok) throw new Error('TVL endpoint failed');
    return await response.json();
  } catch (error) {
    console.error('[test] Error getting TVL:', error.message);
    return null;
  }
}

/**
 * Get recent transactions
 */
async function getRecentTransactions(limit = 10) {
  try {
    const response = await fetch(`${API_BASE}/analytics/transactions?limit=${limit}`);
    if (!response.ok) throw new Error('Transactions endpoint failed');
    return await response.json();
  } catch (error) {
    console.error('[test] Error getting transactions:', error.message);
    return null;
  }
}

/**
 * Get activity metrics
 */
async function getActivityMetrics() {
  try {
    const response = await fetch(`${API_BASE}/analytics/activity?days=30`);
    if (!response.ok) throw new Error('Activity endpoint failed');
    return await response.json();
  } catch (error) {
    console.error('[test] Error getting activity:', error.message);
    return null;
  }
}

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main test execution
 */
async function runTest() {
  console.log('='.repeat(60));
  console.log('REAL-TIME ANALYTICS TEST');
  console.log('Mock Signature:', MOCK_SIGNATURE);
  console.log('='.repeat(60));

  // Step 1: Create mock users
  console.log('\n[STEP 1] Creating mock users...');
  let firstUserReferralCode = null;

  for (let i = 0; i < TEST_CONFIG.userCount; i++) {
    const userData = generateMockUser(i, firstUserReferralCode);
    const user = await createMockUser(userData);
    if (user) {
      mockData.users.push(userData);
      // Store the first user's referral code for subsequent users
      if (i === 0 && user.referral_code) {
        firstUserReferralCode = user.referral_code;
      }
    }
    await delay(TEST_CONFIG.delayBetweenActions);
  }

  console.log(`[test] Created ${mockData.users.length} mock users`);

  // Step 2: Create mock streams
  console.log('\n[STEP 2] Creating mock streams...');
  for (const user of mockData.users) {
    for (let i = 0; i < TEST_CONFIG.streamsPerUser; i++) {
      const receiver = generateMockWallet(`${MOCK_SIGNATURE}_receiver_${user.wallet}_${i}`);
      const stream = await createMockStream(
        user.wallet,
        receiver,
        'WUSDC',
        '1000000', // 1 USDC per second
        '10000000000' // 10000 USDC initial deposit
      );
      if (stream) {
        mockData.streams.push({
          streamId: stream.streamId,
          sender: user.wallet,
          receiver,
        });
      }
      await delay(TEST_CONFIG.delayBetweenActions);
    }
  }

  console.log(`[test] Created ${mockData.streams.length} mock streams`);

  // Step 3: Make mock transactions
  console.log('\n[STEP 3] Making mock transactions...');
  for (const stream of mockData.streams) {
    for (let i = 0; i < TEST_CONFIG.transactionsPerStream; i++) {
      const deposit = await makeMockDeposit(stream.streamId, '1000000000'); // 1000 USDC
      if (deposit) {
        mockData.transactions.push({
          streamId: stream.streamId,
          amount: '1000000000',
        });
      }
      await delay(TEST_CONFIG.delayBetweenActions);
    }
  }

  console.log(`[test] Made ${mockData.transactions.length} mock transactions`);

  // Step 4: Check analytics endpoints
  console.log('\n[STEP 4] Checking analytics endpoints...');
  await delay(500); // Allow time for data to propagate

  const summary = await getAnalyticsSummary();
  if (summary) {
    console.log('[test] Analytics Summary:');
    console.log(`  - Total Streams: ${summary.protocol?.totalStreams || 'N/A'}`);
    console.log(`  - Active Streams: ${summary.protocol?.activeStreams || 'N/A'}`);
    console.log(`  - Total Users: ${summary.users?.totalRegistered || 'N/A'}`);
  }

  const tvl = await getTVL();
  if (tvl) {
    console.log('[test] TVL Data:');
    console.log(`  - Estimated USD: ${tvl.totals?.estimatedUsd || 'N/A'}`);
    console.log(`  - Token Count: ${tvl.tokens?.length || 'N/A'}`);
  }

  const transactions = await getRecentTransactions(5);
  if (transactions) {
    console.log('[test] Recent Transactions:');
    console.log(`  - Count: ${transactions.count || 'N/A'}`);
    console.log(`  - Available: ${transactions.available || 'N/A'}`);
  }

  const activity = await getActivityMetrics();
  if (activity) {
    console.log('[test] Activity Metrics:');
    console.log(`  - Transaction Count: ${activity.transactionCount || 'N/A'}`);
    console.log(`  - Unique Wallets: ${activity.uniqueWallets || 'N/A'}`);
  }

  // Step 5: Save mock data for cleanup
  console.log('\n[STEP 5] Saving mock data for cleanup...');
  const fs = await import('fs');
  const cleanupData = {
    signature: MOCK_SIGNATURE,
    prefix: MOCK_PREFIX,
    timestamp: Date.now(),
    users: mockData.users,
    streams: mockData.streams,
    transactions: mockData.transactions,
  };

  fs.writeFileSync(
    join(__dirname, 'mock-test-data.json'),
    JSON.stringify(cleanupData, null, 2)
  );
  console.log('[test] Mock data saved to mock-test-data.json');

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETED');
  console.log('='.repeat(60));
  console.log('\nTo clean up mock data, run:');
  console.log('  node cleanup-mock-data.mjs');
}

runTest().catch(console.error);

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const data = JSON.parse(
  fs.readFileSync(resolve(__dirname, '../db-audit-results.json'), 'utf8')
);

console.log('\n=== DATABASE TABLE SUMMARY ===\n');

const summary = {};

for (const [table, info] of Object.entries(data)) {
  summary[table] = {
    count: info.count,
    hasData: info.count > 0,
    sampleSize: info.sample ? info.sample.length : 0
  };
}

// Sort by count (descending)
const sortedTables = Object.entries(summary).sort((a, b) => b[1].count - a[1].count);

console.log('TABLE ROW COUNTS:');
console.log('==================');
sortedTables.forEach(([table, info]) => {
  console.log(`${table.padEnd(35)} ${info.count.toString().padStart(6)} rows`);
});

console.log('\n=== DATA CONSISTENCY ANALYSIS ===\n');

// Key relationships to check
console.log('RELATIONSHIP CHECKS:');
console.log('====================');

const participants = data.participants?.count || 0;
const users = data.users?.count || 0;
const contributions = data.contributions?.count || 0;
const xp_events = data.xp_events?.count || 0;
const quest_registrations = data.quest_registrations?.count || 0;
const quest_completions = data.quest_completions?.count || 0;
const seeds_ledger = data.seeds_ledger?.count || 0;
const campaigns = data.campaigns?.count || 0;
const campaign_participants = data.campaign_participants?.count || 0;
const campaign_payouts = data.campaign_payouts?.count || 0;
const stream_events = data.stream_events?.count || 0;
const vault_events = data.vault_events?.count || 0;
const bridge_transactions = data.bridge_transactions?.count || 0;
const analytics_protocol_snapshots = data.analytics_protocol_snapshots?.count || 0;
const analytics_tvl_snapshots = data.analytics_tvl_snapshots?.count || 0;

console.log(`participants: ${participants} | users: ${users} | quest_registrations: ${quest_registrations}`);
console.log(`  → participants should map to users (user_id FK)`);
console.log(`  → quest_registrations is separate quest system`);
console.log('');

console.log(`contributions: ${contributions} | xp_events: ${xp_events}`);
console.log(`  → xp_events should be >= contributions (each contribution can have multiple XP events)`);
console.log(`  → Ratio: ${(xp_events / contributions).toFixed(2)} XP events per contribution`);
console.log('');

console.log(`quest_registrations: ${quest_registrations} | quest_completions: ${quest_completions} | seeds_ledger: ${seeds_ledger}`);
console.log(`  → quest_completions should be <= quest_registrations * avg_quests_per_user`);
console.log(`  → seeds_ledger tracks XP changes for quests`);
console.log('');

console.log(`campaigns: ${campaigns} | campaign_participants: ${campaign_participants} | campaign_payouts: ${campaign_payouts}`);
console.log(`  → campaign_participants should be >= campaigns (at least 1 per campaign)`);
console.log(`  → campaign_payouts should be <= campaign_participants`);
console.log('');

console.log(`stream_events: ${stream_events} | vault_events: ${vault_events} | bridge_transactions: ${bridge_transactions}`);
console.log(`  → These track on-chain activity`);
console.log('');

console.log(`analytics_protocol_snapshots: ${analytics_protocol_snapshots} | analytics_tvl_snapshots: ${analytics_tvl_snapshots}`);
console.log(`  → protocol snapshots should have multiple TVL snapshots per snapshot`);
console.log(`  → Ratio: ${(analytics_tvl_snapshots / analytics_protocol_snapshots).toFixed(2)} TVL snapshots per protocol snapshot`);
console.log('');

// Check for empty tables
console.log('EMPTY TABLES:');
console.log('=============');
const emptyTables = sortedTables.filter(([_, info]) => info.count === 0);
if (emptyTables.length > 0) {
  emptyTables.forEach(([table]) => console.log(`  - ${table}`));
} else {
  console.log('  None');
}

console.log('\n=== SAMPLE DATA INSPECTION ===\n');

// Check for critical data quality issues
console.log('DATA QUALITY CHECKS:');
console.log('====================');

// Check participants for XSS
const participantSample = data.participants?.sample || [];
const xssWallets = participantSample.filter(p => p.wallet && p.wallet.includes('<script'));
if (xssWallets.length > 0) {
  console.log('⚠️  WARNING: XSS injection detected in participants.wallet:');
  xssWallets.forEach(p => console.log(`    - ${p.wallet}`));
} else {
  console.log('✓ No XSS detected in participants.wallet');
}

// Check for null critical fields
const contributionsSample = data.contributions?.sample || [];
const nullCampaignIds = contributionsSample.filter(c => !c.campaign_id);
if (nullCampaignIds.length > 0) {
  console.log(`⚠️  WARNING: ${nullCampaignIds.length} contributions have null campaign_id`);
} else {
  console.log('✓ All contributions have campaign_id');
}

// Check stream_events for extrinsic_hash
const streamEventsSample = data.stream_events?.sample || [];
const hasExtrinsicHash = streamEventsSample.some(e => e.extrinsic_hash);
if (hasExtrinsicHash) {
  console.log('✓ stream_events has extrinsic_hash column populated');
} else {
  console.log('⚠️  WARNING: stream_events missing extrinsic_hash (needed for explorer links)');
}

// Check vault_events for extrinsic_hash
const vaultEventsSample = data.vault_events?.sample || [];
const hasVaultExtrinsicHash = vaultEventsSample.some(e => e.extrinsic_hash);
if (hasVaultExtrinsicHash) {
  console.log('✓ vault_events has extrinsic_hash column populated');
} else {
  console.log('⚠️  WARNING: vault_events missing extrinsic_hash (needed for explorer links)');
}

console.log('\n=== ANALYTICS DATA AVAILABILITY ===\n');

console.log('ANALYTICS-ENDPOINT RELEVANT TABLES:');
console.log('===================================');
console.log(`stream_events: ${stream_events} rows - Used for transaction history`);
console.log(`vault_events: ${vault_events} rows - Used for transaction history`);
console.log(`bridge_transactions: ${bridge_transactions} rows - Used for volume metrics`);
console.log(`analytics_protocol_snapshots: ${analytics_protocol_snapshots} rows - Used for KPIs`);
console.log(`analytics_tvl_snapshots: ${analytics_tvl_snapshots} rows - Used for TVL breakdown`);

console.log('\nNON-ANALYTICS TABLES (potential for new endpoints):');
console.log('===================================================');
console.log(`participants: ${participants} rows - Contributor analytics`);
console.log(`contributions: ${contributions} rows - Contribution analytics`);
console.log(`xp_events: ${xp_events} rows - XP distribution analytics`);
console.log(`quest_registrations: ${quest_registrations} rows - Quest engagement`);
console.log(`quest_completions: ${quest_completions} rows - Quest completion metrics`);
console.log(`seeds_ledger: ${seeds_ledger} rows - Seeds/XP ledger`);
console.log(`campaigns: ${campaigns} rows - Campaign funding analytics`);
console.log(`campaign_participants: ${campaign_participants} rows - Campaign enrollment`);
console.log(`campaign_payouts: ${campaign_payouts} rows - Payout execution`);
console.log(`users: ${users} rows - User/referral analytics`);
console.log(`referrals: ${data.referrals?.count || 0} rows - Referral tracking`);
console.log(`evm_streams: ${data.evm_streams?.count || 0} rows - EVM stream analytics`);
console.log(`seasons: ${data.seasons?.count || 0} rows - Seasonal analytics`);

fs.writeFileSync(
  resolve(__dirname, '../db-summary-report.txt'),
  JSON.stringify(summary, null, 2)
);

console.log('\n[summary] Report saved to db-summary-report.txt');

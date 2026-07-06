#!/usr/bin/env node

import { execSync } from 'child_process';

const BASE_URL = process.env.ANALYTICS_BASE_URL || 'http://127.0.0.1:1337/api/analytics';

// `desc` documents what each endpoint is for so this audit doubles as a
// frontend integration reference.
const ENDPOINTS = [
  { path: '/summary?days=30', name: 'summary',
    desc: 'Master dashboard payload. Sections: onchain{} (TVL, streams, volume, combined DAU/MAU/wallets), platform{} (users across both registration systems, quests, campaigns, engagement, seasons, evmStreams), kpis{} (flat headline numbers), freshness{}, coverage{}. Flat fields (tvl/activity/users/quests/...) are kept as backward-compatible aliases.' },
  { path: '/tvl', name: 'tvl',
    desc: 'Live on-chain TVL. totals.estimatedUsd + per-token rows (balanceDisplay, price, pricingSource, deployed, source). meta.tokensNotDeployedOnChain lists undeployed tokens. wVARA+gVARA+native VARA priced as vara-network.' },
  { path: '/defillama-tvl', name: 'defillama-tvl',
    desc: 'DeFiLlama-shaped TVL: balances keyed coingecko:id (raw, decimal-adjusted), excluded[] / unpriced[] arrays, timetravel:false, methodology. Consumed by the DeFiLlama TVL adapter.' },
  { path: '/onchain-streams', name: 'onchain-streams',
    desc: 'On-chain stream activity reconstructed from StreamCore state polling (contract emits no events). Streaming-specific (totalStreams, streamWallets, streamDau/Mau, totalVolumeUsd, byToken[]) PLUS on-chain XP/seeds activity (seedsActiveWalletsAllTime, seedsDau/Mau) PLUS combined exact-union (uniqueWallets, dau, mau). streamDataSource = stream_state_db | live_rpc_enumeration.' },
  { path: '/defillama-volume', name: 'defillama-volume',
    desc: 'DeFiLlama-shaped streaming volume: cumulative volume keyed coingecko:id (raw token units), totalVolumeUsd, timetravel:false, methodology. Consumed by the DeFiLlama volume (dimension) adapter.' },
  { path: '/activity?days=30', name: 'activity',
    desc: 'Backend-logged + state-derived activity window. transactionCount, uniqueWallets (window), activeWalletsAllTime, registeredUsers, dau, volumeUsd{last24h/7d/30d}. Source label indicates on_chain vs backend fallback.' },
  { path: '/history?hours=168', name: 'history',
    desc: 'Hourly protocol snapshots time-series (TVL, streams, observed activity) from analytics_protocol_snapshots.' },
  { path: '/tvl-history?days=30', name: 'tvl-history',
    desc: 'Daily TVL series for the dashboard chart (tvl_usd, stablecoin_tvl_usd, snapped_at).' },
  { path: '/activity-history?days=30', name: 'activity-history',
    desc: 'Daily on-chain activity series for dashboard graphs: onchain_volume_usd, onchain_unique_wallets, onchain_dau, onchain_mau, seeds_active_wallets, stream_wallets, total_streams. From analytics_protocol_snapshots.' },
  { path: '/volume-history?days=30', name: 'volume-history',
    desc: 'Daily volume series (points[] of date + volumeUsd) with source/coverage labels.' },
  { path: '/contracts', name: 'contracts',
    desc: 'Resolved program IDs for the core contracts (streamCore, tokenVault, growToken, ...).' },
  { path: '/explorer-links', name: 'explorer-links',
    desc: 'Explorer URLs per contract (idea.gear-tech.io) for the dashboard contract links section.' },
  { path: '/transactions?limit=10&offset=0', name: 'transactions',
    desc: 'Recent transactions feed across stream/vault/bridge/XP-mint sources, each with on-chain explorerUrl (idea.gear-tech.io). On-chain XP mints (seeds_ledger, source:xp_mint) are included with verifiable tx hashes. Server-side pagination: limit + offset + total + hasMore.' },
  { path: '/wallets?limit=10&offset=0', name: 'wallets',
    desc: 'Active wallets list (wallet, handles, stream/vault/bridge counts, lastActivity), test/QA accounts excluded. Server-side pagination: limit + offset + total + hasMore.' },
];

function fetchEndpoint(endpoint) {
  try {
    const url = `${BASE_URL}${endpoint.path}`;
    const response = execSync(`curl -sS -w '\\n%{http_code}' '${url}'`, { encoding: 'utf-8' });
    const lines = response.trim().split('\n');
    const statusCode = lines.pop();
    const body = lines.join('\n');

    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      json = null;
    }

    return {
      endpoint: endpoint.path,
      name: endpoint.name,
      desc: endpoint.desc,
      status: statusCode,
      body,
      json,
    };
  } catch (error) {
    return {
      endpoint: endpoint.path,
      name: endpoint.name,
      desc: endpoint.desc,
      status: 'ERROR',
      body: error.message,
      json: null,
    };
  }
}

function generateMarkdown(results) {
  const timestamp = new Date().toISOString();
  let markdown = `# Analytics Endpoint Audit

- Generated: **${timestamp}**
- Base URL: \`${BASE_URL}\`
- Endpoint count: **${results.length}**

This file captures raw backend \`/api/analytics\` responses for quality analysis
and frontend integration. Each section documents what the endpoint provides.

`;

  for (const result of results) {
    markdown += `## \`${result.endpoint}\`

${result.desc ? `> ${result.desc}\n\n` : ''}\`\`\`bash
curl -sS '${BASE_URL}${result.endpoint}'
\`\`\`

- Status: **\`${result.status}\`**

`;
    if (result.json) {
      markdown += `\`\`\`json
${JSON.stringify(result.json, null, 2)}
\`\`\`

`;
    } else {
      markdown += `\`\`\`
${result.body}
\`\`\`

`;
    }
  }

  return markdown;
}

async function main() {
  console.log('[audit] Starting analytics endpoint audit...');

  const results = [];
  for (const endpoint of ENDPOINTS) {
    console.log(`[audit] Fetching ${endpoint.path}...`);
    const result = fetchEndpoint(endpoint);
    results.push(result);
  }

  const markdown = generateMarkdown(results);

  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outputPath = path.join(__dirname, '../docs/analytics-endpoint-audit.md');

  fs.writeFileSync(outputPath, markdown, 'utf-8');
  console.log(`[audit] Results written to ${outputPath}`);
  console.log('[audit] Done');
}

main().catch(console.error);

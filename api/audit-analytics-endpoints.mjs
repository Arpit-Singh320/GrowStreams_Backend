#!/usr/bin/env node

import { execSync } from 'child_process';

const BASE_URL = 'http://127.0.0.1:1337/api/analytics';
const ENDPOINTS = [
  { path: '/summary?days=30', name: 'summary' },
  { path: '/tvl', name: 'tvl' },
  { path: '/activity?days=30', name: 'activity' },
  { path: '/history?hours=168', name: 'history' },
  { path: '/tvl-history?days=30', name: 'tvl-history' },
  { path: '/volume-history?days=30', name: 'volume-history' },
  { path: '/contracts', name: 'contracts' },
  { path: '/explorer-links', name: 'explorer-links' },
  { path: '/transactions?limit=10', name: 'transactions' },
  { path: '/wallets?limit=10', name: 'wallets' },
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
      status: statusCode,
      body,
      json,
    };
  } catch (error) {
    return {
      endpoint: endpoint.path,
      name: endpoint.name,
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

This file captures raw backend \`/api/analytics\` responses for quality analysis.

`;

  for (const result of results) {
    markdown += `## \`${result.endpoint}\`

\`\`\`bash
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
  const outputPath = path.join(__dirname, '../analytics-endpoint-audit.md');
  
  fs.writeFileSync(outputPath, markdown, 'utf-8');
  console.log(`[audit] Results written to ${outputPath}`);
  console.log('[audit] Done');
}

main().catch(console.error);

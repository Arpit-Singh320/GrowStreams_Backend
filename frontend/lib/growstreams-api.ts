const API_BASE = (process.env.NEXT_PUBLIC_GROWSTREAMS_API || 'http://localhost:1337').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Connected-wallet holder.
//
// Routes guarded by `requireAuth` on the backend need the caller's wallet, sent
// either in the body or as an `x-wallet` header. Rather than thread the wallet
// through every authed call site, we keep the connected wallet here and inject
// it as `x-wallet` on every request. `setApiWallet()` is called whenever the
// wallet connection changes (see ApiWalletSync in components/providers.tsx).
// ---------------------------------------------------------------------------
let currentWallet: string | null = null;

export function setApiWallet(wallet: string | null): void {
  currentWallet = wallet && wallet.startsWith('0x') ? wallet : null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(currentWallet ? { 'x-wallet': currentWallet } : {}),
      ...options?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

// Local proxy for analytics to avoid external API issues
async function localRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

function authedRequest<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  return request<T>(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
}

function get<T>(path: string) {
  return request<T>(path);
}

function post<T>(path: string, body?: Record<string, unknown>) {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

function put<T>(path: string, body: Record<string, unknown>) {
  return request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

function patch<T>(path: string, body: Record<string, unknown>) {
  return request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function del<T>(path: string) {
  return request<T>(path, { method: 'DELETE' });
}

export interface HealthData {
  status: string;
  network: string;
  account: string;
  balance: string;
  contracts: Record<string, string | null>;
  uptime: number;
}

export interface StreamConfig {
  admin: string;
  min_buffer_seconds: number;
  next_stream_id: number;
  token_vault: string;
}

export interface TokenMeta {
  key: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  category?: string;
  isStablecoin?: boolean;
}

export interface StreamData {
  id: number;
  sender: string;
  receiver: string;
  token: string;
  flow_rate: string;
  start_time: number;
  last_update: number;
  deposited: string;
  withdrawn: string;
  streamed: string;
  status: string;
  tokenMeta?: TokenMeta;
  flowRateDisplay?: string;
  flowRatePerMonth?: string;
  depositDisplay?: string;
}

export interface VaultBalance {
  owner: string;
  token: string;
  total_deposited: string;
  total_allocated: string;
  available: string;
  tokenMeta?: TokenMeta;
  total_deposited_display?: string;
  total_allocated_display?: string;
  available_display?: string;
}

export interface MultiTokenBalance {
  key: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  category?: string;
  isStablecoin?: boolean;
  total_deposited: string;
  total_allocated: string;
  available: string;
  total_deposited_display: string;
  total_allocated_display: string;
  available_display: string;
  error?: string;
}

export interface TokenInfo {
  key: string;
  symbol: string;
  name: string;
  decimals: number;
  vara: string;
  eth: string | null;
  icon: string;
  category: string;
  isStablecoin: boolean;
  minBuffer: number;
}

export interface WalletBalance {
  key: string;
  symbol: string;
  name: string;
  icon: string;
  balance: string;
  balanceRaw: string;
  decimals: number;
  category?: string;
  isStablecoin?: boolean;
  vara?: string;
  eth?: string | null;
  error?: string;
}

export interface StreamEvent {
  id: number;
  stream_id: string;
  event_type: string;
  sender: string | null;
  receiver: string | null;
  token_address: string | null;
  token_symbol: string | null;
  flow_rate: string | null;
  amount: string | null;
  block_hash: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  tokenMeta?: TokenMeta;
  amountDisplay?: string;
  flowRateDisplay?: string;
  flowRatePerMonth?: string;
}

export interface StreamStats {
  wallet: string;
  totalStreamsCreated: number;
  tokens: {
    symbol: string;
    tokenAddress: string;
    activeStreams?: number;
    totalDeposited?: string;
    totalDepositedDisplay?: string;
    totalWithdrawn?: string;
    totalWithdrawnDisplay?: string;
    decimals?: number;
  }[];
}

export interface SplitGroup {
  id: number;
  owner: string;
  recipients: { address: string; weight: number }[];
  total_weight: number;
}

export interface BountyData {
  id: number;
  title: string;
  creator: string;
  token: string;
  max_flow_rate: string;
  min_score: number;
  total_budget: string;
  status: string;
}

export interface BindingData {
  actor_id: string;
  github_username_hash: string;
  verified_at: number;
  proof_hash: string;
  score: number;
  updated_at: number;
}

export interface BridgeRoute {
  token: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  category: string;
  isStablecoin: boolean;
  source: {
    chain: string;
    chainName: string;
    address: string;
    explorer?: string;
  };
  destination: {
    chain: string;
    chainName: string;
    address: string;
    explorer?: string;
  };
  bidirectional: boolean;
}

export interface BridgeInfo {
  supported: boolean;
  version: string;
  chains: {
    ethereum: { name: string; chainId: number; explorer: string; bridgeContract: string; blockTime: number };
    vara: { name: string; chainId: string; explorer: string; bridgeContract: string; blockTime: number };
  };
  routes: BridgeRoute[];
  routeCount: number;
  fees: { percentBps: number; percentDisplay: string; minBps: number; maxBps: number };
  timing: { estimatedMinutes: number; minConfirmations: number; maxConfirmations: number };
  faucets: { vara: string; holesky: string };
  guides: { bridging: string; testnetTokens: string };
}

export interface BridgeFeeEstimate {
  token: string;
  amount: string;
  amountRaw: string;
  fee: string;
  feeRaw: string;
  feePercent: string;
  netAmount: string;
  netAmountRaw: string;
  direction: string;
  estimatedTimeMinutes: number;
  estimatedConfirmations: number;
}

export interface BridgeTransaction {
  id: number;
  wallet: string;
  token_symbol: string;
  token_key: string;
  amount: string;
  amount_raw: string;
  direction: 'ethToVara' | 'varaToEth';
  source_tx_hash: string | null;
  destination_tx_hash: string | null;
  source_chain: string;
  destination_chain: string;
  fee: string;
  fee_raw: string;
  status: 'initiated' | 'source_confirmed' | 'bridging' | 'destination_confirmed' | 'completed' | 'failed';
  confirmations: number;
  error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  tokenMeta?: TokenMeta;
}

export interface BridgeStats {
  wallet: string;
  totalBridges: number;
  completed: number;
  failed: number;
  pending: number;
}

export interface TxResult {
  result?: unknown;
  blockHash: string;
}

export interface PayloadResult {
  payload: string;
  value?: string;
}

export interface AnalyticsContracts {
  streamCore: string | null;
  tokenVault: string | null;
  growToken: string | null;
  splitsRouter?: string | null;
  distributionPool?: string | null;
  liquidationManager?: string | null;
}

export interface AnalyticsExplorerLink {
  key: string;
  name: string;
  address: string | null;
  explorerUrl: string | null;
  network: string;
}

export interface AnalyticsTvlToken {
  key: string;
  symbol: string;
  name: string;
  address: string | null;
  category: string;
  isStablecoin: boolean;
  decimals: number;
  balanceRaw: string;
  balanceDisplay: string;
  estimatedUsd: number | null;
  pricingSource: string | null;
  error?: string;
}

export interface AnalyticsTvlResponse {
  vaultAddress: string;
  pricing: {
    source: string;
    coverage: string;
  };
  totals: {
    estimatedUsd: number;
    estimatedStablecoinUsd: number;
  };
  tokens: AnalyticsTvlToken[];
}

export interface AnalyticsActivityResponse {
  available: boolean;
  windowDays: number;
  source: string;
  capturesPayloadSignedTransactions: boolean;
  transactionCount: number;
  streamEventCount: number;
  vaultEventCount: number;
  bridgeTransactionCount?: number;
  uniqueWallets: number;
  observedWithdrawVolumeUsd: number;
  volumeUsd?: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
  dau?: number;
  totalTransactions?: number;
  uniqueWalletsAllTime?: number;
  lastObservedActivityAt: string | null;
  lastUpdatedAt?: string | null;
}

export interface AnalyticsHistoryPoint {
  snapped_at: string;
  estimated_tvl_usd: string | number;
  estimated_stablecoin_tvl_usd: string | number;
  total_streams: number;
  active_streams: number;
  observed_stream_event_count: number;
  observed_vault_event_count: number;
  observed_unique_wallets: number;
  observed_withdraw_volume_usd: string | number;
  observed_window_days: number;
  observed_volume_source: string;
  volume_24h_usd?: string | number;
  volume_7d_usd?: string | number;
  volume_30d_usd?: string | number;
  dau?: number;
  total_transactions?: number;
  unique_wallets_all_time?: number;
  last_activity_at?: string | null;
  last_updated_at?: string | null;
}

export interface AnalyticsTvlHistoryPoint {
  date: string;
  tvl_usd: string | number;
  stablecoin_tvl_usd: string | number;
  snapped_at: string;
}

export interface AnalyticsVolumeHistoryPoint {
  date: string;
  volumeUsd: number;
}

export interface AnalyticsSummaryResponse {
  generatedAt: string;
  contracts: AnalyticsContracts;
  explorerLinks?: AnalyticsExplorerLink[];
  protocol: {
    totalStreams: number;
    activeStreams: number;
  };
  tvl: AnalyticsTvlResponse;
  activity: AnalyticsActivityResponse;
  users?: {
    totalRegistered: number;
    available: boolean;
  };
  quests?: {
    registrations: number;
    completions: number;
    seedsDistributed: number;
    available: boolean;
  };
  contributors?: {
    participants: number;
    contributions: number;
    xpEvents: number;
    available: boolean;
  };
  campaigns?: {
    participants: number;
    payouts: number;
    available: boolean;
  };
  onchain?: {
    fees?: AnalyticsFeesResponse;
    retention?: AnalyticsRetentionResponse;
    [key: string]: unknown;
  };
  kpis?: {
    tvlUsd: number;
    protocolFeesUsd?: number;
    protocolFees24hUsd?: number;
    protocolFees30dUsd?: number;
    retentionRate?: number;
    volumeUsd: {
      last24h: number;
      last7d: number;
      last30d: number;
    };
    dau: number;
    totalTransactions: number;
    uniqueWalletsAllTime: number;
    totalRegisteredUsers?: number;
    questRegistrations?: number;
    questCompletions?: number;
    contributorCount?: number;
  };
  freshness?: {
    lastUpdatedAt: string | null;
    lastSnapshotAt: string | null;
    lastEventAt: string | null;
    snapshotAgeSeconds: number | null;
    isStale: boolean;
    indexerRunning: boolean;
  };
  coverage: {
    tvlSource: string;
    streamCountsSource: string;
    activitySource?: string;
    usersSource?: string;
    notes: string[];
  };
}

export interface AnalyticsFeesResponse {
  available: boolean;
  windowDays: number;
  source: string;
  feeBps?: number;
  feePercent?: number;
  totalFeesUsd: number;
  last24hUsd: number;
  last7dUsd: number;
  last30dUsd: number;
  byToken: Array<{
    symbol: string;
    amountRaw: string;
    amountDisplay: string;
    price: number;
    feesUsd: number;
  }>;
  note?: string;
}

export interface AnalyticsRetentionResponse {
  available: boolean;
  windowDays: number;
  source?: string;
  retentionRate: number;
  cohortWallets?: number;
  retainedWallets?: number;
  cohorts: Array<{
    cohortWeek: string;
    cohortSize: number;
    retainedCount: number;
    retentionRate: number;
  }>;
  note?: string;
}

// ---------------------------------------------------------------------------
// Multi-Campaign types
// ---------------------------------------------------------------------------
export interface Campaign {
  id: string;
  creator_wallet: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'FUNDED' | 'ACTIVE' | 'ENDED' | 'SETTLING' | 'CLOSED';
  pool_amount: string;
  pool_remaining: string;
  token: string;
  track_type: 'OSS' | 'CONTENT' | 'BOTH';
  start_date: string;
  end_date: string;
  ended_at: string | null;
  funding_tx_hash: string | null;
  required_hashtags: string[];
  required_mentions: string[];
  github_repo_url: string | null;
  github_issue_labels: string[];
  max_oss_contributions: number | null;
  max_content_contributions: number | null;
  score_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignParticipant {
  wallet: string;
  campaign_xp: number;
  enrolled_at: string;
}

export interface CampaignLeaderboardEntry {
  rank: number;
  wallet: string;
  campaign_xp: number;
  enrolled_at: string;
}

export interface CampaignPayoutEntry {
  wallet: string;
  xp_earned: number;
  xp_share: number;
  usdc_amount: number;
  status: string;
}

export interface UserCampaign {
  campaign_id: string;
  title: string;
  status: string;
  campaign_xp: number;
  enrolled_at: string;
  start_date: string;
  end_date: string;
  pool_amount: string;
}

// ─── Quest types (M1-beta: ported from Launch branch) ────────────────────────
export interface QuestData {
  id: number;
  slug: string;
  title: string;
  description: string;
  quest_type: string;
  seeds_reward: number;
  icon: string;
  repeatable: boolean;
  active: boolean;
  sort_order: number;
  completed?: boolean;
  completionCount?: number;
  totalEarned?: number;
  latestCompletion?: Record<string, unknown> | null;
  pendingSubmission?: {
    id: number;
    status: string;
    proof: Record<string, unknown> | null;
    created_at: string;
  } | null;
  rejectedSubmission?: {
    id: number;
    status: string;
    proof: Record<string, unknown> | null;
    created_at: string;
  } | null;
  meta?: Record<string, unknown> | null;
}

export interface QuestSubmission {
  id: number;
  wallet: string;
  quest_id: number;
  proof: Record<string, unknown> | null;
  created_at: string;
  quest_slug: string;
  quest_title: string;
  seeds_reward: number;
  email: string | null;
  x_username: string | null;
  github_username: string | null;
}

export interface QuestProgress {
  registered: boolean;
  registration?: Record<string, unknown>;
  totalSeeds?: number;
  questsCompleted?: number;
  questsTotal?: number;
  quests?: QuestData[];
  recentActivity?: Array<{
    id: number;
    wallet: string;
    delta: number;
    reason: string;
    quest_id: number;
    tx_hash: string | null;
    created_at: string;
    slug: string;
    quest_title: string;
  }>;
}

export const api = {
  health: () => get<HealthData>('/health'),

  analytics: {
    summary: (days = 30) => localRequest<AnalyticsSummaryResponse>(`/api/analytics/summary?days=${days}`),
    tvl: () => localRequest<AnalyticsTvlResponse>('/api/analytics/tvl'),
    activity: (days = 30) => localRequest<AnalyticsActivityResponse>(`/api/analytics/activity?days=${days}`),
    history: (hours = 24 * 7) => localRequest<{ available: boolean; lookbackHours: number; snapshots: AnalyticsHistoryPoint[] }>(`/api/analytics/history?hours=${hours}`),
    contracts: () => localRequest<AnalyticsContracts>('/api/analytics/contracts'),
    explorerLinks: () => localRequest<{ links: AnalyticsExplorerLink[]; count: number }>('/api/analytics/explorer-links'),
    snapshotGvaraSupply: () =>
      post<{ success: boolean; totalSupply?: string; reason?: string }>('/api/analytics/admin/snapshot-gvara-supply', {}),
    tvlHistory: (days = 30) => localRequest<{ available: boolean; lookbackDays: number; points: AnalyticsTvlHistoryPoint[] }>(`/api/analytics/tvl-history?days=${days}`),
    activityHistory: (days = 30) => localRequest<{ available: boolean; lookbackDays: number; points: any[] }>(`/api/analytics/activity-history?days=${days}`),
    volumeHistory: (days = 30) => localRequest<{ available: boolean; lookbackDays: number; source: string; coverage: string; points: AnalyticsVolumeHistoryPoint[] }>(`/api/analytics/volume-history?days=${days}`),
    onchainStreams: () => localRequest<any>('/api/analytics/onchain-streams'),
    defillamaTvl: () => localRequest<any>('/api/analytics/defillama-tvl'),
    defillamaVolume: () => localRequest<any>('/api/analytics/defillama-volume'),
    transactions: (limit = 50, offset = 0) => localRequest<{ available: boolean; transactions: any[]; count: number; total: number; offset: number; hasMore: boolean }>(`/api/analytics/transactions?limit=${limit}&offset=${offset}`),
    wallets: (limit = 50, offset = 0) => localRequest<{ available: boolean; wallets: any[]; count: number; total: number; offset: number; hasMore: boolean }>(`/api/analytics/wallets?limit=${limit}&offset=${offset}`),
    fees: (days = 30) => localRequest<AnalyticsFeesResponse>(`/api/analytics/fees?days=${days}`),
    retention: (days = 30) => localRequest<AnalyticsRetentionResponse>(`/api/analytics/retention?days=${days}`),
  },

  tokens: {
    list: () => get<{ tokens: TokenInfo[]; count: number }>('/api/tokens'),
    stablecoins: () => get<{ tokens: TokenInfo[]; count: number }>('/api/tokens/stablecoins'),
    addresses: () => get<{ tokens: Record<string, { vara: string; eth: string | null }>; contracts: Record<string, string> }>('/api/tokens/addresses'),
    get: (symbol: string) => get<TokenInfo>(`/api/tokens/${symbol}`),
    balance: (symbol: string, wallet: string) => get<{ wallet: string; symbol: string; balance: string; balanceRaw: string; decimals: number }>(`/api/tokens/${symbol}/balance/${wallet}`),
    allBalances: (wallet: string) => get<{ wallet: string; balances: WalletBalance[] }>(`/api/tokens/balances/${wallet}`),
    allowance: (symbol: string, owner: string, spender: string) =>
      get<{ owner: string; spender: string; symbol: string; allowance: string; allowanceRaw: string; decimals: number }>(`/api/tokens/${symbol}/allowance/${owner}/${spender}`),
    approve: (symbol: string, params: { spender: string; amount?: string; amountRaw?: string }) =>
      post<{ payload: string; programId: string; token: string; spender: string; amount: string }>(`/api/tokens/${symbol}/approve`, params as unknown as Record<string, unknown>),
    transfer: (symbol: string, params: { to: string; amount?: string; amountRaw?: string }) =>
      post<{ payload: string; programId: string; token: string; to: string; amount: string }>(`/api/tokens/${symbol}/transfer`, params as unknown as Record<string, unknown>),
    convert: (symbol: string, params: { amount: string; direction?: 'toBase' | 'toDisplay' }) =>
      post<Record<string, unknown>>(`/api/tokens/${symbol}/convert`, params as unknown as Record<string, unknown>),
    flowRate: (symbol: string, params: { amount: string; fromInterval?: string; toInterval?: string }) =>
      post<Record<string, unknown>>(`/api/tokens/${symbol}/flow-rate`, params as unknown as Record<string, unknown>),
    resolve: (symbol: string) => get<{ input: string; varaAddress: string; symbol: string | null; decimals: number | null }>(`/api/tokens/${symbol}/resolve`),
  },

  streams: {
    config: () => get<StreamConfig>('/api/streams/config'),
    total: () => get<{ total: string }>('/api/streams/total'),
    active: () => get<{ active: string }>('/api/streams/active'),
    get: (id: number) => get<StreamData>(`/api/streams/${id}`),
    bySender: (addr: string) => get<{ sender: string; streamIds: string[] }>(`/api/streams/sender/${addr}`),
    byReceiver: (addr: string) => get<{ receiver: string; streamIds: string[] }>(`/api/streams/receiver/${addr}`),
    balance: (id: number) => get<{ streamId: number; withdrawable: string }>(`/api/streams/${id}/balance`),
    buffer: (id: number) => get<{ streamId: number; remainingBuffer: string }>(`/api/streams/${id}/buffer`),
    history: (wallet: string, params?: { limit?: number; offset?: number; eventType?: string; token?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.eventType) q.set('eventType', params.eventType);
      if (params?.token) q.set('token', params.token);
      const qs = q.toString();
      return get<{ wallet: string; events: StreamEvent[]; total: number; limit: number; offset: number }>(`/api/streams/history/${wallet}${qs ? '?' + qs : ''}`);
    },
    stats: (wallet: string) => get<StreamStats>(`/api/streams/stats/${wallet}`),
    events: (streamId: string | number) => get<{ streamId: string; events: StreamEvent[]; count: number }>(`/api/streams/events/${streamId}`),

    create: (params: { receiver: string; token: string; flowRate: string; initialDeposit: string; mode?: string; raw?: boolean; flowRateInterval?: string }) =>
      post<TxResult | PayloadResult>('/api/streams', params as unknown as Record<string, unknown>),
    update: (id: number, params: { flowRate: string; mode?: string }) =>
      put<TxResult | PayloadResult>(`/api/streams/${id}`, params as unknown as Record<string, unknown>),
    pause: (id: number, mode?: string) =>
      post<TxResult | PayloadResult>(`/api/streams/${id}/pause`, mode ? { mode } : undefined),
    resume: (id: number, mode?: string) =>
      post<TxResult | PayloadResult>(`/api/streams/${id}/resume`, mode ? { mode } : undefined),
    deposit: (id: number, params: { amount: string; mode?: string }) =>
      post<TxResult | PayloadResult>(`/api/streams/${id}/deposit`, params as unknown as Record<string, unknown>),
    withdraw: (id: number, mode?: string) =>
      post<TxResult | PayloadResult>(`/api/streams/${id}/withdraw`, mode ? { mode } : undefined),
    stop: (id: number, mode?: string) =>
      post<TxResult | PayloadResult>(`/api/streams/${id}/stop`, mode ? { mode } : undefined),
    liquidate: (id: number, mode?: string) =>
      post<TxResult | PayloadResult>(`/api/streams/${id}/liquidate`, mode ? { mode } : undefined),
  },

  vault: {
    config: () => get<Record<string, unknown>>('/api/vault/config'),
    paused: () => get<{ paused: boolean }>('/api/vault/paused'),
    balance: (owner: string, token: string) => get<VaultBalance>(`/api/vault/balance/${owner}/${token}`),
    balances: (wallet: string) => get<{ wallet: string; balances: MultiTokenBalance[] }>(`/api/vault/balances/${wallet}`),
    allocation: (streamId: number) => get<{ streamId: number; allocated: string }>(`/api/vault/allocation/${streamId}`),
    history: (wallet: string, params?: { limit?: number; offset?: number; eventType?: string; token?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.eventType) q.set('eventType', params.eventType);
      if (params?.token) q.set('token', params.token);
      const qs = q.toString();
      return get<{ wallet: string; events: StreamEvent[]; total: number; limit: number; offset: number }>(`/api/vault/history/${wallet}${qs ? '?' + qs : ''}`);
    },

    deposit: (params: { token: string; amount?: string; amountRaw?: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/vault/deposit', params as unknown as Record<string, unknown>),
    withdraw: (params: { token: string; amount?: string; amountRaw?: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/vault/withdraw', params as unknown as Record<string, unknown>),
    depositNative: (params: { amount: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/vault/deposit-native', params as unknown as Record<string, unknown>),
    withdrawNative: (params: { amount: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/vault/withdraw-native', params as unknown as Record<string, unknown>),
    pause: (mode?: string) =>
      post<TxResult | PayloadResult>('/api/vault/pause', mode ? { mode } : undefined),
    unpause: (mode?: string) =>
      post<TxResult | PayloadResult>('/api/vault/unpause', mode ? { mode } : undefined),
  },

  splits: {
    config: () => get<Record<string, unknown>>('/api/splits/config'),
    total: () => get<{ total: string }>('/api/splits/total'),
    get: (id: number) => get<SplitGroup>(`/api/splits/${id}`),
    byOwner: (addr: string) => get<{ owner: string; groupIds: string[] }>(`/api/splits/owner/${addr}`),
    preview: (id: number, amount: string) => get<{ groupId: number; shares: unknown[] }>(`/api/splits/${id}/preview/${amount}`),

    create: (params: { recipients: { address: string; weight: number }[]; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/splits', params as unknown as Record<string, unknown>),
    update: (id: number, params: { recipients: { address: string; weight: number }[]; mode?: string }) =>
      put<TxResult | PayloadResult>(`/api/splits/${id}`, params as unknown as Record<string, unknown>),
    delete: (id: number) => del<TxResult>(`/api/splits/${id}`),
    distribute: (id: number, params: { token: string; amount: string; mode?: string }) =>
      post<TxResult | PayloadResult>(`/api/splits/${id}/distribute`, params as unknown as Record<string, unknown>),
  },

  permissions: {
    config: () => get<Record<string, unknown>>('/api/permissions/config'),
    total: () => get<{ total: string }>('/api/permissions/total'),
    check: (granter: string, grantee: string, scope: string) =>
      get<{ hasPermission: boolean }>(`/api/permissions/check/${granter}/${grantee}/${scope}`),
    byGranter: (addr: string) => get<{ permissions: unknown[] }>(`/api/permissions/granter/${addr}`),

    grant: (params: { grantee: string; scope: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/permissions/grant', params as unknown as Record<string, unknown>),
    revoke: (params: { grantee: string; scope: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/permissions/revoke', params as unknown as Record<string, unknown>),
  },

  bounty: {
    config: () => get<Record<string, unknown>>('/api/bounty/config'),
    total: () => get<{ total: string }>('/api/bounty/total'),
    open: () => get<{ bountyIds: string[] }>('/api/bounty/open'),
    get: (id: number) => get<BountyData>(`/api/bounty/${id}`),
    byCreator: (addr: string) => get<{ bountyIds: string[] }>(`/api/bounty/creator/${addr}`),
    byClaimer: (addr: string) => get<{ bountyIds: string[] }>(`/api/bounty/claimer/${addr}`),

    create: (params: { title: string; token: string; maxFlowRate: string; minScore: number; totalBudget: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/bounty', params as unknown as Record<string, unknown>),
    claim: (id: number, mode?: string) =>
      post<TxResult | PayloadResult>(`/api/bounty/${id}/claim`, mode ? { mode } : undefined),
    verify: (id: number, params: { claimer: string; score: number; mode?: string }) =>
      post<TxResult | PayloadResult>(`/api/bounty/${id}/verify`, params as unknown as Record<string, unknown>),
    complete: (id: number, mode?: string) =>
      post<TxResult | PayloadResult>(`/api/bounty/${id}/complete`, mode ? { mode } : undefined),
    cancel: (id: number, mode?: string) =>
      post<TxResult | PayloadResult>(`/api/bounty/${id}/cancel`, mode ? { mode } : undefined),
  },

  growToken: {
    meta: () => get<{ name: string; symbol: string; decimals: number; total_supply: string; admin: string; programId: string }>('/api/grow-token/meta'),
    balance: (account: string) => get<{ account: string; balance: string }>(`/api/grow-token/balance/${account}`),
    allowance: (owner: string, spender: string) => get<{ allowance: string }>(`/api/grow-token/allowance/${owner}/${spender}`),
    totalSupply: () => get<{ totalSupply: string }>('/api/grow-token/total-supply'),

    transfer: (params: { to: string; amount: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/grow-token/transfer', params as unknown as Record<string, unknown>),
    approve: (params: { spender: string; amount: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/grow-token/approve', params as unknown as Record<string, unknown>),
    transferFrom: (params: { from: string; to: string; amount: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/grow-token/transfer-from', params as unknown as Record<string, unknown>),
    mint: (params: { to: string; amount: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/grow-token/mint', params as unknown as Record<string, unknown>),
    burn: (params: { amount: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/grow-token/burn', params as unknown as Record<string, unknown>),

    faucet: (to: string) =>
      post<{ success: boolean; to: string; amount: string; amountHuman: string; blockHash: string }>('/api/grow-token/faucet', { to } as Record<string, unknown>),
    faucetConfig: () =>
      get<{ mode: string; amountPerMint: string; amountHuman: string; rateLimitSeconds: number }>('/api/grow-token/faucet/config'),

    adminInfo: () =>
      get<{ adminAddress: string | null; faucetMode: string; whitelistCount: number }>('/api/grow-token/admin/info'),
    getWhitelist: () =>
      get<{ mode: string; whitelist: string[] }>('/api/grow-token/admin/whitelist'),
    addToWhitelist: (address: string) =>
      post<{ added: string; total: number }>('/api/grow-token/admin/whitelist', { address } as Record<string, unknown>),
    removeFromWhitelist: (address: string) =>
      del<{ removed: string; total: number }>(`/api/grow-token/admin/whitelist/${address}`),
    setFaucetMode: (mode: string) =>
      post<{ mode: string }>('/api/grow-token/admin/faucet-mode', { mode } as Record<string, unknown>),
  },

  campaign: {
    register: (params: { wallet: string; github_handle?: string; x_handle?: string; track: string }) =>
      post<Record<string, unknown>>('/api/campaign/register', params as unknown as Record<string, unknown>),
    participant: (wallet: string) =>
      get<Record<string, unknown>>(`/api/campaign/participant/${wallet}`),
    config: () =>
      get<Record<string, unknown>>('/api/campaign/config'),
    leaderboard: (params?: { page?: number; limit?: number; track?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.track) q.set('track', params.track);
      const qs = q.toString();
      return get<Record<string, unknown>>(`/api/leaderboard${qs ? '?' + qs : ''}`);
    },
    leaderboardStats: () =>
      get<Record<string, unknown>>('/api/leaderboard/stats'),
    participantStats: (wallet: string) =>
      get<Record<string, unknown>>(`/api/leaderboard/${wallet}`),
  },

  bridge: {
    info: () => get<BridgeInfo>('/api/bridge/info'),
    routes: () => get<{ routes: BridgeRoute[]; count: number }>('/api/bridge/routes'),
    routeForToken: (token: string) => get<BridgeRoute>(`/api/bridge/routes/${token}`),
    estimate: (params: { token: string; amount: string; direction?: string }) =>
      post<BridgeFeeEstimate>('/api/bridge/estimate', params as unknown as Record<string, unknown>),
    initiate: (params: { wallet: string; token: string; amount: string; amountRaw?: string; direction?: string; sourceTxHash?: string; fee?: string; feeRaw?: string }) =>
      post<{ transaction: BridgeTransaction }>('/api/bridge/initiate', params as unknown as Record<string, unknown>),
    updateStatus: (id: number, params: { status: string; destinationTxHash?: string; confirmations?: number; error?: string }) =>
      put<{ transaction: BridgeTransaction }>(`/api/bridge/status/${id}`, params as unknown as Record<string, unknown>),
    getTransaction: (id: number) => get<{ transaction: BridgeTransaction }>(`/api/bridge/tx/${id}`),
    getByTxHash: (txHash: string) => get<{ transaction: BridgeTransaction }>(`/api/bridge/status/${txHash}`),
    history: (wallet: string, params?: { limit?: number; offset?: number; status?: string; token?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.status) q.set('status', params.status);
      if (params?.token) q.set('token', params.token);
      const qs = q.toString();
      return get<{ wallet: string; transactions: BridgeTransaction[]; total: number; limit: number; offset: number }>(`/api/bridge/history/${wallet}${qs ? '?' + qs : ''}`);
    },
    stats: (wallet: string) => get<BridgeStats>(`/api/bridge/stats/${wallet}`),
  },

  campaigns: {
    platformEscrow: () => get<{ ss58: string; actorId: string }>('/api/campaigns/platform-escrow'),
    list: (params?: { status?: string; track_type?: string; page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.track_type) q.set('track_type', params.track_type);
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return get<{ campaigns: Campaign[]; count: number; page: number; limit: number }>(`/api/campaigns${qs ? '?' + qs : ''}`);
    },
    active: () => get<{ campaigns: Campaign[]; count: number }>('/api/campaigns/active'),
    get: (id: string) => get<Campaign>(`/api/campaigns/${id}`),
    create: (params: Record<string, unknown>) =>
      post<Campaign>('/api/campaigns', params),
    fund: (id: string, params: { wallet: string; tx_hash?: string }) =>
      post<Campaign>(`/api/campaigns/${id}/fund`, params as unknown as Record<string, unknown>),
    enroll: (id: string, params: { wallet: string }) =>
      post<Record<string, unknown>>(`/api/campaigns/${id}/enroll`, params as unknown as Record<string, unknown>),
    leaderboard: (id: string, params?: { page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return get<{ campaign_id: string; leaderboard: CampaignLeaderboardEntry[]; total: number; page: number; limit: number }>(`/api/campaigns/${id}/leaderboard${qs ? '?' + qs : ''}`);
    },
    participants: (id: string, params?: { page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return get<{ campaign_id: string; participants: CampaignParticipant[]; total: number; page: number; limit: number }>(`/api/campaigns/${id}/participants${qs ? '?' + qs : ''}`);
    },
    payoutPreview: (id: string) =>
      get<{ campaign_id: string; pool_amount: number; total_xp: number; payouts: CampaignPayoutEntry[] }>(`/api/campaigns/${id}/payout-preview`),
    userCampaigns: (wallet: string) =>
      get<{ wallet: string; campaigns: UserCampaign[]; count: number }>(`/api/users/${wallet}/campaigns`),
  },

  identity: {
    config: () => get<{ oracle: string; total_bindings: number }>('/api/identity/config'),
    oracle: () => get<{ oracle: string }>('/api/identity/oracle'),
    total: () => get<{ total: string }>('/api/identity/total'),
    getBinding: (actorId: string) => get<BindingData>(`/api/identity/binding/${actorId}`),
    byGithub: (username: string) => get<{ actorId: string }>(`/api/identity/github/${username}`),

    bind: (params: { actorId: string; githubUsername: string; proofHash: string; score: number; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/identity/bind', params as unknown as Record<string, unknown>),
    revoke: (params: { actorId: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/identity/revoke', params as unknown as Record<string, unknown>),
    updateScore: (params: { actorId: string; newScore: number; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/identity/update-score', params as unknown as Record<string, unknown>),
  },

  // ─── Quests (M1-beta) ──────────────────────────────────────────────────────
  quests: {
    verifyInvite: (code: string) =>
      post<{ valid: boolean; message: string }>('/api/quests/verify-invite', { code } as Record<string, unknown>),
    sendOtp: (email: string) =>
      post<{ sent: boolean }>('/api/quests/otp/send', { email } as Record<string, unknown>),
    verifyOtp: (email: string, code: string) =>
      post<{ valid: boolean }>('/api/quests/otp/verify', { email, code } as Record<string, unknown>),
    register: (params: { wallet?: string; evm_address?: string; email: string; display_name: string; ref_code?: string; invite_code?: string }) =>
      post<{ message: string; registration: Record<string, unknown> }>('/api/quests/register', params as unknown as Record<string, unknown>),
    list: () =>
      get<{ quests: QuestData[] }>('/api/quests'),
    me: (wallet: string) =>
      get<QuestProgress>(`/api/quests/me?wallet=${wallet}`),
    seeds: (wallet: string) =>
      get<{ wallet: string; seeds: number }>(`/api/quests/seeds/${wallet}`),
    claim: (slug: string, wallet: string, payload?: { x_username?: string; tweet_url?: string; party_id?: string; contract_id?: string; partner_url?: string; image_data?: string; project_url?: string }) =>
      post<{ message: string; slug: string; wallet: string; status: string }>(
        `/api/quests/${slug}/claim`,
        { wallet, ...(payload || {}) } as Record<string, unknown>
      ),
    updateProfile: (wallet: string, display_name: string) =>
      patch<{ message: string; registration: Record<string, unknown> }>('/api/quests/profile', { wallet, display_name } as Record<string, unknown>),
    stats: () =>
      get<{ totalRegistered: number; totalCompletions: number; totalSeedsMinted: number }>('/api/quests/stats'),
    leaderboard: () =>
      get<{
        leaderboard: Array<{
          wallet: string;
          display_name: string;
          github_username: string;
          registered_at: string;
          total_xp: number;
          quests_completed: number;
          last_completed_at: string | null;
          onchain_xp?: number | null;
        }>;
        total: number;
        onchain_total_xp: number | null;
      }>('/api/quests/leaderboard'),

    referral: (wallet: string) =>
      get<{ referral_code: string; referral_link: string; referred_count: number; seeds_earned: number }>(`/api/quests/referral/${wallet}`),

    questCampaigns: () =>
      get<{ campaigns: Array<Record<string, unknown>> }>('/api/quests/campaigns'),
    questCampaignsHistory: () =>
      get<{ campaigns: Array<Record<string, unknown>> }>('/api/quests/campaigns/history'),
    questCampaign: (slug: string) =>
      get<Record<string, unknown>>(`/api/quests/campaigns/${slug}`),
    campaignProgress: (slug: string, wallet: string) =>
      get<Record<string, unknown>>(`/api/quests/campaigns/${slug}/progress?wallet=${wallet}`),
    campaignLeaderboard: (slug: string, limit = 50) =>
      get<{ campaign_slug: string; leaderboard: Array<Record<string, unknown>>; total: number }>(`/api/quests/campaigns/${slug}/leaderboard?limit=${limit}`),
    campaignPrizeBoard: (slug: string, limit = 10) =>
      get<{ campaign_slug: string; prize_pool: Record<string, unknown>; end_date: string; prize_board: Array<Record<string, unknown>> }>(`/api/quests/campaigns/${slug}/prize-board?limit=${limit}`),
    ginieInvite: (wallet: string) =>
      get<{ eligible: boolean; alreadyClaimed: boolean; code: string | null }>(`/api/quests/ginie-invite?wallet=${wallet}`),
    campaignJoin: (slug: string, wallet: string) =>
      post<{ message: string; awarded: boolean }>(`/api/quests/campaigns/${slug}/join`, { wallet } as Record<string, unknown>),
    campaignView: (slug: string) =>
      post<{ ok: boolean }>(`/api/quests/campaigns/${slug}/view`, {}),
    campaignLike: (slug: string, wallet: string) =>
      post<{ liked: boolean }>(`/api/quests/campaigns/${slug}/like`, { wallet } as Record<string, unknown>),
    campaignLiked: (slug: string, wallet: string) =>
      get<{ liked: boolean }>(`/api/quests/campaigns/${slug}/liked?wallet=${wallet}`),

    // Admin (requires Bearer token)
    adminListSubmissions: (token: string) =>
      authedRequest<{ submissions: QuestSubmission[]; total: number }>(token, '/api/quests/admin/submissions'),
    adminApproveSubmission: (token: string, id: number) =>
      authedRequest<{ message: string; completion: Record<string, unknown> }>(token, `/api/quests/admin/submissions/${id}/approve`, {
        method: 'POST',
      }),
    adminRejectSubmission: (token: string, id: number, reason?: string) =>
      authedRequest<{ message: string; completion: Record<string, unknown> }>(token, `/api/quests/admin/submissions/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || '' }),
      }),
    adminStats: (token: string) =>
      authedRequest<{ totalRegistered: number; totalCompletions: number; totalSeedsMinted: number }>(token, '/api/quests/admin/stats'),

    adminListQuests: (token: string) =>
      authedRequest<{ quests: Array<Record<string, unknown>>; total: number }>(token, '/api/quests/admin/quests'),
    adminUpsertQuest: (token: string, data: Record<string, unknown>) =>
      authedRequest<{ message: string; quest: Record<string, unknown> }>(token, '/api/quests/admin/quests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    adminListCampaigns: (token: string) =>
      authedRequest<{ campaigns: Array<Record<string, unknown>>; total: number }>(token, '/api/quests/admin/campaigns'),
    adminUpsertCampaign: (token: string, data: Record<string, unknown>) =>
      authedRequest<{ message: string; campaign: Record<string, unknown> }>(token, '/api/quests/admin/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    adminAwardXP: (token: string, wallet: string, quest_slug: string, proof?: Record<string, unknown>) =>
      authedRequest<{ message: string; completion: Record<string, unknown> }>(token, '/api/quests/admin/award', {
        method: 'POST',
        body: JSON.stringify({ wallet, quest_slug, proof: proof || {} }),
      }),
    adminDeleteCampaign: (token: string, slug: string) =>
      authedRequest<{ message: string; deleted_quests: string[] }>(token, `/api/quests/admin/campaigns/${slug}`, {
        method: 'DELETE',
      }),
    adminDeleteQuest: (token: string, slug: string) =>
      authedRequest<{ message: string; deleted: string }>(token, `/api/quests/admin/quests/${slug}`, {
        method: 'DELETE',
      }),
  },

  // ─── Seasons ────────────────────────────────────────────────────────────────
  seasons: {
    list: () =>
      get<{ seasons: Array<{ id: number; name: string; slug: string; status: string; start_at: string; end_at: string | null; description: string }> }>('/api/seasons'),
    active: () =>
      get<{ id: number; name: string; slug: string; status: string; start_at: string; end_at: string | null; description: string }>('/api/seasons/active'),
    get: (idOrSlug: string | number) =>
      get<{ id: number; name: string; slug: string; status: string; start_at: string; end_at: string | null; description: string }>(`/api/seasons/${idOrSlug}`),
    leaderboard: (idOrSlug: string | number, page = 1, limit = 50, sortBy: 'seeds' | 'streak' = 'seeds') =>
      get<{
        season: { id: number; name: string; slug: string; status: string; startAt: string; endAt: string | null };
        seasonId: number;
        participants: Array<{
          rank: number;
          wallet: string;
          displayName: string;
          xUsername: string | null;
          githubUsername: string | null;
          evmAddress: string | null;
          seasonSeeds: number;
          questCompletions: number;
          streak: number;
        }>;
        pagination: { page: number; limit: number; total: number; totalPages: number };
        stats: { totalParticipants: number; totalSeeds: number; totalCompletions: number };
      }>(`/api/seasons/${idOrSlug}/leaderboard?page=${page}&limit=${limit}&sortBy=${sortBy}&_t=${Date.now()}`),
    userStats: (idOrSlug: string | number, wallet: string) =>
      get<{
        season: { id: number; name: string; slug: string; status: string };
        wallet: string;
        seasonId: number;
        seasonSeeds: number;
        rank: number | null;
        totalParticipants: number;
        questCompletions: number;
      }>(`/api/seasons/${idOrSlug}/user/${wallet}`),
  },

  // ─── Wrapped VARA (wVARA) ───────────────────────────────────────────────────
  wvara: {
    meta: () =>
      get<{ name: string; symbol: string; decimals: number; totalSupply: string; totalSupplyDisplay: string }>('/api/wvara/meta'),
    balance: (address: string) =>
      get<{ address: string; balance: string; balanceDisplay: string }>(`/api/wvara/balance/${address}`),
    allowance: (owner: string, spender: string) =>
      get<{ allowance: string }>(`/api/wvara/allowance/${owner}/${spender}`),
    wrap: (params: { amount?: string; amountRaw?: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/wvara/wrap', params as unknown as Record<string, unknown>),
    unwrap: (params: { amount?: string; amountRaw?: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/wvara/unwrap', params as unknown as Record<string, unknown>),
    approve: (params: { spender: string; amount?: string; amountRaw?: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/wvara/approve', params as unknown as Record<string, unknown>),
    transfer: (params: { to: string; amount?: string; amountRaw?: string; mode?: string }) =>
      post<TxResult | PayloadResult>('/api/wvara/transfer', params as unknown as Record<string, unknown>),
  },

  // ─── Gasless Vouchers ───────────────────────────────────────────────────────
  voucher: {
    issue: (wallet: string) =>
      post<{ message: string; voucherId: string; amount: string; durationBlocks: number; expiresAt: string; programs: string[] }>(
        '/api/voucher/issue',
        { wallet } as Record<string, unknown>
      ),
    active: (wallet: string) =>
      get<{ hasVoucher: boolean; voucher: { voucherId: string; amount: string; expiresAt: string; programs: string[]; issuedAt: string } | null }>(
        `/api/voucher/active?wallet=${wallet}`
      ),
    list: (wallet: string) =>
      get<{ vouchers: Array<Record<string, unknown>>; total: number }>(
        `/api/voucher/list?wallet=${wallet}`
      ),
    stats: () =>
      get<{ total: number; active: number; expired: number; uniqueUsers: number }>(
        '/api/voucher/stats'
      ),
  },

  // ─── gVARA super-token (wrap wVARA ↔ gVARA) ────────────────────────────────
  gvara: {
    meta: () =>
      get<{ name: string; symbol: string; decimals: number; total_supply: string; total_supply_display: string }>('/api/gvara/meta'),
    balance: (address: string) =>
      get<{ account: string; balance: string; balance_display: string; static_balance: string; static_balance_display: string; net_flow_rate: string }>(`/api/gvara/balance/${address}`),
    wrapNative: (params: { amount?: string; amountRaw?: string; mode?: string }) =>
      post<{ payload: string; value: string }>('/api/gvara/wrap-native', params as unknown as Record<string, unknown>),
    unwrapNative: (params: { amount?: string; amountRaw?: string; mode?: string }) =>
      post<{ payload: string } | TxResult>('/api/gvara/unwrap-native', params as unknown as Record<string, unknown>),
  },

  // ─── Users (auth/registration) ─────────────────────────────────────────────
  users: {
    register: (params: { wallet: string; github_handle?: string; x_handle?: string; referral_code?: string }) =>
      post<{ user: Record<string, unknown>; referral_code: string; message: string }>(
        '/api/users/register',
        params as unknown as Record<string, unknown>,
      ),
    get: (wallet: string) => get<Record<string, unknown>>(`/api/users/${wallet}`),
  },

  // ─── Client config (authoritative on-chain program IDs) ────────────────────
  config: {
    programIds: () =>
      get<{ programIds: Record<string, string>; timestamp: string }>('/api/config/program-ids'),
  },

  // ─── Special Projects ───────────────────────────────────────────────────────
  projects: {
    list: () =>
      get<{ projects: Array<Record<string, unknown>> }>('/api/projects'),
    get: (slug: string) =>
      get<{ project: Record<string, unknown> }>(`/api/projects/${slug}`),
    progress: (slug: string, wallet: string) =>
      get<{ project: Record<string, unknown>; quests: QuestData[]; projectXp: number }>(`/api/projects/${slug}/progress?wallet=${wallet}`),
    leaderboard: (slug: string) =>
      get<{ project: Record<string, unknown>; leaderboard: Array<Record<string, unknown>> }>(`/api/projects/${slug}/leaderboard`),
    adminUpsert: (token: string, data: Record<string, unknown>) =>
      authedRequest<{ message: string; project: Record<string, unknown> }>(token, '/api/projects/admin/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    adminAssignQuest: (token: string, data: { quest_slug: string; project_slug?: string }) =>
      authedRequest<{ message: string; quest: Record<string, unknown> }>(token, '/api/projects/admin/assign-quest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    adminDelete: (token: string, slug: string) =>
      authedRequest<{ message: string; deleted: string; deleted_quests: string[] }>(token, `/api/projects/admin/${slug}`, { method: 'DELETE' }),
  },

  // ─── Reward (one-time 50 VARA claim) ────────────────────────────────────────
  reward: {
    walletBalance: () =>
      get<{ balance: string; balanceRaw: string; address: string | null }>('/api/reward/wallet-balance'),
    status: (wallet: string) =>
      get<{ claimed: boolean; claimed_at: string | null; tx_hash: string | null; amount: string | null }>(
        `/api/reward/status/${wallet}`,
      ),
    claim: (wallet: string) =>
      post<{ success: boolean; wallet: string; amount: number; amountHuman: string; tx_hash: string; block_hash: string }>(
        '/api/reward/claim',
        { wallet },
      ),
  },
};

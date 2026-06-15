/**
 * vara-eth-api.ts — typed client for /api/vara-eth/* (Phase 5)
 *
 * All calls proxy through the GrowStreams backend which holds the
 * relayer private key. The frontend never touches private keys.
 */

const API_BASE = (
  process.env.NEXT_PUBLIC_GROWSTREAMS_API ||
  'https://growstreams-api-v3-production.up.railway.app'
).replace(/\/$/, '');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

function get<T>(path: string) { return request<T>(path); }
function post<T>(path: string, body?: Record<string, unknown>) {
  return request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaraEthInfo {
  escrow:      string;
  token:       string;
  abiContract: string;
  mirror:      string;
  chainId:     number;
  rpc:         string;
  network:     string;
}

export interface TokenBalance {
  address:  string;
  balance:  string;
  decimals: number;
  token:    string;
}

export interface WvaraBalance {
  address:      string;
  wvaraAddress: string;
  balance:      string;
  decimals:     number;
}

export interface EvmStream {
  id:             number;
  message_id:     string | null;
  stream_id:      number | null;
  sender:         string;
  receiver:       string;
  flow_rate:      string;
  amount:         string;
  token:          string;
  escrow_address: string;
  approve_tx:     string | null;
  deposit_tx:     string;
  block_number:   string | null;
  status:         'PENDING' | 'ACTIVE' | 'STOPPED' | 'FAILED';
  network:        string;
  created_at:     string;
  updated_at:     string;
}

export interface DepositResult {
  approveTxHash: string | null;
  depositTxHash: string;
  blockNumber:   string;
  status:        string;
  messageId:     string | null;
  receiver:      string;
  flowRate:      string;
  amount:        string;
  note:          string;
}

export interface TxResult {
  txHash:      string;
  blockNumber: string;
  status:      string;
}

// ─── API calls ───────────────────────────────────────────────────────────────

export const varaEthApi = {
  /** GET /api/vara-eth/info */
  info: () => get<VaraEthInfo>('/api/vara-eth/info'),

  /** GET /api/vara-eth/balance/:address — streaming token balance */
  balance: (address: string) => get<TokenBalance>(`/api/vara-eth/balance/${address}`),

  /** GET /api/vara-eth/wvara/:address */
  wvara: (address: string) => get<WvaraBalance>(`/api/vara-eth/wvara/${address}`),

  /** GET /api/vara-eth/claimable/:address */
  claimable: (address: string) =>
    get<{ address: string; claimable: string }>(`/api/vara-eth/claimable/${address}`),

  /** GET /api/vara-eth/depositor/:streamId */
  depositor: (streamId: number) =>
    get<{ streamId: string; depositor: string | null }>(`/api/vara-eth/depositor/${streamId}`),

  /** GET /api/vara-eth/streams/:address */
  streams: (address: string, limit = 50, offset = 0) =>
    get<{ address: string; streams: EvmStream[]; count: number }>(
      `/api/vara-eth/streams/${address}?limit=${limit}&offset=${offset}`
    ),

  /** POST /api/vara-eth/deposit */
  deposit: (receiver: string, flowRate: string, amount: string) =>
    post<DepositResult>('/api/vara-eth/deposit', { receiver, flowRate, amount }),

  /** POST /api/vara-eth/deposit/:streamId */
  addDeposit: (streamId: number, amount: string) =>
    post<TxResult>(`/api/vara-eth/deposit/${streamId}`, { amount }),

  /** POST /api/vara-eth/withdraw/:streamId */
  withdraw: (streamId: number, amount: string) =>
    post<TxResult>(`/api/vara-eth/withdraw/${streamId}`, { amount }),

  /** POST /api/vara-eth/stop/:streamId */
  stop: (streamId: number) =>
    post<TxResult & { status: string }>(`/api/vara-eth/stop/${streamId}`),

  /** POST /api/vara-eth/claim */
  claim: () => post<TxResult & { note: string }>('/api/vara-eth/claim'),
};

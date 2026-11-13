/**
 * Mallchain Mission Control v14 — Wallet API Service
 * 
 * Handles all wallet-related API calls:
 * - Fetching real wallet balances from /api/wallet/{address}
 * - Fetching transaction history from /api/transactions
 * - Real-time updates via Socket.IO events
 * 
 * Features:
 * - Task 13.1: Fetch real wallet data from /api/wallet/{address}
 * - Task 13.5: Fetch transactions from /api/transactions?walletAddress=...
 * - Error handling with retry logic (Task 13.14)
 * - Loading states for UI (Task 13.13)
 */

import { api } from './api';
import { type ApiResult } from './api';

/**
 * Balance response from /api/wallet/{address}
 */
export interface WalletBalance {
  address: string;
  MALL: number;
  /** Portion of MALL that exists but can't be spent yet (e.g. a vesting lock) — already excluded from MALL. */
  MALL_LOCKED?: number;
  /** Epoch ms when MALL_LOCKED unlocks, or null if nothing is locked. */
  MALL_UNLOCK_TIME?: number | null;
  MLPTS: number;
  USD_M: number;
  KES?: number;
  EUR?: number;
  GBP?: number;
  lastUpdated?: number;
}

/**
 * Transaction response from /api/tx/history (see API_REFERENCE.md, "Backend
 * REST: transaction history").
 *
 * `type` is the *direction* this transaction had for the wallet that asked —
 * the same transfer message is a send for one address and a receive for the
 * other. `txType` is the category, from the enum GET /api/tx/types publishes,
 * and `txTypeLabel` is the server's own wording for it. The two are different
 * axes on purpose: a stake the wallet signed is `type:'send'` / `txType:'stake'`,
 * and rendering only the direction is what made every category other than a
 * transfer look identical in history.
 */
export interface Transaction {
  id: string;
  type: 'send' | 'receive';
  /** A `txType` from the published catalogue; 'other' with `msgType` when this build hasn't classified it. */
  txType: string;
  txTypeLabel: string;
  /** Raw protobuf message URL, e.g. '/marketplace.mlcoin.v1.MsgStake' — always present, even for 'other'. */
  msgType?: string;
  amount: number;
  asset: string;
  status: 'pending' | 'confirmed' | 'failed';
  to?: string;
  from?: string;
  fee?: number;
  ts: number;
  note?: string;
  hash?: string;
  blockNumber?: number;
  gasUsed?: number;
}

/**
 * Paginated transactions response
 */
export interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * One row of /api/tx/history as the backend publishes it (backend/src/routes/tx.js,
 * API_REFERENCE.md "Backend REST: transaction history"). `timestampMs` and
 * `txType` are produced server-side; the ISO string is kept only so a row can
 * still be shown verbatim.
 */
interface ChainTxRow {
  id: string;
  hash: string;
  from: string;
  to: string;
  amount: string | number;
  type: string;
  txType: string;
  txTypeLabel: string;
  msgType?: string;
  status: string;
  error?: string;
  timestamp: string | number;
  timestampMs: number;
  block: number;
  gasUsed?: number;
}

const MLCNS_DECIMALS = 6;

/**
 * A chain history row → the shape the rest of the app renders.
 *
 * The server does the arithmetic it owes: `timestampMs` is epoch milliseconds
 * (`Number()` of the chain's ISO string is NaN, and an earlier version of this
 * file guessed between seconds, milliseconds and ISO per node build — 0 now
 * means the node gave no readable time, which is "unknown" rather than the
 * misleading "just now"), and `txType`/`txTypeLabel` come from the published
 * category table rather than a fragment match on the message URL.
 */
function toTransaction(t: ChainTxRow): Transaction {
  const ts = Number.isFinite(t.timestampMs) ? t.timestampMs : 0;
  return {
    id: t.id || t.hash,
    type: t.type === 'receive' ? 'receive' : 'send',
    txType: t.txType || 'other',
    txTypeLabel: t.txTypeLabel || 'Other on-chain activity',
    msgType: t.msgType,
    amount: Number(t.amount || 0) / 10 ** MLCNS_DECIMALS,
    asset: 'MALL',
    status: (t.status as Transaction['status']) || 'confirmed',
    to: t.to,
    from: t.from,
    ts,
    note: ts === 0
      ? 'Chain returned no usable timestamp for this transaction'
      : t.status === 'failed' && t.error ? t.error : undefined,
    hash: t.hash,
    blockNumber: Number(t.block) || 0,
    gasUsed: t.gasUsed,
  };
}

/** One entry of the category table GET /api/tx/types publishes. */
export interface TxTypeEntry {
  value: string;
  label: string;
  description: string;
  msgTypes: string[];
}

/**
 * Wallet API service
 */
class WalletApi {  /**
   * Fetch wallet balance from API
   * Maps to: GET /api/wallet/{address}
   * 
   * @param address - Wallet address to fetch balance for
   * @returns Promise resolving to balance or error
   */
  async getBalance(address: string): Promise<ApiResult<WalletBalance>> {
    if (!address) {
      return { ok: false, error: 'Wallet address is required' };
    }

    try {
      const result = await api.get<WalletBalance>(`/api/wallet/${address}`);
      return result;
    } catch (error) {
      console.error(`[WalletApi] Failed to fetch balance for ${address}:`, error);
      return {
        ok: false,
        error: `Failed to fetch wallet balance: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fetch transactions for a wallet.
   * Maps to: GET /api/tx/history?address={address}&page={page}&limit={pageSize}&status={status}
   *
   * `GET /api/transactions` (the route this used to call) doesn't exist —
   * confirmed live as a 404 on every load, meaning Transaction History was
   * completely broken. /api/tx/history is the real, working, chain-querying
   * equivalent (already used correctly elsewhere) — this maps its response
   * shape into the Transaction/TransactionsResponse shape the rest of the
   * app expects, rather than duplicating its logic under a second route.
   *
   * type/search/startDate/endDate are all applied server-side (alongside
   * status) before pagination — filtering only the current page client-side
   * previously left `total`/page-count reflecting the *unfiltered* set, so
   * "page 1 of N" and Next/Previous paged through the wrong data.
   *
   * `type` is either a direction ('send' | 'receive', which is how the row's
   * own `type` field is derived) or a category from the published taxonomy —
   * 'stake', 'purchase', 'swap', … — which the row's `txType` is matched
   * against. GET /api/tx/types returns that list, so a filter control can be
   * built from it instead of a hardcoded copy; anything outside it is a 400
   * from the server rather than an empty page.
   *
   * @param options - Query options
   * @returns Promise resolving to paginated transactions or error
   */
  async getTransactions(options: {
    walletAddress: string;
    page?: number;
    pageSize?: number;
    type?: string; // 'send' | 'receive' (direction) or a GET /api/tx/types category
    status?: string; // Filter by status (pending, confirmed, failed)
    search?: string; // Substring match on hash/from/to
    startDate?: string; // ISO date, inclusive lower bound
    endDate?: string; // ISO date, inclusive upper bound
  }): Promise<ApiResult<TransactionsResponse>> {
    const { walletAddress, page = 1, pageSize = 20, type, status, search, startDate, endDate } = options;

    if (!walletAddress) {
      return { ok: false, error: 'Wallet address is required' };
    }

    try {
      const params = new URLSearchParams({
        address: walletAddress,
        page: String(page),
        limit: String(pageSize),
        ...(status && { status }),
        ...(type && { type }),
        ...(search && { search }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });

      const result = await api.get<{
        success: boolean;
        transactions: ChainTxRow[];
        total: number;
        page: number;
        limit: number;
      }>(`/api/tx/history?${params.toString()}`);

      if (!result.ok || !result.data) return { ok: false, error: result.error || 'Failed to fetch transactions' };

      const transactions: Transaction[] = result.data.transactions.map(toTransaction);

      return {
        ok: true,
        data: {
          transactions,
          total: result.data.total,
          page: result.data.page,
          pageSize: result.data.limit,
          hasMore: result.data.page * result.data.limit < result.data.total,
        },
      };
    } catch (error) {
      console.error(
        `[WalletApi] Failed to fetch transactions for ${walletAddress}:`,
        error
      );
      return {
        ok: false,
        error: `Failed to fetch transactions: ${(error as Error).message}`,
      };
    }
  }

  /**
   * The published transaction categories, for a filter control or a label.
   * Maps to: GET /api/tx/types
   *
   * Exists so this client stops carrying its own guess-list of categories:
   * /api/tx/history's `txType` values are exactly the `value`s published here,
   * and a message this build hasn't classified arrives as 'other' with its
   * `msgType` URL attached rather than as a blank label.
   */
  async getTxTypes(): Promise<ApiResult<{ types: TxTypeEntry[]; directions: string[] }>> {
    try {
      const result = await api.get<{ success: boolean; types: TxTypeEntry[]; directions: string[] }>('/api/tx/types');
      if (!result.ok || !result.data) return { ok: false, error: result.error || 'Failed to fetch transaction types' };
      return { ok: true, data: { types: result.data.types, directions: result.data.directions } };
    } catch (error) {
      console.error('[WalletApi] Failed to fetch transaction types:', error);
      return { ok: false, error: `Failed to fetch transaction types: ${(error as Error).message}` };
    }
  }

  /**
   * Fetch a single transaction detail.
   *
   * Maps to: GET /api/tx/{id}, which is the route that can answer for the ids
   * this app actually holds. A history row's id is a 64-hex chain hash, and
   * `GET /api/transactions/{id}` (which this used to call) validates its id as
   * a Mongo ObjectId — so opening any chain transaction was a guaranteed 400,
   * and `/api/tx/{hash}` did not exist at all. A queued-record id still goes
   * to the Mongo route, because that is where a queued transfer's fee and memo
   * live.
   *
   * @param txId - Chain transaction hash or queued-record id
   * @param address - The wallet the row was read from, so a transfer keeps its
   *                  send/receive direction; optional, defaults to the sender's view
   * @returns Promise resolving to the transaction detail or error
   */
  async getTransactionDetail(txId: string, address?: string): Promise<ApiResult<Transaction>> {
    if (!txId) {
      return { ok: false, error: 'Transaction ID is required' };
    }

    const isChainHash = /^[0-9A-Fa-f]{64}$/.test(txId);

    try {
      if (isChainHash) {
        const result = await api.get<{ success: boolean; transaction: ChainTxRow }>(
          `/api/tx/${encodeURIComponent(txId)}${address ? `?address=${encodeURIComponent(address)}` : ''}`
        );
        if (!result.ok || !result.data?.transaction) {
          return { ok: false, error: result.error || 'Failed to fetch transaction' };
        }
        return { ok: true, data: toTransaction(result.data.transaction) };
      }

      const result = await api.get<Transaction>(`/api/transactions/${encodeURIComponent(txId)}`);
      return result;
    } catch (error) {
      console.error(`[WalletApi] Failed to fetch transaction ${txId}:`, error);
      return {
        ok: false,
        error: `Failed to fetch transaction: ${(error as Error).message}`,
      };
    }
  }
}

/**
 * Singleton instance
 */
export const walletApi = new WalletApi();

/**
 * Buyer order records — the account-side half of a storefront purchase.
 *
 * Backend: backend/src/routes/marketplaceOrders.js. The split of truth is the
 * same one the platform uses everywhere else:
 *   - the chain (x/marketplace escrow) holds the money and decides what an
 *     order is really worth — see services/marketplaceTx.ts for that half;
 *   - this endpoint holds the receipt: the order id, the line items, the
 *     shipping label. It exists so the history survives the browser it was
 *     bought in, which is what `st.marketplace.orders` in localStorage never
 *     could.
 *
 * Every response carries `escrowVerified`. True means the server read the
 * escrow off the node and stored the chain's own buyer/seller/amount; false
 * means the node was unreachable at record time and the numbers are the
 * buyer's claim. Render the difference — do not smooth it over.
 */
import { api, type ApiResult } from './api';

export type OrderStatus = 'processing' | 'shipped' | 'transit' | 'delivered' | 'cancelled' | 'disputed';

export interface OrderItemInput {
  listingId?: string;
  name: string;
  qty: number;
  price: number;
}

export interface RecordedOrderItem extends Required<Pick<OrderItemInput, 'name' | 'qty' | 'price'>> {
  listingId: string;
}

export interface RecordedOrder {
  /** The server-issued order id (MLC-YYMMDD-XXXXXXXX); also `orderNumber`. */
  id: string;
  orderNumber: string;
  items: RecordedOrderItem[];
  itemNames: string[];
  total: number;
  amountBaseUnits: string;
  denom: string;
  currency: { denom: string; display: string; decimals: number };
  status: OrderStatus;
  buyerAddress: string;
  sellerAddress: string;
  escrowId: string;
  createTxHash: string;
  releaseTxHash: string;
  disputeTxHash: string;
  escrowVerified: boolean;
  description: string;
  disputeWindowSeconds: number;
  createdAt: string | null;
  ts: number;
  updatedAt: string | null;
}

export interface CreateOrderInput {
  buyerAddress?: string;
  sellerAddress: string;
  escrowId?: string;
  createTxHash?: string;
  items: OrderItemInput[];
  total: number;
  description?: string;
}

export interface OrderListResponse {
  ok: boolean;
  orders: RecordedOrder[];
  total: number;
  limit: number;
  statuses: OrderStatus[];
  currency: { denom: string; display: string; decimals: number };
}

/** The shape the storefront's order list and `store.state.marketplace.orders`
 *  carry. `recorded` is the honest flag: false means this row exists only in
 *  this browser and nothing on the server describes it. */
export interface LocalOrder {
  id: string;
  items: string[];
  total: number;
  status: OrderStatus;
  ts: number;
  escrowId?: string;
  sellerAddress?: string;
  createTxHash?: string;
  releaseTxHash?: string;
  /**
   * Per-line detail as bought. The server needs it to re-derive the total, so
   * a receipt that failed to save can be retried without inventing prices.
   * Rows written before order records existed have none, and therefore cannot
   * be retried — the UI says so instead of splitting the total evenly.
   */
  lines?: OrderItemInput[];
  recorded?: boolean;
  /**
   * Why `recorded` is false, straight from the order service (or the network).
   * Shown on the row so the buyer knows what failed instead of finding out
   * only when the receipt is missing on another device.
   */
  saveError?: string;
  escrowVerified?: boolean;
}

/** A local purchase that never reached the server keeps a client-minted id, in
 *  the same `ord-…` form the storefront used before order records existed. */
export function mintLocalOrderId(): string {
  return 'ord-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 1000);
}

export function toLocalOrder(server: RecordedOrder): LocalOrder {
  return {
    id: server.id,
    // The receipt's line items come from the order record, never from the
    // escrow's free-text description (which is the same data, truncated by
    // MsgCreateEscrow's 200-char limit — the record is the accurate source).
    items: server.itemNames,
    total: server.total,
    status: server.status,
    ts: server.ts || (server.createdAt ? new Date(server.createdAt).getTime() : 0),
    escrowId: server.escrowId || undefined,
    sellerAddress: server.sellerAddress,
    createTxHash: server.createTxHash || undefined,
    releaseTxHash: server.releaseTxHash || undefined,
    lines: server.items,
    // Recorded by definition: it came from the server.
    recorded: true,
    escrowVerified: server.escrowVerified,
  };
}

/**
 * Merge the server's order list into the browser's list.
 *
 * A server row always wins: it is the account's record. The local row it
 * describes is recognised by escrowId, then createTxHash, then by nothing
 * else — a local purchase with no escrow reference cannot be matched to a
 * server record, so it stays as an unrecorded row rather than being silently
 * dropped (the buyer paid for it; hiding it would be worse than the duplicate).
 */
export function mergeOrders(local: LocalOrder[], server: RecordedOrder[]): LocalOrder[] {
  const serverOrders = server.map(toLocalOrder);
  const claimed = new Set<string>();
  for (const s of serverOrders) {
    if (s.escrowId) claimed.add(`escrow:${s.escrowId}`);
    if (s.createTxHash) claimed.add(`tx:${s.createTxHash}`);
    claimed.add(`id:${s.id}`);
  }

  const leftovers = local.filter((o) => {
    if (o.escrowId && claimed.has(`escrow:${o.escrowId}`)) return false;
    if (o.createTxHash && claimed.has(`tx:${o.createTxHash}`)) return false;
    return !claimed.has(`id:${o.id}`);
  });

  return [...serverOrders, ...leftovers].sort((a, b) => b.ts - a.ts);
}

export const marketplaceOrders = {
  /** Record a settled purchase and get its server-issued id. */
  async create(input: CreateOrderInput): Promise<ApiResult<{ ok: boolean; created: boolean; order: RecordedOrder }>> {
    return api.post<{ ok: boolean; created: boolean; order: RecordedOrder }>('/api/marketplace/orders', input);
  },

  async list(opts: { status?: OrderStatus; limit?: number } = {}): Promise<ApiResult<OrderListResponse>> {
    const params = new URLSearchParams();
    if (opts.status) params.set('status', opts.status);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return api.get<OrderListResponse>(`/api/marketplace/orders${qs ? `?${qs}` : ''}`);
  },

  async get(id: string): Promise<ApiResult<{ ok: boolean; order: RecordedOrder }>> {
    return api.get<{ ok: boolean; order: RecordedOrder }>(`/api/marketplace/orders/${encodeURIComponent(id)}`);
  },

  /**
   * Advance the shipping label and attach the on-chain tx hash that earned it.
   * The server refuses 'delivered' without `releaseTxHash` and refuses
   * 'cancelled' unless the caller is a moderator — neither is a network
   * failure, so surface the message it gives rather than retrying.
   */
  async update(
    id: string,
    patch: { status: OrderStatus; releaseTxHash?: string; disputeTxHash?: string; escrowId?: string }
  ): Promise<ApiResult<{ ok: boolean; order: RecordedOrder }>> {
    return api.patch<{ ok: boolean; order: RecordedOrder }>(
      `/api/marketplace/orders/${encodeURIComponent(id)}`,
      patch
    );
  },

  toLocalOrder,
  mintLocalOrderId,
};

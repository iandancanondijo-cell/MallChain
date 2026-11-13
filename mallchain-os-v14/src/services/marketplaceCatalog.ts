/**
 * Marketplace catalog client — the storefront's product feed.
 *
 * Backend: backend/src/routes/marketplaceCatalog.js (Mongo, off-chain
 * discovery). Checkout is NOT here: it settles through the on-chain
 * x/marketplace escrow messages in marketplaceTx.ts. This module only answers
 * "what is for sale, from whom, for how much" — which is exactly what
 * x/marketplace does not store, since the chain has escrow records and no
 * product concept at all.
 *
 * Everything returned is a seller's own listing. An account that has never
 * posted one sees an empty catalog; nothing here substitutes demo products.
 */
import { api, type ApiResult } from './api';

export type ListingCategory =
  | 'food'
  | 'fashion'
  | 'home'
  | 'tech'
  | 'agriculture'
  | 'health'
  | 'services'
  | 'other';

export type ListingStatus = 'active' | 'paused' | 'removed';

export interface CatalogListing {
  id: string;
  name: string;
  description: string;
  /** The seller's display name; '' when they have not set one — render the address instead. */
  seller: string;
  /** Payout address for MsgCreateEscrow. Read off the seller's account server-side. */
  sellerAddress: string;
  /** Units of MAL (native `stake`, 6 decimals) — what escrow actually holds. */
  price: number;
  quantity: number;
  img: string;
  cat: ListingCategory;
  status: ListingStatus;
  createdAt: string | null;
  updatedAt: string | null;
  /** Absent unless a real review source exists; see the note in the backend's toPublicListing. */
  rating?: number;
}

export interface CatalogCurrency {
  denom: string;
  display: string;
  decimals: number;
}

export interface CatalogListResponse {
  listings: CatalogListing[];
  pagination: { page: number; limit: number; total: number; pages: number };
  categories: ListingCategory[];
  currency: CatalogCurrency;
}

export type CatalogSort = 'new' | 'oldest' | 'price_asc' | 'price_desc';

/** A listing as the moderation view sees it: the storefront shape plus the
 *  seller's account id, which `toPublicListing` withholds from buyers because
 *  a shopper has no use for it. */
export interface ManagedListing extends CatalogListing {
  sellerUserId: string;
}

export interface ManageListResponse {
  listings: ManagedListing[];
  pagination: { page: number; limit: number; total: number; pages: number };
  /** Whole-catalog census by status — not a count of the current page. */
  counts: { active: number; paused: number; removed: number };
  statuses: ListingStatus[];
  categories: ListingCategory[];
  currency: CatalogCurrency;
}

export const marketplaceCatalog = {
  async list(
    opts: { q?: string; category?: ListingCategory; seller?: string; sort?: CatalogSort; page?: number; limit?: number } = {}
  ): Promise<ApiResult<CatalogListResponse>> {
    const params = new URLSearchParams();
    if (opts.q) params.set('q', opts.q);
    if (opts.category) params.set('category', opts.category);
    if (opts.seller) params.set('seller', opts.seller);
    if (opts.sort && opts.sort !== 'new') params.set('sort', opts.sort);
    if (opts.page) params.set('page', String(opts.page));
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return api.get<CatalogListResponse>(`/api/marketplace/catalog${qs ? `?${qs}` : ''}`);
  },

  async get(id: string): Promise<ApiResult<{ listing: CatalogListing }>> {
    return api.get<{ listing: CatalogListing }>(`/api/marketplace/catalog/${encodeURIComponent(id)}`);
  },

  /** The signed-in account's own listings, paused ones included. */
  async mine(): Promise<ApiResult<{ listings: CatalogListing[] }>> {
    return api.get<{ listings: CatalogListing[] }>('/api/marketplace/catalog/mine');
  },

  /**
   * The moderation view — every status, newest first, for a marketplace admin
   * or superadmin. The storefront's `list` cannot stand in for it: it hard-
   * filters to active, so a paused or removed listing would vanish from the
   * very window meant to review them. 403 for anyone else.
   */
  async manage(
    opts: { status?: ListingStatus | 'all'; category?: ListingCategory; page?: number; limit?: number } = {}
  ): Promise<ApiResult<ManageListResponse>> {
    const params = new URLSearchParams();
    if (opts.status) params.set('status', opts.status);
    if (opts.category) params.set('category', opts.category);
    if (opts.page) params.set('page', String(opts.page));
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return api.get<ManageListResponse>(`/api/marketplace/catalog/manage${qs ? `?${qs}` : ''}`);
  },

  async create(input: {
    title: string;
    description?: string;
    category: ListingCategory;
    price: number;
    quantity?: number;
    image?: string;
  }): Promise<ApiResult<{ listing: CatalogListing }>> {
    return api.post<{ listing: CatalogListing }>('/api/marketplace/catalog', input);
  },

  /**
   * Partial update — price, quantity, status ('active' | 'paused'), copy.
   * Deliberately cannot move the payout address: that is derived from the
   * seller's account on the server, so a listing can never be re-pointed at
   * an address its owner does not control after a buyer has found it.
   */
  async update(id: string, patch: Partial<Pick<CatalogListing, 'name' | 'description' | 'cat' | 'status'>> & {
    title?: string; price?: number; quantity?: number; image?: string; category?: ListingCategory;
  }): Promise<ApiResult<{ listing: CatalogListing }>> {
    return api.patch<{ listing: CatalogListing }>(`/api/marketplace/catalog/${encodeURIComponent(id)}`, patch);
  },

  async remove(id: string): Promise<ApiResult<{ id: string; status: 'removed' }>> {
    return api.del<{ id: string; status: 'removed' }>(`/api/marketplace/catalog/${encodeURIComponent(id)}`);
  },
};

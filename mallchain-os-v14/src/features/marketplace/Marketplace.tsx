import { useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, StatusChip, Stepper, Modal, toast } from '../../components/ui';
import { createEscrow, releaseFunds, openDispute, MarketplaceTxError } from '../../services/marketplaceTx';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { marketplaceCatalog, type CatalogListing, type CatalogSort, type ListingCategory } from '../../services/marketplaceCatalog';
import {
  marketplaceOrders,
  mergeOrders,
  toLocalOrder,
  mintLocalOrderId,
  type LocalOrder,
  type OrderItemInput,
  type OrderStatus,
} from '../../services/marketplaceOrders';

export interface Product {
  id: string;
  name: string;
  /** The seller's chosen display name — '' when they never set one. */
  seller: string;
  sellerAddress: string;
  price: number;
  /**
   * Only ever present when a real review source produced it. There is no
   * ratings model in the platform (backend has no review entity, route or
   * on-chain record), so live listings leave this undefined and the UI shows
   * the seller instead of a star.
   */
  rating?: number;
  img: string;
  cat: string;
  description?: string;
  quantity?: number;
  status?: 'active' | 'paused' | 'removed';
}

// x/marketplace escrow holds real bank-module coins (see
// x/marketplace/keeper/escrow.go), not the custom MLCNS ledger — so escrow
// amounts are denominated in the chain's native gas token ("stake" on the
// wire, 6 decimals), not MLCNS. A listing's `price` is therefore a token
// amount as the seller states it; there is no fiat/exchange-rate pipeline in
// front of it (documented simplification, not a bug).
const GAS_DENOM = 'stake';
const GAS_DECIMALS = 6;
const DISPUTE_WINDOW_SECONDS = 7 * 24 * 3600;

/**
 * What the native coin is called to the people spending it. The denom on the
 * wire is `stake`; the wallet's balance card already labels the same coin
 * "MALL" (features/wallet/WalletHub.tsx `sym: 'MALL'`), and product copy uses
 * that name everywhere — MLCNS stays an on-chain/API term.
 */
const TOKEN_UNIT = 'MALL';

/**
 * A token amount, never a fiat one. These prices used to go through
 * `fmtMoney(price, prefs.currency)`, which painted "$29.99" / "KSh 3,900" on
 * an amount that settles on-chain in MALL — the storefront advertised a
 * dollar price for something no dollar is ever moved in.
 */
function fmtToken(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const formatted = v.toLocaleString(navigator.language || 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${TOKEN_UNIT}`;
}

function toBaseUnits(amount: number): string {
  return Math.round(amount * 10 ** GAS_DECIMALS).toString();
}

/**
 * Cart units → priced lines for the receipt.
 *
 * The escrow needs one amount per seller, so a cart is expanded into a flat
 * list of product copies. The order record must not copy that flattening:
 * /api/marketplace/orders re-derives the total from `qty × price`, and two
 * identical rows of the same product would read as two different items.
 */
function toOrderLines(items: Product[]): OrderItemInput[] {
  const lines = new Map<string, OrderItemInput>();
  for (const p of items) {
    const existing = lines.get(p.id);
    if (existing) existing.qty += 1;
    else lines.set(p.id, { listingId: p.id, name: p.name, qty: 1, price: p.price });
  }
  return [...lines.values()];
}

// The catalog API owns the category list (it is a Mongo enum, so the
// storefront must not invent one). These are labels only; the value sent in a
// filter is the lowercase key.
const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food', fashion: 'Fashion', home: 'Home', tech: 'Tech',
  agriculture: 'Agriculture', health: 'Health', services: 'Services', other: 'Other',
};
const FALLBACK_CATEGORIES = ['food', 'fashion', 'home', 'tech'];

// One page of the catalog. Browsing filters this page locally so typing in the
// search box stays instant; a catalog larger than this says so rather than
// quietly hiding the rest.
const CATALOG_PAGE_SIZE = 60;

const SHIP_FLOW = ['processing', 'shipped', 'transit', 'delivered'] as const;

/**
 * The storefront. Products come from GET /api/marketplace/catalog — real
 * listings posted by real accounts, empty when nobody has posted yet. Buying
 * is unchanged and still on-chain: the cart becomes one MsgCreateEscrow per
 * seller, holding `stake` coins until the buyer confirms delivery.
 *
 * `products` remains an explicit seam so the escrow/checkout flow can be
 * driven from a test or a parent that already holds a page of listings,
 * without the component ever carrying hardcoded sellers of its own.
 */
export default function Marketplace({ navigate, products: productsOverride }: { navigate: (p: string) => void; products?: Product[] }) {
  useStoreVersion();
  const st = store.state;
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<CatalogSort>('new');
  const [detail, setDetail] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [catalogError, setCatalogError] = useState('');
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);

  // Account-side order records (GET /api/marketplace/orders). 'local-only' is
  // the honest state for a signed-out tab: what is on screen is this device's
  // history, not the account's.
  const [ordersState, setOrdersState] = useState<'idle' | 'loading' | 'ready' | 'failed' | 'anonymous'>('idle');
  const [ordersError, setOrdersError] = useState('');
  const [recordingOrderId, setRecordingOrderId] = useState<string | null>(null);

  const [sellOpen, setSellOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [mine, setMine] = useState<CatalogListing[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'other' as ListingCategory, price: '', quantity: '1', image: '📦' });

  // Explicitly passing an array — even an empty one — means the caller owns
  // the shelf. Omitting the prop means "go and ask the catalog API".
  const fromApi = productsOverride === undefined;

  useEffect(() => {
    if (!fromApi) {
      setCatalog(productsOverride as Product[]);
      setCatalogState('ready');
      setTotal(productsOverride.length);
      return;
    }
    let alive = true;
    setCatalogState('loading');
    marketplaceCatalog.list({ limit: CATALOG_PAGE_SIZE, sort }).then((r) => {
      if (!alive) return;
      if (!r.ok || !r.data) {
        setCatalogState('failed');
        setCatalogError(r.error || 'The catalog could not be reached');
        return;
      }
      setCatalog(r.data.listings as Product[]);
      setTotal(r.data.pagination?.total ?? r.data.listings.length);
      if (r.data.categories?.length) setCategories(r.data.categories);
      setCatalogState('ready');
    });
    return () => { alive = false; };
  }, [fromApi, refresh, sort, productsOverride]);

  /**
   * Pull the account's order history. This is the step that makes a purchase
   * follow the buyer to another device: the server's rows replace the local
   * rows they describe (matched by escrow id, then create tx hash), and a
   * local row with no server counterpart stays visible but marked unrecorded.
   *
   * Signed out, the list is whatever this browser holds and the panel says so.
   */
  useEffect(() => {
    if (!st.user.authed) {
      setOrdersState('anonymous');
      return;
    }
    let alive = true;
    setOrdersState('loading');
    marketplaceOrders.list({ limit: 50 }).then((r) => {
      if (!alive) return;
      if (!r.ok || !r.data) {
        // Keep the local list visible; losing the sync is not a reason to
        // hide what the buyer actually ordered on this device.
        setOrdersState('failed');
        setOrdersError(r.error || 'Your account\'s order history could not be reached');
        return;
      }
      st.marketplace.orders = mergeOrders(st.marketplace.orders, r.data.orders);
      store.commit();
      setOrdersState('ready');
    });
    return () => { alive = false; };
    // authed is the only trigger: a checkout re-records its own row, and
    // polling this would collide with the storefront's request budget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.user.authed]);

  const products = catalog;

  const loadMine = () => {
    setMineOpen(true);
    marketplaceCatalog.mine().then((r) => {
      if (r.ok && r.data) setMine(r.data.listings);
      else toast(r.error || 'Could not load your listings');
    });
  };

  const postListing = async () => {
    const price = Number(form.price);
    if (form.title.trim().length < 3) { toast('Give the listing a title (at least 3 characters)'); return; }
    if (!Number.isFinite(price) || price <= 0) { toast(`Enter a price in ${TOKEN_UNIT} greater than zero`); return; }
    setSaving(true);
    try {
      const r = await marketplaceCatalog.create({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        price,
        quantity: Math.max(1, Math.floor(Number(form.quantity) || 1)),
        image: form.image.trim() || '📦',
      });
      if (!r.ok) { toast(r.error || 'Could not post the listing'); return; }
      toast('Listing published — buyers can find it in the catalog');
      setSellOpen(false);
      setForm({ title: '', description: '', category: 'other', price: '', quantity: '1', image: '📦' });
      setRefresh((n) => n + 1);
    } finally {
      setSaving(false);
    }
  };

  const setListingStatus = async (id: string, status: 'active' | 'paused') => {
    const r = await marketplaceCatalog.update(id, { status });
    if (!r.ok) { toast(r.error || 'Could not update the listing'); return; }
    toast(status === 'paused' ? 'Listing paused — hidden from buyers' : 'Listing is live again');
    setMine((rows) => rows.map((x) => (x.id === id ? { ...x, status } : x)));
    setRefresh((n) => n + 1);
  };

  const removeListing = async (id: string) => {
    const r = await marketplaceCatalog.remove(id);
    if (!r.ok) { toast(r.error || 'Could not remove the listing'); return; }
    toast('Listing removed');
    setMine((rows) => rows.filter((x) => x.id !== id));
    setRefresh((n) => n + 1);
  };

  const catMatches = (value: string) =>
    cat === 'All' || (CATEGORY_LABELS[value] ?? value) === cat || value.toLowerCase() === cat.toLowerCase();

  const list = products.filter((p) => catMatches(p.cat) && p.name.toLowerCase().includes(q.toLowerCase()));
  const moreBeyondPage = Math.max(0, total - products.length);
  const inWish = (id: string) => st.marketplace.wishlist.includes(id);
  const inCart = (id: string) => st.marketplace.cart.some((c) => c.id === id);
  const cartTotal = st.marketplace.cart.reduce((a, c) => a + (products.find((p) => p.id === c.id)?.price || 0) * c.qty, 0);

  const toggleWish = (id: string) => {
    st.marketplace.wishlist = inWish(id) ? st.marketplace.wishlist.filter((w) => w !== id) : [...st.marketplace.wishlist, id];
    store.commit();
    toast(inWish(id) ? 'Removed from wishlist' : 'Added to wishlist');
  };

  const addCart = (id: string) => {
    const existing = st.marketplace.cart.find((c) => c.id === id);
    if (existing) existing.qty += 1;
    else st.marketplace.cart.push({ id, qty: 1 });
    store.commit();
    toast('Added to cart');
  };

  const checkout = async () => {
    if (!st.wallet.pinEncryptedMnemonic || !st.wallet.address) {
      toast('Set up your wallet before checking out');
      return;
    }
    if (st.marketplace.cart.length === 0) return;

    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;

    setCheckingOut(true);
    try {
      // One escrow per seller — a real MsgCreateEscrow is buyer↔seller,
      // so a cart spanning multiple sellers becomes one order (and one
      // signed transaction) per seller.
      const bySeller = new Map<string, Product[]>();
      for (const c of st.marketplace.cart) {
        const p = products.find((x) => x.id === c.id);
        if (!p) continue;
        const existing = bySeller.get(p.sellerAddress) || [];
        for (let i = 0; i < c.qty; i++) existing.push(p);
        bySeller.set(p.sellerAddress, existing);
      }

      const newOrders: (typeof st.marketplace.orders)[number][] = [];
      for (const [sellerAddress, items] of bySeller) {
        const total = items.reduce((a, p) => a + p.price, 0);
        const description = items.map((p) => p.name).join(', ').slice(0, 200);
        const lines = toOrderLines(items);

        const { escrowId, txHash } = await createEscrow({
          mnemonic,
          buyer: st.wallet.address,
          seller: sellerAddress,
          amount: toBaseUnits(total),
          denom: GAS_DENOM,
          description,
          disputeWindowSeconds: DISPUTE_WINDOW_SECONDS,
        });

        // The escrow is already locked at this point, so recording the receipt
        // is allowed to fail and must never fail the checkout with it. What it
        // cannot do is pretend: an unsaved row keeps its local id and shows a
        // "Save to account" action.
        let order: LocalOrder = {
          id: mintLocalOrderId(),
          items: items.map((p) => p.name),
          total,
          status: 'processing',
          ts: Date.now(),
          escrowId,
          sellerAddress,
          createTxHash: txHash,
          lines,
          recorded: false,
        };
        try {
          const saved = await marketplaceOrders.create({
            buyerAddress: st.wallet.address,
            sellerAddress,
            escrowId: escrowId || '',
            createTxHash: txHash || '',
            items: lines,
            total,
            description,
          });
          if (saved.ok && saved.data?.order) order = toLocalOrder(saved.data.order);
          else order.saveError = saved.error || 'the order service refused the receipt';
        } catch (e) {
          order.saveError = e instanceof Error ? e.message : 'network error';
        }
        newOrders.push(order);
      }

      st.marketplace.orders.unshift(...newOrders);
      st.marketplace.cart = [];
      store.commit();

      const savedCount = newOrders.filter((o) => o.recorded).length;
      const unsaved = newOrders.length - savedCount;
      toast(
        unsaved === 0
          ? `Escrow locked for ${newOrders.length} order(s) — receipts saved to your account, funds held until delivery confirmed`
          : `Escrow locked for ${newOrders.length} order(s) — ${unsaved} receipt(s) could not be saved to your account and stay on this device until you retry from Orders`
      );

      // Raise it in the user's notification feed.
      store.pushNotification(
        'Order Confirmed',
        unsaved === 0
          ? `${newOrders.length} order(s) placed with escrow protection — receipts on your account`
          : `${newOrders.length} order(s) placed with escrow protection (${unsaved} receipt(s) not yet saved to your account)`,
        'transaction',
        'transactions'
      );
      
      setCartOpen(false);
    } catch (e) {
      const msg = e instanceof MarketplaceTxError ? e.message : 'Checkout failed';
      toast(msg);
    } finally {
      setCheckingOut(false);
    }
  };

  /**
   * Mirror a status change onto the account's order record.
   *
   * The escrow is what moved (or did not); this only keeps the receipt's
   * shipping label in sync with the row on screen. A failure here is never
   * presented as a failed delivery: the funds are already where the chain put
   * them, so the message says the status is on this device only.
   */
  const syncOrder = async (
    o: LocalOrder,
    patch: { status: OrderStatus; releaseTxHash?: string; disputeTxHash?: string }
  ) => {
    if (!o.recorded || !st.user.authed) return;
    const r = await marketplaceOrders.update(o.id, patch);
    if (!r.ok) toast(`Status kept on this device only — ${r.error || 'the order service could not be reached'}`);
  };

  /**
   * Save an order that checkout could not record, using the line detail it was
   * bought with. Rows older than account receipts carry no line detail, and
   * splitting the total evenly across item names would be inventing prices —
   * so those say so instead of POSTing a fabricated receipt.
   */
  const recordOrder = async (id: string) => {
    const o = st.marketplace.orders.find((x) => x.id === id);
    if (!o || o.recorded) return;
    if (!st.user.authed) { toast('Sign in to save orders to your account'); return; }
    if (!o.lines || o.lines.length === 0) {
      toast('This purchase predates account receipts — its line items were never saved, so it cannot be recorded');
      return;
    }
    if (!o.sellerAddress) { toast('This order has no seller address, so it cannot be recorded'); return; }

    setRecordingOrderId(id);
    try {
      const r = await marketplaceOrders.create({
        buyerAddress: st.wallet.address,
        sellerAddress: o.sellerAddress,
        escrowId: o.escrowId || '',
        createTxHash: o.createTxHash || '',
        items: o.lines,
        total: o.total,
        description: o.items.join(', ').slice(0, 200),
      });
      if (!r.ok || !r.data?.order) {
        // Keep the row, keep the reason: the buyer can retry from here.
        o.saveError = r.error || 'the order service refused the receipt';
        store.commit();
        toast(`Could not save this order — ${o.saveError}`);
        return;
      }
      const saved = toLocalOrder(r.data.order);
      // The label the buyer already advanced locally is not lost by saving the
      // receipt; push it after the record exists so the server can accept it.
      const row: LocalOrder = { ...saved, status: o.status, releaseTxHash: o.releaseTxHash };
      const at = st.marketplace.orders.findIndex((x) => x.id === id);
      if (at >= 0) st.marketplace.orders[at] = row;
      else st.marketplace.orders.unshift(row);
      store.commit();
      if (row.status !== 'processing') await syncOrder(row, { status: row.status, releaseTxHash: row.releaseTxHash });
      toast(`Order ${saved.id} saved to your account${saved.escrowVerified ? ' — amount checked against the escrow' : ' — amount not yet checked against the escrow'}`);
    } finally {
      setRecordingOrderId(null);
    }
  };

  const advanceOrder = async (id: string) => {
    const o = st.marketplace.orders.find((x) => x.id === id);
    if (!o) return;
    const i = SHIP_FLOW.indexOf(o.status as (typeof SHIP_FLOW)[number]);
    if (i < 0 || i >= SHIP_FLOW.length - 1) return;

    if (i === SHIP_FLOW.length - 2) {
      // Final step: confirming delivery is what actually releases escrow
      // funds to the seller — must be signed by the buyer.
      if (!st.wallet.pinEncryptedMnemonic || !st.wallet.address || !o.escrowId) {
        toast('Wallet or escrow reference missing — cannot release funds');
        return;
      }
      const releaseMnemonic = await requestMnemonic();
      if (!releaseMnemonic) return;
      setBusyOrderId(id);
      try {
        const { txHash } = await releaseFunds({ mnemonic: releaseMnemonic, buyer: st.wallet.address, escrowId: o.escrowId });
        o.status = SHIP_FLOW[i + 1];
        o.releaseTxHash = txHash;
        store.commit();
        await syncOrder(o, { status: 'delivered', releaseTxHash: txHash });
        
        // Raise it in the user's notification feed.
        store.pushNotification(
          'Delivery Confirmed',
          'Escrow released to seller — order complete',
          'transaction',
          'transactions'
        );
        
        toast('Delivery confirmed — escrow released to seller');
      } catch (e) {
        toast(e instanceof MarketplaceTxError ? e.message : 'Failed to release escrow funds');
      } finally {
        setBusyOrderId(null);
      }
      return;
    }

    o.status = SHIP_FLOW[i + 1];
    store.commit();
    await syncOrder(o, { status: o.status });
  };

  const fileDispute = async (id: string) => {
    const o = st.marketplace.orders.find((x) => x.id === id);
    if (!o) return;
    if (!st.wallet.pinEncryptedMnemonic || !st.wallet.address || !o.escrowId) {
      toast('Wallet or escrow reference missing — cannot open a dispute');
      return;
    }
    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;
    setBusyOrderId(id);
    try {
      await openDispute({ mnemonic, buyer: st.wallet.address, escrowId: o.escrowId });
      o.status = 'disputed';
      store.commit();
      await syncOrder(o, { status: 'disputed' });
      
      // Raise it in the user's notification feed.
      store.pushNotification(
        'Dispute Filed',
        'Dispute opened on-chain — awaiting resolution',
        'transaction',
        'transactions'
      );
      
      toast('Dispute filed on-chain — the seller must agree to a refund, or funds release automatically once the dispute window passes');
    } catch (e) {
      toast(e instanceof MarketplaceTxError ? e.message : 'Failed to open dispute');
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <div>
      <div className="view-head">
        <h1 className="text-gradient">Marketplace</h1>
        <span className="sub">Escrow-protected commerce on Mallchain</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOrdersOpen(true)}>📦 Orders ({st.marketplace.orders.length})</button>
        <button className="btn btn-ghost btn-sm" onClick={loadMine}>🏷 My listings</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSellOpen(true)}>＋ Sell an item</button>
        <button className="btn btn-primary btn-sm" onClick={() => setCartOpen(true)}>🛒 Cart ({st.marketplace.cart.reduce((a, c) => a + c.qty, 0)})</button>
      </div>

      <div className="filter-row">
        <input className="input search" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        {['All', ...categories.map((c) => CATEGORY_LABELS[c] ?? c)].map((c) => (
          <button key={c} className={'btn btn-ghost btn-sm' + (cat === c ? ' gold' : '')} onClick={() => setCat(c)}>{c}</button>
        ))}
        <select className="input" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as CatalogSort)} aria-label="Sort listings">
          <option value="new">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </div>

      {catalogState === 'loading' && (
        <div className="empty-state">
          <div className="es-ico">🛍</div>
          <div className="es-t">Loading the catalog…</div>
          <div className="es-m">Reading what sellers have actually listed on Mallchain.</div>
        </div>
      )}

      {catalogState === 'failed' && (
        <div className="empty-state">
          <div className="es-ico">⚠️</div>
          <div className="es-t">The catalog could not be loaded</div>
          <div className="es-m">{catalogError}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setRefresh((n) => n + 1)}>Try again</button>
        </div>
      )}

      {catalogState === 'ready' && list.length === 0 && (
        <div className="empty-state">
          <div className="es-ico">🛍</div>
          {products.length === 0 ? (
            <>
              <div className="es-t">No listings yet</div>
              <div className="es-m">
                {total === 0
                  ? 'No seller has posted anything to the Mallchain catalog. Checkout, escrow and disputes below are live — the shelf is simply empty. If you have something to sell, post the first listing.'
                  : `${total} listing(s) exist but none loaded in this view.`}
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setSellOpen(true)}>＋ Sell an item</button>
            </>
          ) : (
            <>
              <div className="es-t">No products match</div>
              <div className="es-m">Nothing in {cat === 'All' ? 'any category' : cat} matches {q ? `“${q}”` : 'this search'}.</div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setCat('All'); }}>Clear filters</button>
            </>
          )}
        </div>
      )}
      {catalogState === 'ready' && moreBeyondPage > 0 && (
        <div className="tiny muted mb">
          Showing {products.length} of {total} listings — narrow the search or pick a category to see the rest.
        </div>
      )}
      <div className="c-grid stagger">
        {catalogState === 'ready' && list.map((p) => (
          <div key={p.id} className="c-card card-hover card-glow bg-gradient-card">
            <div className="c-banner">
              <span style={{ fontSize: 26 }}>{p.img}</span>
              <div>
                <div className="nm">{p.name}</div>
                <div className="cr">
                  by {p.seller || `${p.sellerAddress.slice(0, 10)}…${p.sellerAddress.slice(-5)}`}
                  {typeof p.rating === 'number' ? ` · ★ ${p.rating}` : ''}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => toggleWish(p.id)} title="Wishlist">
                {inWish(p.id) ? '❤️' : '🤍'}
              </button>
            </div>
            <div className="c-body">
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)' }}>{fmtToken(p.price)}</div>
              <div className="c-foot" style={{ padding: 0, border: 'none' }}>
                <button className="btn btn-ghost" onClick={() => setDetail(p)}>Details</button>
                <button className="btn btn-primary" disabled={inCart(p.id)} onClick={() => addCart(p.id)}>{inCart(p.id) ? 'In cart' : 'Add to cart'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>{detail.img}</div>
          {detail.description && <p className="muted mb" style={{ marginTop: 0 }}>{detail.description}</p>}
          <table className="tbl">
            <tbody>
              <tr>
                <td className="muted">Seller</td>
                <td>{detail.seller || 'Seller without a display name'}</td>
              </tr>
              <tr><td className="muted">Pays escrow to</td><td className="mono" style={{ fontSize: 12 }}>{detail.sellerAddress}</td></tr>
              <tr><td className="muted">Price</td><td><b className="gold">{fmtToken(detail.price)}</b> <span className="tiny muted">per unit, held in escrow on-chain</span></td></tr>
              {typeof detail.quantity === 'number' && <tr><td className="muted">Quantity listed</td><td>{detail.quantity}</td></tr>}
              {typeof detail.rating === 'number' && <tr><td className="muted">Rating</td><td>★ {detail.rating} / 5</td></tr>}
              <tr><td className="muted">Escrow</td><td><span className="chip green">Funds locked on-chain until delivery confirmed</span></td></tr>
            </tbody>
          </table>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            <button className="btn btn-primary" onClick={() => { addCart(detail.id); setDetail(null); }}>Add to cart</button>
          </div>
        </Modal>
      )}

      {sellOpen && (
        <Modal title="Sell on Mallchain" onClose={() => setSellOpen(false)}>
          <div className="tiny muted mb">
            A listing is public and points at your account's wallet address — that is the address a buyer's
            escrow pays out to when they confirm delivery. Prices are in {TOKEN_UNIT} (the chain's native coin), which is
            what escrow actually holds.
          </div>
          <label className="field"><span>Title</span>
            <input className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Nairobi Roast Coffee — 500g" />
          </label>
          <label className="field"><span>Category</span>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ListingCategory })}>
              {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
            </select>
          </label>
          <label className="field"><span>Price per unit ({TOKEN_UNIT})</span>
            <input className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="32.50" />
          </label>
          <label className="field"><span>Quantity available</span>
            <input className="input" inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </label>
          <label className="field"><span>Icon</span>
            <input className="input" maxLength={16} value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="☕" />
          </label>
          <label className="field"><span>Description</span>
            <textarea className="input" rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setSellOpen(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={postListing} disabled={saving}>{saving ? 'Publishing…' : 'Publish listing'}</button>
          </div>
        </Modal>
      )}

      {mineOpen && (
        <Modal title="My listings" onClose={() => setMineOpen(false)} wide>
          {mine.length === 0 && (
            <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
              You have not posted a listing yet.
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={() => { setMineOpen(false); setSellOpen(true); }}>＋ Sell an item</button>
              </div>
            </div>
          )}
          {mine.map((l) => (
            <div key={l.id} className="list-row">
              <span style={{ fontSize: 20 }}>{l.img}</span>
              <div className="grow">
                <div className="t">{l.name}</div>
                <div className="m">{fmtToken(l.price)} · qty {l.quantity} · {CATEGORY_LABELS[l.cat] ?? l.cat}</div>
              </div>
              <StatusChip status={l.status === 'active' ? 'delivered' : l.status === 'paused' ? 'processing' : 'cancelled'} />
              {l.status === 'active' ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setListingStatus(l.id, 'paused')}>Pause</button>
              ) : l.status === 'paused' ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setListingStatus(l.id, 'active')}>Relist</button>
              ) : (
                <span className="tiny muted">removed</span>
              )}
              {l.status !== 'removed' && (
                <button className="btn btn-danger btn-sm" onClick={() => removeListing(l.id)}>Remove</button>
              )}
            </div>
          ))}
        </Modal>
      )}

      {cartOpen && (
        <Modal title="Your cart" onClose={() => setCartOpen(false)}>
          {st.marketplace.cart.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20, textAlign: 'center' }}>Your cart is empty.</div>}
          {st.marketplace.cart.map((c) => {
            const p = products.find((x) => x.id === c.id);
            return (
              <div key={c.id} className="list-row">
                <span style={{ fontSize: 20 }}>{p?.img}</span>
                <div className="grow"><div className="t">{p?.name}</div><div className="m">qty {c.qty} × {fmtToken(p?.price || 0)}</div></div>
                <b>{fmtToken((p?.price || 0) * c.qty)}</b>
              </div>
            );
          })}
          {st.marketplace.cart.length > 0 && (
            <>
              <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 800, marginTop: 8 }}>Total: <span className="gold">{fmtToken(cartTotal)}</span></div>
              <div className="tiny mb">Funds are locked in an on-chain escrow (one per seller) and released when you confirm delivery.</div>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setCartOpen(false)} disabled={checkingOut}>Keep shopping</button>
                <button className="btn btn-primary" onClick={checkout} disabled={checkingOut}>{checkingOut ? 'Locking escrow…' : 'Checkout (escrow)'}</button>
              </div>
            </>
          )}
        </Modal>
      )}

      {ordersOpen && (
        <Modal title="Your orders" onClose={() => setOrdersOpen(false)} wide>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            {ordersState === 'loading' && 'Loading your account\'s order history…'}
            {ordersState === 'ready' && 'Order history from your account — the same receipts on every device you sign in from.'}
            {ordersState === 'failed' && `Account history unavailable: ${ordersError} — showing what this device recorded.`}
            {ordersState === 'anonymous' && 'Signed out: these are the orders recorded in this browser only. Sign in to see your account\'s full history.'}
            {ordersState === 'idle' && ''}
          </div>
          {st.marketplace.orders.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No orders yet — place your first order.</div>}
          {st.marketplace.orders.map((o) => {
            const step = SHIP_FLOW.indexOf(o.status as (typeof SHIP_FLOW)[number]) + (o.status === 'delivered' ? 1 : 0);
            const busy = busyOrderId === o.id;
            const saving = recordingOrderId === o.id;
            // What the amount is backed by. Four honest states, and the escrow
            // reference itself is shown whenever it exists — an unsaved
            // receipt still names the escrow the buyer can go check on-chain.
            const escrowLine = o.escrowId
              ? `Escrow #${o.escrowId}${o.recorded === false
                  ? ' · not yet recorded to your account, so not cross-checked'
                  : o.escrowVerified
                    ? ' · amount verified on-chain'
                    : ' · amount not checked against the chain'}`
              : o.recorded === false
                ? ''
                : 'No on-chain escrow recorded — this amount is the receipt, not a chain fact';
            return (
              <div key={o.id} className="card card-glow bg-gradient-card mb" style={{ background: 'var(--bg-2)' }}>
                <div className="row">
                  <div className="grow"><b>{o.id}</b> <span className="muted">· {new Date(o.ts).toLocaleDateString()}</span></div>
                  <StatusChip status={o.status} />
                  <b className="gold">{fmtToken(o.total)}</b>
                </div>
                <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>{o.items.join(', ')}</div>
                {escrowLine && <div className="tiny muted">{escrowLine}</div>}
                {o.recorded === false && (
                  <div className="row" style={{ marginTop: 4 }}>
                    <span className="chip">On this device only</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => recordOrder(o.id)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save to account'}
                    </button>
                    {o.saveError && <span className="tiny muted">{o.saveError}</span>}
                  </div>
                )}
                {SHIP_FLOW.includes(o.status as (typeof SHIP_FLOW)[number]) && <Stepper steps={[...SHIP_FLOW]} current={step} />}
                <div className="row">
                  {o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'disputed' && (
                    <button className="btn btn-primary btn-sm" onClick={() => advanceOrder(o.id)} disabled={busy}>
                      {busy ? 'Releasing…' : 'Advance status'}
                    </button>
                  )}
                  {o.status === 'delivered' && <span className="chip green">✓ Escrow released</span>}
                  {/* MsgOpenDispute only works while the module still holds the
                      funds; after a release there is nothing left to dispute,
                      so the button is gone rather than promising a 400. */}
                  {(o.status === 'processing' || o.status === 'shipped' || o.status === 'transit') && (
                    <button className="btn btn-danger btn-sm" onClick={() => fileDispute(o.id)} disabled={busy}>
                      {busy ? 'Filing…' : 'File dispute'}
                    </button>
                  )}
                  {o.status === 'disputed' && <span className="chip">⚖ Disputed — awaiting seller or dispute-window release</span>}
                </div>
              </div>
            );
          })}
        </Modal>
      )}
    </div>
  );
}

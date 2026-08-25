import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtMoney, StatusChip, Stepper, Modal, toast } from '../../components/ui';
import { createEscrow, releaseFunds, openDispute, MarketplaceTxError } from '../../services/marketplaceTx';
import { requestMnemonic } from '../../services/mnemonicAccess';

interface Product { id: string; name: string; seller: string; sellerAddress: string; price: number; rating: number; img: string; cat: string }

// x/marketplace escrow holds real bank-module coins (see
// x/marketplace/keeper/escrow.go), not the custom MLCNS ledger — so escrow
// amounts are denominated in the chain's native gas token ("stake",
// displayed MAL, 6 decimals), not MLCNS. There's no fiat/MAL exchange rate
// pipeline wired up for this demo catalog, so product "price" is treated as
// a MAL amount directly (documented simplification, not a bug).
const GAS_DENOM = 'stake';
const GAS_DECIMALS = 6;
const DISPUTE_WINDOW_SECONDS = 7 * 24 * 3600;

function toBaseUnits(amount: number): string {
  return Math.round(amount * 10 ** GAS_DECIMALS).toString();
}

// Real genesis wallet addresses (blockchain_working/config/genesis.json),
// standing in for each demo seller's own wallet.
const PRODUCTS: Product[] = [
  { id: 'prod-1', name: 'Nairobi Roast Coffee — 500g', seller: 'Safari Beans Co.', sellerAddress: 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg', price: 32.5, rating: 4.8, img: '☕', cat: 'Food' },
  { id: 'prod-2', name: 'Maasai Beaded Bracelet', seller: 'Maa Crafts', sellerAddress: 'mall1y2tvfjcm6p23cgmzn3gw3y87wznxexzca4lc7l', price: 14.0, rating: 4.9, img: '📿', cat: 'Fashion' },
  { id: 'prod-3', name: 'Handmade Kiondo Basket', seller: 'Ujenzi Home', sellerAddress: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6', price: 48.0, rating: 4.7, img: '🧺', cat: 'Home' },
  { id: 'prod-4', name: 'Kente Print Scarf', seller: 'Accra Threads', sellerAddress: 'mall18u7572gkr30nvfvucrghuplgk3cky253fssl28', price: 22.0, rating: 4.6, img: '🧣', cat: 'Fashion' },
  { id: 'prod-5', name: 'Solar Desk Lamp', seller: 'Jua Energy', sellerAddress: 'mall1g4g64v25exk5v9sluja5qp4w0zl5ed59whuwvd', price: 39.9, rating: 4.5, img: '💡', cat: 'Tech' },
  { id: 'prod-6', name: 'Baobab Superfood Powder', seller: 'Sahara Harvest', sellerAddress: 'mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5', price: 18.5, rating: 4.4, img: '🌿', cat: 'Food' },
];

const CATS = ['All', 'Food', 'Fashion', 'Home', 'Tech'];
const SHIP_FLOW = ['processing', 'shipped', 'transit', 'delivered'] as const;

export default function Marketplace({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const cur = st.prefs.currency;
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const list = PRODUCTS.filter((p) => (cat === 'All' || p.cat === cat) && p.name.toLowerCase().includes(q.toLowerCase()));
  const inWish = (id: string) => st.marketplace.wishlist.includes(id);
  const inCart = (id: string) => st.marketplace.cart.some((c) => c.id === id);
  const cartTotal = st.marketplace.cart.reduce((a, c) => a + (PRODUCTS.find((p) => p.id === c.id)?.price || 0) * c.qty, 0);

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
        const p = PRODUCTS.find((x) => x.id === c.id);
        if (!p) continue;
        const existing = bySeller.get(p.sellerAddress) || [];
        for (let i = 0; i < c.qty; i++) existing.push(p);
        bySeller.set(p.sellerAddress, existing);
      }

      const newOrders: (typeof st.marketplace.orders)[number][] = [];
      for (const [sellerAddress, items] of bySeller) {
        const total = items.reduce((a, p) => a + p.price, 0);
        const description = items.map((p) => p.name).join(', ').slice(0, 200);

        const { escrowId, txHash } = await createEscrow({
          mnemonic,
          buyer: st.wallet.address,
          seller: sellerAddress,
          amount: toBaseUnits(total),
          denom: GAS_DENOM,
          description,
          disputeWindowSeconds: DISPUTE_WINDOW_SECONDS,
        });

        newOrders.push({
          id: 'ord-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 1000),
          items: items.map((p) => p.name),
          total,
          status: 'processing',
          ts: Date.now(),
          escrowId,
          sellerAddress,
          createTxHash: txHash,
        });
      }

      st.marketplace.orders.unshift(...newOrders);
      st.marketplace.cart = [];
      store.commit();
      toast(`Escrow locked for ${newOrders.length} order(s) — funds held until delivery confirmed`);
      setCartOpen(false);
    } catch (e) {
      const msg = e instanceof MarketplaceTxError ? e.message : 'Checkout failed';
      toast(msg);
    } finally {
      setCheckingOut(false);
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
        <h1>Marketplace</h1>
        <span className="sub">Escrow-protected commerce on Mallchain</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOrdersOpen(true)}>📦 Orders ({st.marketplace.orders.length})</button>
        <button className="btn btn-primary btn-sm" onClick={() => setCartOpen(true)}>🛒 Cart ({st.marketplace.cart.reduce((a, c) => a + c.qty, 0)})</button>
      </div>

      <div className="filter-row">
        <input className="input search" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        {CATS.map((c) => (
          <button key={c} className={'btn btn-ghost btn-sm' + (cat === c ? ' gold' : '')} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>

      {list.length === 0 && <div className="empty-state"><div className="es-ico">🛍</div><div className="es-t">No products match</div><div className="es-m">Try a different search or category.</div></div>}
      <div className="c-grid">
        {list.map((p) => (
          <div key={p.id} className="c-card">
            <div className="c-banner">
              <span style={{ fontSize: 26 }}>{p.img}</span>
              <div><div className="nm">{p.name}</div><div className="cr">by {p.seller} · ★ {p.rating}</div></div>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => toggleWish(p.id)} title="Wishlist">
                {inWish(p.id) ? '❤️' : '🤍'}
              </button>
            </div>
            <div className="c-body">
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(p.price, cur)}</div>
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
          <table className="tbl">
            <tbody>
              <tr><td className="muted">Seller</td><td>{detail.seller}</td></tr>
              <tr><td className="muted">Price</td><td><b className="gold">{fmtMoney(detail.price, cur)}</b></td></tr>
              <tr><td className="muted">Rating</td><td>★ {detail.rating} / 5</td></tr>
              <tr><td className="muted">Escrow</td><td><span className="chip green">Funds locked on-chain until delivery confirmed</span></td></tr>
            </tbody>
          </table>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            <button className="btn btn-primary" onClick={() => { addCart(detail.id); setDetail(null); }}>Add to cart</button>
          </div>
        </Modal>
      )}

      {cartOpen && (
        <Modal title="Your cart" onClose={() => setCartOpen(false)}>
          {st.marketplace.cart.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20, textAlign: 'center' }}>Your cart is empty.</div>}
          {st.marketplace.cart.map((c) => {
            const p = PRODUCTS.find((x) => x.id === c.id);
            return (
              <div key={c.id} className="list-row">
                <span style={{ fontSize: 20 }}>{p?.img}</span>
                <div className="grow"><div className="t">{p?.name}</div><div className="m">qty {c.qty} × {fmtMoney(p?.price || 0, cur)}</div></div>
                <b>{fmtMoney((p?.price || 0) * c.qty, cur)}</b>
              </div>
            );
          })}
          {st.marketplace.cart.length > 0 && (
            <>
              <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 800, marginTop: 8 }}>Total: <span className="gold">{fmtMoney(cartTotal, cur)}</span></div>
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
          {st.marketplace.orders.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No orders yet — place your first order.</div>}
          {st.marketplace.orders.map((o) => {
            const step = SHIP_FLOW.indexOf(o.status as (typeof SHIP_FLOW)[number]) + (o.status === 'delivered' ? 1 : 0);
            const busy = busyOrderId === o.id;
            return (
              <div key={o.id} className="card mb" style={{ background: 'var(--bg-2)' }}>
                <div className="row">
                  <div className="grow"><b>{o.id}</b> <span className="muted">· {new Date(o.ts).toLocaleDateString()}</span></div>
                  <StatusChip status={o.status} />
                  <b className="gold">{fmtMoney(o.total, cur)}</b>
                </div>
                <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>{o.items.join(', ')}</div>
                {o.escrowId && <div className="tiny muted">Escrow #{o.escrowId}</div>}
                {SHIP_FLOW.includes(o.status as (typeof SHIP_FLOW)[number]) && <Stepper steps={[...SHIP_FLOW]} current={step} />}
                <div className="row">
                  {o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'disputed' && (
                    <button className="btn btn-primary btn-sm" onClick={() => advanceOrder(o.id)} disabled={busy}>
                      {busy ? 'Releasing…' : 'Advance status'}
                    </button>
                  )}
                  {o.status === 'delivered' && <span className="chip green">✓ Escrow released</span>}
                  {(o.status === 'transit' || o.status === 'delivered') && (
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

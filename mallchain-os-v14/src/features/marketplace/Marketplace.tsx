import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtMoney, StatusChip, Stepper, Modal, toast } from '../../components/ui';

interface Product { id: string; name: string; seller: string; price: number; rating: number; img: string; cat: string }

const PRODUCTS: Product[] = [
  { id: 'prod-1', name: 'Nairobi Roast Coffee — 500g', seller: 'Safari Beans Co.', price: 32.5, rating: 4.8, img: '☕', cat: 'Food' },
  { id: 'prod-2', name: 'Maasai Beaded Bracelet', seller: 'Maa Crafts', price: 14.0, rating: 4.9, img: '📿', cat: 'Fashion' },
  { id: 'prod-3', name: 'Handmade Kiondo Basket', seller: 'Ujenzi Home', price: 48.0, rating: 4.7, img: '🧺', cat: 'Home' },
  { id: 'prod-4', name: 'Kente Print Scarf', seller: 'Accra Threads', price: 22.0, rating: 4.6, img: '🧣', cat: 'Fashion' },
  { id: 'prod-5', name: 'Solar Desk Lamp', seller: 'Jua Energy', price: 39.9, rating: 4.5, img: '💡', cat: 'Tech' },
  { id: 'prod-6', name: 'Baobab Superfood Powder', seller: 'Sahara Harvest', price: 18.5, rating: 4.4, img: '🌿', cat: 'Food' },
];

const CATS = ['All', 'Food', 'Fashion', 'Home', 'Tech'];

export default function Marketplace({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const cur = st.prefs.currency;
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);

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

  const checkout = () => {
    // escrow flow — funds locked, released on delivery confirmation
    const total = cartTotal;
    store.applyTx({
      type: 'escrow', amount: total, asset: 'USD_M', kind: 'debit',
      note: `Escrow lock for ${st.marketplace.cart.length} item(s)`,
      notifTitle: `Escrow locked — ${fmtMoney(total, cur)}`, notifKind: 'market',
      activityText: `Locked ${fmtMoney(total, cur)} in escrow`,
    });
    st.marketplace.orders.unshift({
      id: 'ord-' + Date.now().toString().slice(-6),
      items: st.marketplace.cart.map((c) => PRODUCTS.find((p) => p.id === c.id)?.name || c.id),
      total,
      status: 'processing',
      ts: Date.now(),
    });
    st.marketplace.cart = [];
    store.commit();
    toast('Order placed — funds held in escrow until delivery confirmed');
    setCartOpen(false);
  };

  const advanceOrder = (id: string) => {
    const o = st.marketplace.orders.find((x) => x.id === id);
    if (!o) return;
    const orderFlow = ['processing', 'shipped', 'transit', 'delivered'];
    const i = orderFlow.indexOf(o.status);
    if (i < orderFlow.length - 1) o.status = orderFlow[i + 1] as never;
    else {
      store.credit('USD_M', o.total, 'escrow-release', 'Escrow released');
      store.applyTx({ type: 'receive', amount: o.total, asset: 'USD_M', kind: 'credit', note: 'Escrow released on delivery confirmation', notifTitle: `Escrow released — ${fmtMoney(o.total, cur)}`, notifKind: 'market', activityText: `Received ${fmtMoney(o.total, cur)} from escrow release` });
      toast('Delivery confirmed — escrow released to seller');
    }
    store.commit();
  };

  const cancelOrder = (id: string) => {
    const o = st.marketplace.orders.find((x) => x.id === id);
    if (!o) return;
    o.status = 'cancelled';
    store.credit('USD_M', o.total, 'escrow-refund', 'Refund');
    store.commit();
    toast('Order cancelled — funds refunded');
  };

  const fileDispute = (id: string) => {
    const o = st.marketplace.orders.find((x) => x.id === id);
    if (o) { o.status = 'disputed'; store.commit(); toast('Dispute filed — awaiting mediation'); }
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
              <tr><td className="muted">Escrow</td><td><span className="chip green">Funds locked until delivery confirmed</span></td></tr>
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
              <div className="tiny mb">Funds are locked in a smart-contract escrow and released when you confirm delivery.</div>
              <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setCartOpen(false)}>Keep shopping</button><button className="btn btn-primary" onClick={checkout}>Checkout (escrow)</button></div>
            </>
          )}
        </Modal>
      )}

      {ordersOpen && (
        <Modal title="Your orders" onClose={() => setOrdersOpen(false)} wide>
          {st.marketplace.orders.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No orders yet — place your first order.</div>}
          {st.marketplace.orders.map((o) => {
            const flow = ['processing', 'shipped', 'transit', 'delivered'];
            const step = flow.indexOf(o.status) + (o.status === 'delivered' ? 1 : 0);
            return (
              <div key={o.id} className="card mb" style={{ background: 'var(--bg-2)' }}>
                <div className="row">
                  <div className="grow"><b>{o.id}</b> <span className="muted">· {new Date(o.ts).toLocaleDateString()}</span></div>
                  <StatusChip status={o.status} />
                  <b className="gold">{fmtMoney(o.total, cur)}</b>
                </div>
                <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>{o.items.join(', ')}</div>
                <Stepper steps={flow} current={step} />
                <div className="row">
                  {o.status === 'processing' && <button className="btn btn-ghost btn-sm" onClick={() => cancelOrder(o.id)}>Cancel order</button>}
                  {o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'disputed' && <button className="btn btn-primary btn-sm" onClick={() => advanceOrder(o.id)}>Advance status</button>}
                  {o.status === 'delivered' && <span className="chip green">✓ Escrow released</span>}
                  {(o.status === 'transit' || o.status === 'delivered') && <button className="btn btn-danger btn-sm" onClick={() => fileDispute(o.id)}>File dispute</button>}
                </div>
              </div>
            );
          })}
        </Modal>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, Modal } from '../../components/ui';
import { sim } from '../../services/config';

/** Explorer — blocks + txs streaming feed + detail modals. */
export default function Explorer() {
  useStoreVersion();
  const st = store.state;
  const [selBlock, setSelBlock] = useState<number | null>(null);
  const [selTx, setSelTx] = useState<string | null>(null);

  useEffect(() => {
    // streaming feed — only when simulations are enabled (demo mode, no API)
    const stop = sim.every(() => {
      const b = st.explorer.blocks[0];
      const nextH = (b?.h || 1482031) + 1;
      st.explorer.blocks.unshift({ h: nextH, txs: 180 + Math.floor(Math.random() * 80), ts: Date.now(), hash: '0x' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0') + '…' + Math.floor(Math.random() * 0xffff).toString(16) });
      st.explorer.txs.unshift({ hash: '0x' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') + '…' + Math.floor(Math.random() * 0xffff).toString(16), from: '0x' + Math.floor(Math.random() * 0xffffff).toString(16), to: st.wallet.address || '0x7A9f…D6f8', val: Math.round(Math.random() * 1000) / 100, ts: Date.now() });
      if (st.explorer.blocks.length > 12) st.explorer.blocks.length = 12;
      if (st.explorer.txs.length > 12) st.explorer.txs.length = 12;
      store.commit();
    }, 5000);
    return stop;
  }, [st]);

  const block = st.explorer.blocks.find((b) => b.h === selBlock);
  const tx = st.explorer.txs.find((t) => t.hash === selTx);

  return (
    <div>
      <div className="view-head"><h1>Explorer</h1><span className="sub">Mallchain mainnet</span><span className="chip green"><span className="stream-pulse" style={{ display: 'inline-block', marginRight: 6 }} />streaming live</span></div>
      <div className="explorer-layout">
        <div className="card">
          <div className="sec-title"><h2>Blocks</h2><span className="sub">latest first</span></div>
          {st.explorer.blocks.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>Waiting for network data…</div>}
          {st.explorer.blocks.map((b) => (
            <div key={b.h} className="flow-row" style={{ cursor: 'pointer' }} onClick={() => setSelBlock(b.h)}>
              <span className="stream-pulse" />
              <b>#{b.h.toLocaleString()}</b>
              <span className="hash">{b.hash}</span>
              <span className="grow" />
              <span className="chip">{b.txs} txs</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="sec-title"><h2>Transactions</h2><span className="sub">live feed</span></div>
          {st.explorer.txs.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>No transactions yet.</div>}
          {st.explorer.txs.map((t) => (
            <div key={t.hash} className="flow-row" style={{ cursor: 'pointer' }} onClick={() => setSelTx(t.hash)}>
              <span className="hash">{t.hash}</span>
              <span className="muted mono" style={{ fontSize: 10.5 }}>{t.from.slice(0, 8)}… → …{t.to.slice(-6)}</span>
              <span className="grow" />
              <b className="gold">{t.val} MALL</b>
            </div>
          ))}
        </div>
      </div>

      {block && (
        <Modal title={`Block #${block.h.toLocaleString()}`} onClose={() => setSelBlock(null)}>
          <table className="tbl"><tbody>
            <tr><td className="muted">Hash</td><td className="mono">{block.hash}</td></tr>
            <tr><td className="muted">Transactions</td><td>{block.txs}</td></tr>
            <tr><td className="muted">Timestamp</td><td>{new Date(block.ts).toLocaleString()}</td></tr>
            <tr><td className="muted">Proposer</td><td className="mono">validator-pool-{block.h % 157}</td></tr>
          </tbody></table>
        </Modal>
      )}
      {tx && (
        <Modal title={`Transaction ${tx.hash}`} onClose={() => setSelTx(null)}>
          <table className="tbl"><tbody>
            <tr><td className="muted">Hash</td><td className="mono">{tx.hash}</td></tr>
            <tr><td className="muted">From</td><td className="mono">{tx.from}</td></tr>
            <tr><td className="muted">To</td><td className="mono">{tx.to}</td></tr>
            <tr><td className="muted">Value</td><td><b className="gold">{tx.val} MALL</b></td></tr>
            <tr><td className="muted">Status</td><td><span className="mc-badge b-approved">Confirmed</span></td></tr>
          </tbody></table>
        </Modal>
      )}
    </div>
  );
}

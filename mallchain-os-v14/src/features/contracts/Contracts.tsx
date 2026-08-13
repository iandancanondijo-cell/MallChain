import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast, Modal } from '../../components/ui';

/** Smart Contracts — list, deploy, execute, query, events. */
export default function Contracts() {
  useStoreVersion();
  const st = store.state;
  const [open, setOpen] = useState<null | 'deploy' | 'execute' | 'query'>(null);

  const contracts = [
    { name: 'Mallcoin (MALL)', addr: '0x1A2b…E9f0', type: 'ERC-20', txs: 41209 },
    { name: 'Mallpoints (MLPTS)', addr: '0x8C4d…B7a2', type: 'ERC-20', txs: 88112 },
    { name: 'Escrow', addr: '0x5F6e…D3c1', type: 'Mallchain v2', txs: 12904 },
    { name: 'Staking', addr: '0x3B9a…F2e8', type: 'Mallchain v2', txs: 5033 },
    { name: 'Governance', addr: '0x0D7b…A9c4', type: 'Mallchain v2', txs: 211 },
  ];

  return (
    <div>
      <div className="view-head">
        <h1>Smart Contracts</h1>
        <span className="sub">Mallchain mainnet</span>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen('deploy')}>▲ Deploy</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen('execute')}>⚙ Execute</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen('query')}>🔍 Query</button>
        </div>
      </div>

      {st.contracts.length === 0 && (
        <div className="empty-state"><div className="es-ico">📜</div><div className="es-t">No contracts deployed yet</div><div className="es-m">Deploy a WASM contract or browse the verified set.</div><button className="btn btn-primary" onClick={() => setOpen('deploy')}>Deploy contract</button></div>
      )}

      {st.contracts.map((c) => (
        <div key={c.addr} className="card mb">
          <div className="row">
            <div className="grow"><b>{c.name}</b> <span className="chip mono" style={{ fontSize: 11 }}>{c.addr}</span></div>
            <span className="chip">{c.type}</span>
            <span className="chip">{c.txs} txs</span>
          </div>
          <div className="row mt">
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen('execute')}>Execute</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen('query')}>Query</button>
            <button className="btn btn-ghost btn-sm" onClick={() => toast('Events log — recent 50 shown')}>Events</button>
            <button className="btn btn-ghost btn-sm" onClick={() => toast('Storage viewer opened')}>Storage</button>
          </div>
        </div>
      ))}

      {open === 'deploy' && (
        <Modal title="Deploy contract" onClose={() => setOpen(null)}>
          <div className="field"><label>WASM file</label><input className="input" placeholder="contract.wasm" /></div>
          <div className="field"><label>Name</label><input className="input" placeholder="My Contract" /></div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => { toast('Deploy tx broadcast — pending confirmation'); setOpen(null); }}>Deploy (sign tx)</button>
          </div>
        </Modal>
      )}
      {open === 'execute' && (
        <Modal title="Execute contract" onClose={() => setOpen(null)}>
          <div className="field"><label>Contract</label><select className="input">{contracts.map((c) => <option key={c.addr}>{c.name} — {c.addr}</option>)}</select></div>
          <div className="field"><label>Function</label><select className="input"><option>approve(address,uint256)</option><option>transfer(address,uint256)</option><option>stake(uint256)</option></select></div>
          <div className="field"><label>Args (JSON)</label><textarea className="input" rows={2} defaultValue='{"amount": 100}' /></div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => { toast('Execution tx broadcast'); setOpen(null); }}>Sign & broadcast</button>
          </div>
        </Modal>
      )}
      {open === 'query' && (
        <Modal title="Query contract" onClose={() => setOpen(null)}>
          <div className="field"><label>Contract</label><select className="input">{contracts.map((c) => <option key={c.addr}>{c.name}</option>)}</select></div>
          <div className="field"><label>Function</label><select className="input"><option>balanceOf(address)</option><option>totalSupply()</option></select></div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => { toast('Result: 84,203.5 MALL'); setOpen(null); }}>Run (read-only)</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

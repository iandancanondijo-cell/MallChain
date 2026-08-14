import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, toast, Modal } from '../../components/ui';
import { contractsApi, type ContractRecord } from '../../services/contractsApi';

/**
 * Smart Contracts — real per-user records (backend/src/routes/contracts.js).
 * Deploy/execute are simulated (no real wasm upload pipeline in this repo),
 * but records persist server-side instead of vanishing on refresh.
 */
export default function Contracts() {
  useStoreVersion();
  const [contracts, setContracts] = useState<ContractRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<null | 'deploy' | 'execute' | 'query'>(null);
  const [active, setActive] = useState<ContractRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState('wasm');
  const [code, setCode] = useState('');
  const [method, setMethod] = useState('');
  const [args, setArgs] = useState('{}');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await contractsApi.list();
    if (res.ok && res.data) setContracts(res.data);
    else setError(res.error || 'Failed to load contracts');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deploy = async () => {
    if (!name.trim() || !code.trim()) return toast('Name and code are required', false);
    setBusy(true);
    const res = await contractsApi.deploy({ name, type, code });
    setBusy(false);
    if (res.ok) {
      toast(`Deployed — ${res.data?.address}`);
      setOpen(null);
      setName(''); setCode('');
      load();
    } else {
      toast(res.error || 'Deploy failed', false);
    }
  };

  const execute = async () => {
    if (!active || !method.trim()) return toast('Function is required', false);
    setBusy(true);
    let parsedArgs: unknown = {};
    try { parsedArgs = JSON.parse(args); } catch { /* leave as {} */ }
    const res = await contractsApi.interact(active._id, method, parsedArgs);
    setBusy(false);
    if (res.ok) {
      toast(`Executed — tx ${res.data?.txHash.slice(0, 10)}…`);
      setOpen(null);
      load();
    } else {
      toast(res.error || 'Execution failed', false);
    }
  };

  return (
    <div>
      <div className="view-head">
        <h1>Smart Contracts</h1>
        <span className="sub">Your deployed contracts</span>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen('deploy')}>▲ Deploy</button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      {!loading && contracts?.length === 0 && (
        <div className="empty-state"><div className="es-ico">📜</div><div className="es-t">No contracts deployed yet</div><button className="btn btn-primary" onClick={() => setOpen('deploy')}>Deploy contract</button></div>
      )}

      {(contracts || []).map((c) => (
        <div key={c._id} className="card mb">
          <div className="row">
            <div className="grow"><b>{c.name}</b> <span className="chip mono" style={{ fontSize: 11 }}>{c.address}</span></div>
            <span className="chip">{c.type}</span>
            <span className="chip">{c.txs} txs</span>
          </div>
          <div className="row mt">
            <button className="btn btn-ghost btn-sm" onClick={() => { setActive(c); setOpen('execute'); }}>Execute</button>
          </div>
        </div>
      ))}

      {open === 'deploy' && (
        <Modal title="Deploy contract" onClose={() => setOpen(null)}>
          <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Contract" /></div>
          <div className="field"><label>Type</label><input className="input" value={type} onChange={(e) => setType(e.target.value)} placeholder="wasm" /></div>
          <div className="field"><label>Code</label><textarea className="input" rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="(module ...)" /></div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={deploy}>{busy && <span className="spin" />} Deploy</button>
          </div>
        </Modal>
      )}
      {open === 'execute' && active && (
        <Modal title={`Execute — ${active.name}`} onClose={() => setOpen(null)}>
          <div className="field"><label>Function</label><input className="input" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="transfer" /></div>
          <div className="field"><label>Args (JSON)</label><textarea className="input" rows={2} value={args} onChange={(e) => setArgs(e.target.value)} /></div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={execute}>{busy && <span className="spin" />} Sign &amp; execute</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

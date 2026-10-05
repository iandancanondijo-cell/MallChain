import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast, Modal } from '../../components/ui';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { deployContract, executeContract, WasmTxError } from '../../services/wasmTx';
import { contractsApi, type ContractRecord } from '../../services/contractsApi';

export default function Contracts() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address as string;
  const [contracts, setContracts] = useState<ContractRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<null | 'deploy' | 'execute'>(null);
  const [active, setActive] = useState<ContractRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [initArgs, setInitArgs] = useState('{}');
  const [wasmFile, setWasmFile] = useState<File | null>(null);
  const [wasmBytes, setWasmBytes] = useState<Uint8Array | null>(null);
  const [method, setMethod] = useState('');
  const [args, setArgs] = useState('{}');
  const fileRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWasmFile(file);
    const reader = new FileReader();
    reader.onload = () => setWasmBytes(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  };

  const deploy = async () => {
    if (!name.trim()) return toast('Name is required', false);
    if (!wasmBytes) return toast('Select a .wasm file', false);
    if (!address) return toast('Connect a wallet first', false);

    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;

    setBusy(true);
    try {
      let parsedInit: Record<string, unknown> = {};
      try { parsedInit = JSON.parse(initArgs); } catch { /* leave as {} */ }

      const result = await deployContract({
        mnemonic,
        sender: address,
        wasmByteCode: wasmBytes,
        label: label || name,
        initMsg: parsedInit,
      });

      const codeStr = wasmFile?.name || `${wasmBytes.length} bytes`;
      const res = await contractsApi.deploy({
        name,
        type: 'wasm',
        code: codeStr,
        description: `codeId: ${result.codeId}`,
        txHash: result.instantiateTxHash,
        address: result.address,
      });

      if (res.ok) {
        toast(`Deployed — ${result.address}`);
        setOpen(null);
        resetDeployForm();
        load();
      } else {
        toast(res.error || 'Record saved but deploy metadata failed', false);
        load();
      }
    } catch (e) {
      const msg = e instanceof WasmTxError || e instanceof Error ? e.message : 'Deploy failed';
      toast(msg, false);
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!active || !method.trim()) return toast('Function is required', false);
    if (!address) return toast('Connect a wallet first', false);

    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;

    setBusy(true);
    try {
      let parsedArgs: Record<string, unknown> = {};
      try { parsedArgs = JSON.parse(args); } catch { /* leave as {} */ }

      const executeMsg = { [method]: parsedArgs };
      const result = await executeContract({
        mnemonic,
        sender: address,
        contractAddress: active.address,
        executeMsg,
      });

      const res = await contractsApi.interact(active._id, method, parsedArgs, result.txHash);
      if (res.ok) {
        toast(`Executed — tx ${result.txHash.slice(0, 10)}...`);
        setOpen(null);
        setMethod('');
        setArgs('{}');
        load();
      } else {
        toast(`Executed on-chain (tx ${result.txHash.slice(0, 10)}...) but record update failed`, false);
        load();
      }
    } catch (e) {
      const msg = e instanceof WasmTxError || e instanceof Error ? e.message : 'Execution failed';
      toast(msg, false);
    } finally {
      setBusy(false);
    }
  };

  const resetDeployForm = () => {
    setName('');
    setLabel('');
    setInitArgs('{}');
    setWasmFile(null);
    setWasmBytes(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!address) {
    return (
      <div>
        <div className="view-head"><h1>Smart Contracts</h1></div>
        <div className="card">
          <div className="empty-state">
            <div className="es-ico">📜</div>
            <div className="es-t">No wallet connected</div>
            <div className="es-m">Connect a wallet to deploy and interact with CosmWasm contracts on-chain.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="view-head">
        <h1>Smart Contracts</h1>
        <span className="sub">Deploy and execute CosmWasm contracts on-chain</span>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen('deploy')}>Deploy contract</button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>
        </div>
      )}

      {!loading && contracts?.length === 0 && (
        <div className="empty-state">
          <div className="es-ico">📜</div>
          <div className="es-t">No contracts deployed yet</div>
          <div className="es-m">Upload a .wasm binary to deploy a new contract instance on-chain.</div>
          <button className="btn btn-primary" onClick={() => setOpen('deploy')}>Deploy contract</button>
        </div>
      )}

      {(contracts || []).map((c) => (
        <div key={c._id} className="card mb">
          <div className="row">
            <div className="grow">
              <b>{c.name}</b>
              <span className="chip mono" style={{ fontSize: 11, marginLeft: 8 }}>{c.address}</span>
            </div>
            <span className="chip">{c.type}</span>
            <span className="chip">{c.txs} txs</span>
          </div>
          {c.description && <div className="tiny mt" style={{ opacity: 0.7 }}>{c.description}</div>}
          {c.txHash && <div className="tiny mt mono" style={{ opacity: 0.5 }}>tx: {c.txHash.slice(0, 18)}...</div>}
          <div className="row mt">
            <button className="btn btn-ghost btn-sm" onClick={() => { setActive(c); setOpen('execute'); }}>Execute</button>
          </div>
        </div>
      ))}

      {open === 'deploy' && (
        <Modal title="Deploy contract" onClose={() => { setOpen(null); resetDeployForm(); }}>
          <div className="field">
            <label>Contract name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Contract" />
          </div>
          <div className="field">
            <label>Label (on-chain metadata)</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={name || 'My Contract'} />
          </div>
          <div className="field">
            <label>WASM binary (.wasm)</label>
            <input ref={fileRef} type="file" accept=".wasm" onChange={handleFileChange} className="input" style={{ padding: '8px 0' }} />
            {wasmFile && <div className="tiny mt" style={{ opacity: 0.7 }}>{wasmFile.name} ({(wasmFile.size / 1024).toFixed(1)} KB)</div>}
          </div>
          <div className="field">
            <label>Init message (JSON)</label>
            <textarea className="input" rows={3} value={initArgs} onChange={(e) => setInitArgs(e.target.value)} placeholder='{"count": 0}' />
          </div>
          <div className="tiny mt" style={{ marginBottom: 12, opacity: 0.6 }}>
            Deploying uploads the wasm binary to the chain (MsgStoreCode) then creates an instance (MsgInstantiateContract) — two signed transactions.
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => { setOpen(null); resetDeployForm(); }}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !wasmBytes} onClick={deploy}>
              {busy && <span className="spin" />} Sign &amp; deploy
            </button>
          </div>
        </Modal>
      )}

      {open === 'execute' && active && (
        <Modal title={`Execute — ${active.name}`} onClose={() => setOpen(null)}>
          <div className="field">
            <label>Function</label>
            <input className="input" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="increment" />
          </div>
          <div className="field">
            <label>Args (JSON)</label>
            <textarea className="input" rows={2} value={args} onChange={(e) => setArgs(e.target.value)} placeholder="{}" />
          </div>
          <div className="tiny mt" style={{ marginBottom: 12, opacity: 0.6 }}>
            Sends a MsgExecuteContract to {active.address} — signed with your wallet key.
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={execute}>
              {busy && <span className="spin" />} Sign &amp; execute
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

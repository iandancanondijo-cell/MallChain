import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast, Modal } from '../../components/ui';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { deployContract, executeContract, WasmTxError } from '../../services/wasmTx';
import { contractsApi, type ContractOfferStatus, type ContractRecord } from '../../services/contractsApi';

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);

/**
 * One sentence per offer state. A contract that was never shared returns null
 * rather than a sentence about an offer that never happened.
 */
function offerSentence(c: ContractRecord): { label: string; detail: string } | null {
  const status: ContractOfferStatus = c.offerStatus ?? '';
  const to = c.counterpartyAddress || 'the account you named';
  const on = fmtDate(c.respondedAt || c.offeredAt);
  switch (status) {
    case 'offered':
      return { label: `Offered to ${to}`, detail: `waiting on their answer${on ? `, sent ${on}` : ''}. Nothing about the contract changes until they accept.` };
    case 'accepted':
      return { label: `Accepted by ${to}`, detail: `${on ? `on ${on}. ` : ''}Mallchain records that they took it on; accepting signed no transaction.` };
    case 'declined':
      return { label: `Declined by ${to}`, detail: `${on ? `on ${on}. ` : ''}You can offer this contract to another account.` };
    case 'revoked':
      return { label: 'Offer withdrawn', detail: `${on ? `on ${on} ` : ''}before they answered.` };
    default:
      return null;
  }
}

const EMPTY_ADDRESS_TEXT = 'not deployed on-chain';

/**
 * A contract record can legitimately carry `address: null`: the metadata is real
 * but nothing was ever broadcast, and the backend now refuses to invent an
 * address it cannot verify. This renders that state as what it is instead of
 * leaving a blank where an address usually sits, which reads like a glitch.
 */
function AddressChip({ contract }: { contract: ContractRecord }) {
  if (!contract.address) {
    return (
      <span
        className="chip"
        style={{ fontSize: 11, marginLeft: 8, opacity: 0.75 }}
        title="No MsgInstantiateContract behind this record yet — it is metadata until it is deployed."
      >
        {EMPTY_ADDRESS_TEXT}
      </span>
    );
  }
  return <span className="chip mono" style={{ fontSize: 11, marginLeft: 8 }}>{contract.address}</span>;
}

/**
 * How a record is named in prose a person reads, so a null never interpolates as
 * the string "null".
 */
function describeTarget(contract: ContractRecord): string {
  return contract.address || `${contract.name}, which has no on-chain instance yet`;
}

export default function Contracts() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address as string;
  const [contracts, setContracts] = useState<ContractRecord[] | null>(null);
  const [offers, setOffers] = useState<ContractRecord[] | null>(null);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<null | 'deploy' | 'execute' | 'share'>(null);
  const [active, setActive] = useState<ContractRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [initArgs, setInitArgs] = useState('{}');
  const [wasmFile, setWasmFile] = useState<File | null>(null);
  const [wasmBytes, setWasmBytes] = useState<Uint8Array | null>(null);
  const [method, setMethod] = useState('');
  const [args, setArgs] = useState('{}');
  const [shareTo, setShareTo] = useState('');
  const [shareNote, setShareNote] = useState('');
  const [shareError, setShareError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOffersError(null);
    const [mine, incoming] = await Promise.all([contractsApi.list(), contractsApi.offers()]);
    if (mine.ok && mine.data) setContracts(mine.data);
    else setError(mine.error || 'Failed to load contracts');
    // An offer read that failed is not "nothing is waiting", so it keeps its
    // own error slot instead of an empty list.
    if (incoming.ok) setOffers(incoming.data || []);
    else {
      setOffers(null);
      setOffersError(incoming.error || 'Failed to load contract offers');
    }
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
        // Both halves are true at once: the chain did create the instance — the
        // address and hash in `result` came from the broadcast — and Mallchain
        // has no record of it. The server's reason leads, because the wasm is
        // live either way and the address is the thing you need.
        toast(`${res.error || 'The deploy record was not saved'} — on-chain instance is ${result.address}`, false);
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
    // There is no instance to sign a call against, and asking for the mnemonic
    // to find that out would be a promise the chain cannot keep.
    if (!active.address) return toast('This record has no contract on-chain behind it, so there is nothing to execute — deploy it first', false);

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
        // The chain has the transaction — its hash came back from the broadcast
        // — but the Mallchain record did not take it. The server says why (it
        // could not reach the node, or the tx failed), so its reason leads.
        toast(`${res.error || 'Executed on-chain, but the record could not be updated'} (tx ${result.txHash.slice(0, 10)}…)`, false);
        load();
      }
    } catch (e) {
      const msg = e instanceof WasmTxError || e instanceof Error ? e.message : 'Execution failed';
      toast(msg, false);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!active) return;
    if (!shareTo.trim()) return toast('Enter the wallet address to share with', false);
    setBusy(true);
    setShareError(null);
    const res = await contractsApi.share(active._id, shareTo.trim(), shareNote.trim() || undefined);
    setBusy(false);
    if (res.ok) {
      toast(`Offered to ${shareTo.trim()} — they have to accept it themselves`);
      setOpen(null);
      setShareTo('');
      setShareNote('');
      load();
    } else {
      // The server owns the reason (no account has that address linked, own
      // account, already accepted), so it is shown as it answered.
      setShareError(res.error || 'Could not share this contract');
    }
  };

  const respond = async (c: ContractRecord, action: 'accept' | 'decline') => {
    setBusy(true);
    const res = action === 'accept' ? await contractsApi.accept(c._id) : await contractsApi.decline(c._id);
    setBusy(false);
    if (res.ok) toast(action === 'accept' ? `Accepted ${c.name}` : `Declined ${c.name}`);
    else toast(res.error || 'Could not record your answer', false);
    load();
  };

  const revoke = async (c: ContractRecord) => {
    setBusy(true);
    const res = await contractsApi.revoke(c._id);
    setBusy(false);
    if (res.ok) toast('Offer withdrawn');
    else toast(res.error || 'Could not withdraw the offer', false);
    load();
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
        <div className="view-head"><h1 className="text-gradient">Smart Contracts</h1></div>
        <div className="card card-glow bg-gradient-card">
          <div className="empty-state">
            <div className="es-ico">📜</div>
            <div className="es-t">No wallet connected</div>
            <div className="es-m">Connect a wallet to deploy and interact with CosmWasm contracts on-chain.</div>
          </div>
        </div>
      </div>
    );
  }

  const own = contracts || [];
  const incoming = offers || [];
  const waiting = incoming.filter((c) => c.offerStatus === 'offered');
  const acceptedIncoming = incoming.filter((c) => c.offerStatus === 'accepted');

  return (
    <div>
      <div className="view-head">
        <h1 className="text-gradient">Smart Contracts</h1>
        <span className="sub">Deploy and execute CosmWasm contracts on-chain, and offer one to another account</span>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen('deploy')}>Deploy contract</button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>
        </div>
      )}

      <div className="earn-grid" style={{ marginBottom: 14 }}>
        <div className="card earn-card">
          <div className="lbl">Deployed by you</div>
          <div className="num">{contracts ? contracts.length : '—'}</div>
          <div className="def">
            {contracts
              ? 'Each is a wasm instance your own key deployed, plus the record Mallchain keeps beside it.'
              : 'This list could not be read, so the count is unknown — not zero.'}
          </div>
          <div className="src">contracts · userId = you</div>
        </div>
        <div className="card earn-card">
          <div className="lbl">Waiting on your answer</div>
          <div className="num">{offers ? waiting.length : '—'}</div>
          <div className="def">
            {offersError
              ? 'The offers could not be read, so nothing is being claimed about them.'
              : 'An offer grants nothing until you accept it. Accepting is recorded by Mallchain and signs no transaction.'}
          </div>
          <div className="src">contracts · counterpartyUserId = you · offerStatus</div>
        </div>
        <div className="card earn-card">
          <div className="lbl">You accepted</div>
          <div className="num">{offers ? acceptedIncoming.length : '—'}</div>
          <div className="def">
            {acceptedIncoming.length
              ? 'These you may execute from your own key, the way the owner can.'
              : 'Accepting is what lets you use someone else’s contract. Nothing is handed to you without your answer.'}
          </div>
          <div className="src">contracts · offerStatus = accepted</div>
        </div>
      </div>

      <div className="sec-title mt"><h2>Shared with you</h2></div>

      {offersError && (
        <div className="card mb" style={{ borderColor: 'var(--red)', padding: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {offersError}</div>
          <div className="tiny mt">This is a read that failed, not an empty inbox — an offer may still be waiting.</div>
          <div className="row mt"><button className="btn btn-ghost btn-sm" onClick={load}>Re-check offers</button></div>
        </div>
      )}

      {!offersError && offers?.length === 0 && (
        <div className="card mb card-glow bg-gradient-card">
          <div className="empty-state">
            <div className="es-ico">📥</div>
            <div className="es-t">No contracts shared with you</div>
            <div className="es-m">An account that deployed a contract can offer it to the wallet address you have linked. Nothing appears here by itself.</div>
          </div>
        </div>
      )}

      {waiting.map((c) => (
        <div key={`wait-${c._id}`} className="card mb card-glow bg-gradient-card card-hover" style={{ borderColor: 'var(--gold)' }}>
          <div className="row">
            <div className="grow">
              <b>{c.name}</b>
              <AddressChip contract={c} />
            </div>
            <span className="chip">offered</span>
          </div>
          <div className="tiny mt" style={{ opacity: 0.75 }}>
            From {c.ownerAddress || 'an account with no linked wallet'} · offered to {address}
            {c.offeredAt ? ` · ${new Date(c.offeredAt).toLocaleString()}` : ''}
          </div>
          {c.offerNote && <div className="tiny mt">“{c.offerNote}”</div>}
          {c.description && <div className="tiny mt" style={{ opacity: 0.7 }}>{c.description}</div>}
          <div className="def mt">
            Accepting records that this contract is yours to use and lets you execute it with your own key. It does not change the contract on
            chain and moves no funds — the wasm still only obeys signed transactions.
          </div>
          <div className="row mt">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => respond(c, 'accept')}>Accept contract</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => respond(c, 'decline')}>Decline</button>
          </div>
          <div className="src">contracts · offerStatus = offered · counterpartyAddress</div>
        </div>
      ))}

      {acceptedIncoming.map((c) => (
        <div key={`acc-${c._id}`} className="card mb card-glow bg-gradient-card">
          <div className="row">
            <div className="grow">
              <b>{c.name}</b>
              <AddressChip contract={c} />
            </div>
            <span className="chip green">accepted</span>
            <span className="chip">{c.txs} txs</span>
          </div>
          <div className="tiny mt" style={{ opacity: 0.75 }}>
            Offered by {c.ownerAddress || 'an account with no linked wallet'}
            {c.respondedAt ? ` · you accepted ${new Date(c.respondedAt).toLocaleDateString()}` : ''}
          </div>
          <div className="row mt">
            {c.address ? (
              <button className="btn btn-ghost btn-sm" onClick={() => { setActive(c); setOpen('execute'); setMethod(''); setArgs('{}'); }}>Execute</button>
            ) : (
              <span className="tiny" style={{ opacity: 0.6 }}>
                This offer has no on-chain instance behind it, so there is nothing here to execute until its owner deploys one.
              </span>
            )}
          </div>
        </div>
      ))}

      <div className="sec-title mt"><h2>Your contracts</h2></div>

      {!loading && contracts?.length === 0 && (
        <div className="empty-state">
          <div className="es-ico">📜</div>
          <div className="es-t">No contracts deployed yet</div>
          <div className="es-m">Upload a .wasm binary to deploy a new contract instance on-chain.</div>
          <button className="btn btn-primary" onClick={() => setOpen('deploy')}>Deploy contract</button>
        </div>
      )}

      {own.map((c) => {
        const offer = offerSentence(c);
        return (
          <div key={c._id} className="card mb card-glow bg-gradient-card card-hover">
            <div className="row">
              <div className="grow">
                <b>{c.name}</b>
                <AddressChip contract={c} />
              </div>
              <span className="chip">{c.type}</span>
              <span className="chip">{c.txs} txs</span>
            </div>
            {c.description && <div className="tiny mt" style={{ opacity: 0.7 }}>{c.description}</div>}
            {c.txHash ? (
              <div className="tiny mt mono" style={{ opacity: 0.5 }}>instantiate tx: {c.txHash.slice(0, 18)}...</div>
            ) : (
              <div className="tiny mt" style={{ opacity: 0.5 }}>
                No instantiation transaction behind this record, so it is metadata only — there is no on-chain instance to execute yet.
              </div>
            )}
            {offer && (
              <div className="tiny mt">
                <b>{offer.label}</b> — {offer.detail}
              </div>
            )}
            <div className="row mt">
              {c.address && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setActive(c); setOpen('execute'); setMethod(''); setArgs('{}'); }}>Execute</button>
              )}
              {c.offerStatus === 'offered' ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setActive(c); setShareError(null); setOpen('share'); }}>Change offer</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => revoke(c)}>Withdraw offer</button>
                </>
              ) : c.offerStatus === 'accepted' ? null : (
                <button className="btn btn-ghost btn-sm" onClick={() => { setActive(c); setShareError(null); setShareTo(''); setShareNote(''); setOpen('share'); }}>Share</button>
              )}
            </div>
            {c.offerStatus === 'accepted' && (
              <div className="tiny mt" style={{ opacity: 0.6 }}>
                One contract record holds one counterparty, and their answer is a settled fact — it cannot be re-pointed or withdrawn from here.
                Deploying a new instance is how the same code is handed to someone else.
              </div>
            )}
          </div>
        );
      })}

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
            Sends a MsgExecuteContract to {describeTarget(active)} — signed with your wallet key.
            {acceptedIncoming.some((c) => c._id === active._id)
              ? ' You are calling as the account it was offered to, so the contract’s own permissions decide whether the call goes through.'
              : ''}
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={execute}>
              {busy && <span className="spin" />} Sign &amp; execute
            </button>
          </div>
        </Modal>
      )}

      {open === 'share' && active && (
        <Modal title={`Share — ${active.name}`} onClose={() => setOpen(null)}>
          <div className="field">
            <label>Wallet address to offer it to</label>
            <input className="input mono" value={shareTo} onChange={(e) => setShareTo(e.target.value)} placeholder="mall1…" />
            <div className="hint">
              The account that has this address linked is the one asked to accept. A shared contract is not public — only that account and you can
              read it.
            </div>
          </div>
          <div className="field">
            <label>Note for them (optional)</label>
            <textarea className="input" rows={2} value={shareNote} onChange={(e) => setShareNote(e.target.value)} placeholder="What this contract is for" />
          </div>
          {shareError && (
            <div className="card mb" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 12 }}>
              <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {shareError}</div>
            </div>
          )}
          <div className="tiny mt" style={{ marginBottom: 12, opacity: 0.6 }}>
            Nothing about the contract changes when you offer it. Their acceptance is stored by Mallchain against their own account, and it is not
            a signature.
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={share}>
              {busy && <span className="spin" />} Send offer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

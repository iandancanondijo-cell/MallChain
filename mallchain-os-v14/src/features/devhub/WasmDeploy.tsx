import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { inspectWasm, formatBytes, MAX_WASM_BYTES, type WasmInspection } from '../../services/wasmInspect';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { storeCode, deployContract } from '../../services/wasmTx';

const ENTRY_POINTS = new Set(['instantiate', 'execute', 'query', 'migrate', 'sudo', 'reply', 'allocate', 'deallocate', 'interface_version_8']);
const MGP20_INIT = '{"name":"Example Token","symbol":"EXT","decimals":6}';

const BUILD_STEPS = [
  { n: '01', t: 'Install the target', c: 'rustup target add wasm32-unknown-unknown', m: 'The chain runs the WebAssembly MVP, so the target is wasm32-unknown-unknown — not wasi.' },
  { n: '02', t: 'Build the contract', c: 'RUSTFLAGS="-C link-arg=-s" cargo build --release --target wasm32-unknown-unknown', m: 'Run this inside wasm/contracts/mgp20 (or your own crate). The -s link flag strips the symbol table.' },
  { n: '03', t: 'Shrink the module', c: 'wasm-opt -Oz --signext-lowering target/wasm32-unknown-unknown/release/mgp20_contract.wasm -o contract.wasm', m: 'Optional, but upload gas is proportional to byte size. The result must stay under 8 MiB.' },
  { n: '04', t: 'Inspect, then upload', c: 'sha256sum contract.wasm', m: 'Drop the file below. The inspector reads the same header and export table the chain will, so a bad build is caught before it costs gas.' },
];

interface DeployResult {
  mode: 'store' | 'deploy';
  codeId: string;
  txHash: string;
  address?: string;
  instantiateTxHash?: string;
}

/**
 * The wasm bench. There is no compiler in this deployment and the page says so:
 * it inspects the module you built, then signs the real MsgStoreCode /
 * MsgInstantiateContract with the same builders the Contracts screen uses.
 */
export function WasmDeploy({ wasm, onInspect, onUseInConsole }: {
  wasm: WasmInspection | null;
  onInspect: (report: WasmInspection | null) => void;
  onUseInConsole: (command: string) => void;
}) {
  useStoreVersion();
  const fromAddress = store.state.wallet.address;

  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [label, setLabel] = useState('my-contract');
  const [initJson, setInitJson] = useState('{}');
  const [busy, setBusy] = useState<'store' | 'deploy' | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, []);

  const initParsed: { ok: true; value: Record<string, unknown> } | { ok: false; error: string } = (() => {
    try {
      const v = JSON.parse(initJson);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false as const, error: 'The instantiate message must be a JSON object.' };
      return { ok: true as const, value: v as Record<string, unknown> };
    } catch (e) {
      return { ok: false as const, error: `Invalid JSON: ${(e as Error).message}` };
    }
  })();

  const takeFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError(null);
    setResult(null);
    try {
      const report = await inspectWasm(file);
      if (cancelled.current) return;
      onInspect(report);
      if (report.ok) toast(`${file.name} inspected — ${formatBytes(report.bytes)}, ${report.exports.length} exports`);
      else toast(report.issues.find((i) => i.level === 'error')?.text.slice(0, 120) || 'That module was rejected', false);
    } catch (e) {
      if (!cancelled.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelled.current) setReading(false);
    }
  }, [onInspect]);

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${what} copied`);
    } catch {
      toast('Clipboard is blocked in this browser', false);
    }
  };

  const deploy = async (mode: 'store' | 'deploy') => {
    if (!wasm || !wasm.ok || busy) return;
    if (!fromAddress) {
      setError('Connect a wallet first — the uploader address is the signing address.');
      return;
    }
    if (mode === 'deploy' && !initParsed.ok) {
      setError(initParsed.error);
      return;
    }
    if (mode === 'deploy' && !label.trim()) {
      setError('Give the instance a label so you can find it later.');
      return;
    }
    const proceed = window.confirm(
      mode === 'store'
        ? `Upload ${wasm.fileName} (${formatBytes(wasm.bytes)}) as MsgStoreCode, signed by ${fromAddress}?\n\nThis costs gas and cannot be undone.`
        : `Upload ${wasm.fileName} and then instantiate it as “${label.trim()}” with ${initJson}?\n\nTwo transactions, both signed by ${fromAddress}, both costing gas.`
    );
    if (!proceed) return;

    setBusy(mode);
    setError(null);
    setResult(null);
    let mnemonic: string | null = null;
    try {
      mnemonic = await requestMnemonic();
      if (cancelled.current) return;
      if (!mnemonic) {
        setError('The cipher wall was dismissed, so nothing was uploaded.');
        return;
      }
      if (mode === 'store') {
        const r = await storeCode({ mnemonic, sender: fromAddress, wasmByteCode: wasm.data });
        if (cancelled.current) return;
        setResult({ mode, codeId: r.codeId, txHash: r.txHash });
        toast(`Stored as code ${r.codeId}`);
      } else {
        const r = await deployContract({ mnemonic, sender: fromAddress, wasmByteCode: wasm.data, label: label.trim(), initMsg: initParsed.ok ? initParsed.value : {} });
        if (cancelled.current) return;
        setResult({ mode, codeId: r.codeId, txHash: r.storeTxHash, address: r.address, instantiateTxHash: r.instantiateTxHash });
        toast(`Contract live at ${r.address.slice(0, 18)}…`);
      }
    } catch (e) {
      if (!cancelled.current) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        toast(message.slice(0, 120), false);
      }
    } finally {
      mnemonic = null;
      if (!cancelled.current) setBusy(null);
    }
  };

  const callCommand = result?.address ? `execute ${result.address} {"transfer":{"to":"mall1…","amount":"100"}}` : '';

  return (
    <div>
      <div className="dh-console">
        <div className="card card-glow bg-gradient-card dh-pane">
          <div className="dh-pane-head">
            <h2>Module</h2>
            <span className="chip" style={{ color: 'var(--dh-magenta)', borderColor: 'rgba(232,121,249,0.4)' }}>local inspection</span>
          </div>
          <div className="dh-pane-body">
            <input
              ref={fileRef}
              className="dh-file-input"
              type="file"
              accept=".wasm,application/wasm"
              onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ''; }}
              aria-label="Choose a compiled .wasm module"
            />
            {!wasm && (
              <div
                className={'dh-drop' + (over ? ' over' : '')}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); takeFile(e.dataTransfer.files?.[0]); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
              >
                <div className="dh-drop-ico">{reading ? <span className="spin" /> : '⬡'}</div>
                <div className="dh-drop-t">{reading ? 'Reading the module…' : 'Drop a compiled .wasm here'}</div>
                <div className="dh-drop-m">
                  or click to choose a file · max {formatBytes(MAX_WASM_BYTES)}<br />
                  The bytes stay in this tab until you sign an upload.
                </div>
              </div>
            )}

            {wasm && (
              <div className="dh-report">
                <div className="dh-report-head">
                  <span className={'dh-verdict ' + (wasm.ok ? 'ok' : 'bad')}>{wasm.ok ? 'deployable' : 'rejected'}</span>
                  <span className="dh-file-name">{wasm.fileName}</span>
                  <div className="grow" />
                  <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Replace</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { onInspect(null); setResult(null); }}>Remove</button>
                </div>

                <div className="dh-facts">
                  <div className="dh-fact"><div className="dh-fact-k">Size</div><div className="dh-fact-v">{formatBytes(wasm.bytes)}</div></div>
                  <div className="dh-fact"><div className="dh-fact-k">Wasm version</div><div className="dh-fact-v">{wasm.version ?? '—'}</div></div>
                  <div className="dh-fact"><div className="dh-fact-k">Functions</div><div className="dh-fact-v">{wasm.functionCount}</div></div>
                  <div className="dh-fact"><div className="dh-fact-k">Memory</div><div className="dh-fact-v">{wasm.memoryPages === null ? '—' : `${wasm.memoryPages} pages`}</div></div>
                  <div className="dh-fact"><div className="dh-fact-k">Imports</div><div className="dh-fact-v">{wasm.importModules.join(', ') || 'none'}</div></div>
                  <div className="dh-fact"><div className="dh-fact-k">Exports</div><div className="dh-fact-v">{wasm.exports.length}</div></div>
                </div>

                <div>
                  <h3 className="dh-subhead">SHA-256</h3>
                  {wasm.sha256 ? (
                    <div className="dh-key-secret">
                      <span className="dh-hash grow">{wasm.sha256}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => copy(wasm.sha256 as string, 'Checksum')}>Copy</button>
                    </div>
                  ) : (
                    <div className="dh-note">Unavailable — this origin has no WebCrypto. Compare the file with <span className="mono">sha256sum</span> locally before uploading.</div>
                  )}
                </div>

                {wasm.sections.length > 0 && (
                  <div>
                    <h3 className="dh-subhead">Sections</h3>
                    <div className="dh-sections">
                      {wasm.sections.map((s, i) => (
                        <span className="dh-section-chip" key={`${s.id}-${i}`}>{s.name}{s.count !== undefined ? <> · <b>{s.count}</b></> : null} · {formatBytes(s.bytes)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {wasm.exports.length > 0 && (
                  <div>
                    <h3 className="dh-subhead">Exported symbols</h3>
                    <div className="dh-exports">
                      {wasm.exports.map((x) => (
                        <span className={'dh-export' + (ENTRY_POINTS.has(x.name) ? ' entry' : '')} key={x.name} title={`${x.kind} #${x.index}`}>{x.name}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="dh-subhead">Findings</h3>
                  <div className="dh-issues">
                    {wasm.issues.length === 0 && <div className="dh-issue dh-issue-info"><span className="dh-issue-mark">·</span><span>Nothing to flag.</span></div>}
                    {wasm.issues.map((issue, i) => (
                      <div className={'dh-issue dh-issue-' + issue.level} key={i}>
                        <span className="dh-issue-mark">{issue.level === 'error' ? '✕' : issue.level === 'warn' ? '!' : '·'}</span>
                        <span>{issue.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {error && <div className="dh-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          </div>
        </div>

        <div className="card card-glow bg-gradient-card dh-pane">
          <div className="dh-pane-head">
            <h2>Deploy</h2>
            <span className="chip">{fromAddress ? `${fromAddress.slice(0, 14)}…` : 'no wallet'}</span>
          </div>
          <div className="dh-pane-body">
            <div className="dh-note" style={{ marginBottom: 14 }}>
              <b>This page does not compile.</b> No Rust toolchain runs here, so build the module yourself with the steps below and upload the result.
              What happens next is real: <span className="mono">MsgStoreCode</span> writes your bytecode to the chain and returns a code ID;
              <span className="mono"> MsgInstantiateContract</span> creates an instance of it. Both are signed offline on this device.
            </div>

            <div className="field">
              <label className="label" htmlFor="dh-label">Instance label</label>
              <input id="dh-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={128} placeholder="my-contract" disabled={!!busy} />
              <div className="hint">How this instance is listed on chain. 1–128 characters.</div>
            </div>

            <div className="field">
              <label className="label" htmlFor="dh-init">Instantiate message (JSON)</label>
              <textarea
                id="dh-init"
                className={'dh-json' + (!initParsed.ok ? ' bad' : '')}
                value={initJson}
                onChange={(e) => setInitJson(e.target.value)}
                spellCheck={false}
                disabled={!!busy}
              />
              {!initParsed.ok
                ? <div className="hint" style={{ color: 'var(--red-2)' }}>{initParsed.error}</div>
                : <div className="hint">Passed verbatim to your contract's <span className="mono">instantiate</span> entry point.</div>}
              <div className="dh-rail-row" style={{ marginTop: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setInitJson('{}')} disabled={!!busy}>Empty object</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setInitJson(MGP20_INIT)} disabled={!!busy}>mgp20 token shape</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { try { setInitJson(JSON.stringify(JSON.parse(initJson), null, 2)); } catch { toast('Fix the JSON first', false); } }} disabled={!!busy}>Format</button>
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                The mgp20 preset matches <span className="mono">wasm/contracts/mgp20/src/lib.rs</span> — name, symbol and decimals.
              </div>
            </div>

            <div className="dh-rail-row" style={{ marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => deploy('store')} disabled={!wasm?.ok || !!busy || !fromAddress}>
                {busy === 'store' ? <><span className="spin" /> Uploading…</> : 'Store code only'}
              </button>
              <button className="btn btn-primary" onClick={() => deploy('deploy')} disabled={!wasm?.ok || !!busy || !fromAddress || !initParsed.ok}>
                {busy === 'deploy' ? <><span className="spin" /> Deploying…</> : 'Store & instantiate'}
              </button>
            </div>
            {!fromAddress && <div className="hint" style={{ marginTop: 8, color: 'var(--dh-amber)' }}>Connect a wallet to enable uploading.</div>}
            {wasm && !wasm.ok && <div className="hint" style={{ marginTop: 8, color: 'var(--red-2)' }}>Fix the module's errors before uploading — the chain would reject it and you would still pay gas.</div>}

            {result && (
              <div style={{ marginTop: 16 }}>
                <h3 className="dh-subhead">On-chain result</h3>
                <div className="dh-result" style={{ margin: 0 }}>
                  <div className="dh-result-row"><span className="dh-result-k">code id</span><span className="dh-result-v">{result.codeId}</span></div>
                  <div className="dh-result-row"><span className="dh-result-k">store tx</span><span className="dh-result-v">{result.txHash}</span></div>
                  {result.address && <div className="dh-result-row"><span className="dh-result-k">contract</span><span className="dh-result-v">{result.address}</span></div>}
                  {result.instantiateTxHash && <div className="dh-result-row"><span className="dh-result-k">instantiate tx</span><span className="dh-result-v">{result.instantiateTxHash}</span></div>}
                </div>
                <div className="dh-rail-row" style={{ marginTop: 9 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => copy(result.codeId, 'Code ID')}>Copy code ID</button>
                  {result.address && <button className="btn btn-ghost btn-sm" onClick={() => copy(result.address as string, 'Contract address')}>Copy address</button>}
                  {result.address && <button className="btn btn-primary btn-sm" onClick={() => onUseInConsole(callCommand)}>Call it in the console</button>}
                </div>
                {callCommand && <div className="dh-parse-hint" style={{ marginTop: 8 }}>{callCommand}</div>}
              </div>
            )}

            {wasm?.ok && !result && (
              <div style={{ marginTop: 16 }}>
                <h3 className="dh-subhead">Or drive it from a sentence</h3>
                <div className="dh-note">The console can run the same upload. Attach this module there and type:</div>
                <div className="dh-rail-row" style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => onUseInConsole('store wasm')}>store wasm</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onUseInConsole(`deploy label "${label.trim() || 'my-contract'}" init ${initJson}`)}>deploy label …</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onUseInConsole(`instantiate 1 label "${label.trim() || 'my-contract'}" init ${initJson}`)}>instantiate an existing code ID</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card mt card-glow bg-gradient-card">
        <div className="sec-title"><h2>Build the module yourself</h2><span className="sub">the honest path from Rust to bytecode</span></div>
        <div className="dh-build">
          {BUILD_STEPS.map((s) => (
            <div className="dh-build-step" key={s.n}>
              <div className="dh-build-n">{s.n}</div>
              <div className="dh-build-t">{s.t}</div>
              <div className="dh-build-c">{s.c}</div>
              <div className="dh-build-m">{s.m}</div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 9 }} onClick={() => copy(s.c, 'Command')}>Copy</button>
            </div>
          ))}
        </div>
        <div className="dh-note" style={{ marginTop: 12 }}>
          A CosmWasm contract must export <span className="mono">allocate</span>, <span className="mono">deallocate</span>, <span className="mono">interface_version_8</span> and at least one of
          <span className="mono"> instantiate</span>, <span className="mono">execute</span>, <span className="mono">query</span>, <span className="mono">migrate</span>, <span className="mono">sudo</span> or <span className="mono">reply</span>.
          The inspector above checks exactly that, plus the header, section order and the 8 MiB upload limit.
        </div>
      </div>
    </div>
  );
}
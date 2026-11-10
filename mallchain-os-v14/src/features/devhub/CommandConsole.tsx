import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { parseCommand, COMMAND_EXAMPLES, type ParsedCommand, type ParseResult } from '../../services/commandParser';
import { runCommand, type LogLevel } from '../../services/commandRunner';
import { requestMnemonic } from '../../services/mnemonicAccess';
import type { WasmInspection } from '../../services/wasmInspect';
import { formatBytes } from '../../services/wasmInspect';

type Verbosity = 'all' | 'important' | 'errors';
type ExampleGroup = 'all' | 'read' | 'funds' | 'write';

interface LogEntry {
  id: number;
  at: number;
  level: LogLevel | 'cmd';
  text: string;
  result?: Record<string, string | number>;
}

const MARK: Record<LogEntry['level'], string> = { cmd: '›', info: '·', ok: '✓', warn: '!', error: '✕' };
const GROUP_OF: Record<string, ExampleGroup> = {
  balance: 'read', send: 'funds', stake: 'funds', unstake: 'funds', delegate: 'funds', undelegate: 'funds',
  swap: 'funds', escrow: 'funds', release: 'funds', propose: 'funds',
  vote: 'write', dispute: 'write', storeCode: 'write', instantiate: 'write', deploy: 'write', execute: 'write',
};
const LEVEL_RANK: Record<LogEntry['level'], number> = { cmd: 2, error: 3, warn: 2, ok: 2, info: 1 };
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });

function paramRows(command: ParsedCommand): Array<[string, string]> {
  return Object.entries(command.intent)
    .filter(([k]) => k !== 'kind')
    .map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)] as [string, string]);
}

/**
 * The natural-language command workspace.
 *
 * The sentence is parsed locally into one exact transaction intent, shown in
 * full before anything is signed, then handed to the same builder the matching
 * app screen uses. Nothing is invented: an unparseable sentence says so, and a
 * failed broadcast prints the chain's own error.
 */
export function CommandConsole({ wasm, onOpenDeploy, seed }: {
  wasm: WasmInspection | null;
  onOpenDeploy: () => void;
  /** A command handed over from the Deploy bench. A new object each time. */
  seed?: { text: string; id: number } | null;
}) {
  useStoreVersion();
  const fromAddress = store.state.wallet.address;
  // Existence of key material only — the phrase itself is never read here.
  // An address can be loaded on a device that cannot sign with it, and the rail
  // should say so before a command reaches the wall rather than after.
  const canSign = !!store.state.wallet.pinEncryptedMnemonic || !!store.state.wallet.mnemonic;

  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyAt, setHistoryAt] = useState(-1);

  const [autoParse, setAutoParse] = useState(true);
  const [confirmFunds, setConfirmFunds] = useState(true);
  const [verbosity, setVerbosity] = useState<Verbosity>('all');
  const [stamps, setStamps] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [group, setGroup] = useState<ExampleGroup>('all');

  const termRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);
  const cancelled = useRef(false);

  useEffect(() => {
    // StrictMode mounts, unmounts and remounts in development — resetting here
    // is what keeps the second mount usable.
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, []);

  const parsed: ParseResult | null = useMemo(
    () => (autoParse && input.trim() ? parseCommand(input, fromAddress) : null),
    [autoParse, input, fromAddress],
  );

  useEffect(() => {
    if (!seed) return;
    setInput(seed.text);
    setHistoryAt(-1);
    composerRef.current?.focus();
  }, [seed]);

  const append = useCallback((level: LogEntry['level'], text: string, result?: Record<string, string | number>) => {
    seq.current += 1;
    const entry: LogEntry = { id: seq.current, at: Date.now(), level, text, result };
    setEntries((prev) => [...prev.slice(-399), entry]);
  }, []);

  useEffect(() => {
    if (autoScroll && termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [entries, autoScroll]);

  const visible = useMemo(() => {
    const floor = verbosity === 'all' ? 0 : verbosity === 'important' ? 2 : 3;
    return entries.filter((e) => LEVEL_RANK[e.level] >= floor);
  }, [entries, verbosity]);

  const examples = useMemo(() => {
    if (group === 'all') return COMMAND_EXAMPLES;
    return COMMAND_EXAMPLES.filter((ex) => {
      const r = parseCommand(ex.text);
      return r.ok && GROUP_OF[r.command.intent.kind] === group;
    });
  }, [group]);

  const run = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || running) return;
    const result = parseCommand(text, fromAddress);
    append('cmd', text);
    setHistory((h) => [...h.filter((x) => x !== text), text].slice(-50));
    setHistoryAt(-1);

    if (!result.ok) {
      append('error', result.error);
      if (result.hint) append('info', result.hint);
      return;
    }

    const command = result.command;
    append('info', command.summary);

    if (command.needsWasm && !wasm) {
      append('error', 'No .wasm attached. Open the Deploy tab, inspect a compiled module, then send it here.');
      return;
    }
    if (command.needsMnemonic && !fromAddress) {
      append('error', 'No wallet is connected on this device, so there is nothing to sign with. Connect one in Wallet first.');
      return;
    }
    if (confirmFunds && command.risk === 'funds') {
      const proceed = window.confirm(`${command.summary}\n\nSign and broadcast this transaction?`);
      if (!proceed) {
        append('warn', 'Cancelled at the confirmation step. Nothing was signed.');
        return;
      }
    }

    setRunning(true);
    let mnemonic: string | null = null;
    try {
      if (command.needsMnemonic) {
        append('info', 'Unlocking the signing key at the cipher wall…');
        mnemonic = await requestMnemonic();
        if (cancelled.current) return;
        if (!mnemonic) {
          append('warn', 'The cipher wall was dismissed. Nothing was signed.');
          return;
        }
      }
      const outcome = await runCommand(command, {
        fromAddress,
        mnemonic,
        wasm: wasm?.data ?? null,
        wasmName: wasm?.fileName,
        log: (level, message) => { if (!cancelled.current) append(level, message); },
      });
      if (cancelled.current) return;
      if (outcome.ok) {
        append('ok', 'Done.', outcome.data);
        toast('Command executed');
      } else {
        append('error', outcome.error);
        toast(outcome.error.slice(0, 120), false);
      }
    } catch (e) {
      if (!cancelled.current) append('error', e instanceof Error ? e.message : String(e));
    } finally {
      // The plaintext phrase must not outlive the call that needed it.
      mnemonic = null;
      if (!cancelled.current) setRunning(false);
    }
  }, [append, confirmFunds, fromAddress, running, wasm]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run(input);
      return;
    }
    if (e.key === 'ArrowUp' && !input.includes('\n') && history.length) {
      e.preventDefault();
      const next = historyAt < 0 ? history.length - 1 : Math.max(0, historyAt - 1);
      setHistoryAt(next);
      setInput(history[next]);
    } else if (e.key === 'ArrowDown' && historyAt >= 0) {
      e.preventDefault();
      const next = historyAt + 1;
      if (next >= history.length) { setHistoryAt(-1); setInput(''); }
      else { setHistoryAt(next); setInput(history[next]); }
    }
  };

  const logText = () => entries.map((e) => `[${clock(e.at)}] ${MARK[e.level]} ${e.text}${e.result ? `\n${Object.entries(e.result).map(([k, v]) => `    ${k}: ${v}`).join('\n')}` : ''}`).join('\n');

  const copyLog = async () => {
    if (!entries.length) return toast('The log is empty', false);
    try {
      await navigator.clipboard.writeText(logText());
      toast('Session log copied');
    } catch {
      toast('Clipboard is blocked in this browser — use Export instead', false);
    }
  };

  const exportSession = () => {
    if (!entries.length) return toast('Nothing to export yet', false);
    const payload = {
      exportedAt: new Date().toISOString(),
      chainId: store.state.wallet.chainId || 'mallchain-1',
      signingAddress: fromAddress || null,
      wasm: wasm ? { fileName: wasm.fileName, bytes: wasm.bytes, sha256: wasm.sha256, ok: wasm.ok } : null,
      entries: entries.map((e) => ({ at: new Date(e.at).toISOString(), level: e.level, text: e.text, result: e.result ?? null })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `mallchain-console-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Session exported');
  };

  const ready = parsed?.ok === true && !running;
  const missingWasm = parsed?.ok === true && parsed.command.needsWasm && !wasm;

  return (
    <div className="dh-console">
      <div className="card card-glow bg-gradient-card dh-pane">
        <div className="dh-pane-head">
          <h2>Command</h2>
          <span className="chip gold">natural language → real transaction</span>
        </div>
        <div className="dh-pane-body">
          <textarea
            ref={composerRef}
            className="dh-composer"
            value={input}
            onChange={(e) => { setInput(e.target.value); setHistoryAt(-1); }}
            onKeyDown={onKeyDown}
            placeholder={'say what you want the chain to do…\ne.g. send 25 MALL to mall1… · vote yes on proposal 12 · deploy label "counter" init {"count":0}'}
            spellCheck={false}
            aria-label="Natural-language chain command"
          />
          <div className="dh-composer-foot">
            <button className="btn btn-primary" onClick={() => run(input)} disabled={!ready || missingWasm}>
              {running ? <><span className="spin" /> Running…</> : 'Parse & run'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setInput(''); composerRef.current?.focus(); }} disabled={!input}>Clear</button>
            <span className="dh-hintline"><span className="dh-kbd">Ctrl</span> + <span className="dh-kbd">Enter</span> to run · <span className="dh-kbd">↑</span> recalls history</span>
          </div>

          {parsed && !parsed.ok && (
            <div className="dh-parse-error" role="status">
              <b>{parsed.error}</b>
              {parsed.hint && <div className="dh-parse-hint">{parsed.hint}</div>}
            </div>
          )}

          {parsed?.ok && (
            <div className="dh-intent">
              <div className="dh-intent-head">
                <span className={'dh-risk dh-risk-' + parsed.command.risk}>{parsed.command.risk}</span>
                <span className="dh-intent-kind">{parsed.command.intent.kind}</span>
                <span className="dh-intent-builder">{parsed.command.builder}</span>
              </div>
              <div className="dh-intent-summary">{parsed.command.summary}</div>
              <div className="dh-params">
                {paramRows(parsed.command).map(([k, v]) => (
                  <div className="dh-param" key={k}>
                    <div className="dh-param-k">{k}</div>
                    <div className="dh-param-v">{v}</div>
                  </div>
                ))}
                <div className="dh-param">
                  <div className="dh-param-k">signature</div>
                  <div className="dh-param-v">{parsed.command.needsMnemonic ? 'offline on this device, after the cipher wall' : 'none — read only'}</div>
                </div>
              </div>
            </div>
          )}

          {missingWasm && (
            <div className="dh-parse-error" style={{ borderColor: 'rgba(232,121,249,0.45)', background: 'rgba(232,121,249,0.08)' }}>
              <b style={{ color: 'var(--dh-magenta)' }}>This command uploads a module, and none is attached.</b>
              <div className="dh-parse-hint">
                <button className="btn btn-ghost btn-sm" onClick={onOpenDeploy}>Open the Deploy tab</button>
              </div>
            </div>
          )}

          <div className="dh-divider" />
          <div className="dh-rail-row" style={{ justifyContent: 'space-between' }}>
            <h3 className="dh-subhead" style={{ margin: 0 }}>Examples</h3>
            <select className="dh-select" value={group} onChange={(e) => setGroup(e.target.value as ExampleGroup)} aria-label="Filter examples">
              <option value="all">All commands</option>
              <option value="read">Reads only</option>
              <option value="funds">Moves funds</option>
              <option value="write">Chain writes</option>
            </select>
          </div>
          <div className="dh-examples">
            {examples.map((ex) => (
              <button key={ex.text} className="dh-example" onClick={() => { setInput(ex.text); composerRef.current?.focus(); }}>
                <span className="dh-example-code">{ex.text}</span>
                <span className="dh-example-note">{ex.note}</span>
              </button>
            ))}
            {examples.length === 0 && <div className="dh-note">No example in this group.</div>}
          </div>
        </div>
      </div>

      <div className="card card-glow bg-gradient-card dh-pane">
        <div className="dh-pane-head">
          <h2>Session</h2>
          <span className="chip">{entries.length} line{entries.length === 1 ? '' : 's'}</span>
          <div className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={copyLog}>Copy</button>
          <button className="btn btn-ghost btn-sm" onClick={exportSession}>Export</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEntries([]); toast('Log cleared'); }} disabled={!entries.length}>Reset</button>
        </div>

        <div className="dh-rail">
          <div className="dh-rail-row">
            <span className="dh-rail-label">{fromAddress && !canSign ? 'Address on screen' : 'Signing as'}</span>
            <span className={'dh-wallet' + (fromAddress ? '' : ' none')}>{fromAddress || 'no wallet connected'}</span>
            {fromAddress && !canSign && <span className="dh-verdict bad">no keys here</span>}
          </div>
          <div className="dh-rail-row">
            <span className="dh-rail-label">Module</span>
            {wasm ? (
              <>
                <span className="dh-wallet">{wasm.fileName} · {formatBytes(wasm.bytes)}</span>
                <span className={'dh-verdict ' + (wasm.ok ? 'ok' : 'bad')}>{wasm.ok ? 'valid' : 'rejected'}</span>
                <button className="btn btn-ghost btn-sm" onClick={onOpenDeploy}>Change</button>
              </>
            ) : (
              <>
                <span className="dh-wallet none">none attached</span>
                <button className="btn btn-ghost btn-sm" onClick={onOpenDeploy}>Attach .wasm</button>
              </>
            )}
          </div>
          <div className="dh-rail-row">
            <span className="dh-rail-label">Behaviour</span>
            <label className="dh-toggle"><input type="checkbox" checked={autoParse} onChange={(e) => setAutoParse(e.target.checked)} /> Preview as I type</label>
            <label className="dh-toggle"><input type="checkbox" checked={confirmFunds} onChange={(e) => setConfirmFunds(e.target.checked)} /> Confirm before moving funds</label>
          </div>
          <div className="dh-rail-row">
            <span className="dh-rail-label">Log</span>
            <select className="dh-select" value={verbosity} onChange={(e) => setVerbosity(e.target.value as Verbosity)} aria-label="Log verbosity">
              <option value="all">Every step</option>
              <option value="important">Outcomes only</option>
              <option value="errors">Errors only</option>
            </select>
            <label className="dh-toggle"><input type="checkbox" checked={stamps} onChange={(e) => setStamps(e.target.checked)} /> Timestamps</label>
            <label className="dh-toggle"><input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> Follow output</label>
          </div>
        </div>

        <div className="dh-term" ref={termRef} role="log" aria-live="polite" aria-label="Command session log">
          {visible.length === 0 && (
            <div className="dh-term-empty">
              {entries.length === 0
                ? 'mallchain console — ready.\nType a sentence on the left. It is parsed into one exact transaction, shown to you in full, and only then signed on this device.\nNothing here is simulated: a successful line carries a real transaction hash, and a failure carries the chain\'s own error.'
                : 'No lines match this verbosity. Switch the log filter back to “Every step”.'}
            </div>
          )}
          {visible.map((e) => (
            <div key={e.id}>
              <div className={'dh-line dh-line-' + e.level}>
                <span className="dh-line-t">{stamps ? clock(e.at) : ''}</span>
                <span className="dh-line-mark">{MARK[e.level]}</span>
                <span className="dh-line-x">{e.text}</span>
              </div>
              {e.result && Object.keys(e.result).length > 0 && (
                <div className="dh-result">
                  {Object.entries(e.result).map(([k, v]) => (
                    <div className="dh-result-row" key={k}>
                      <span className="dh-result-k">{k}</span>
                      <span className="dh-result-v">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
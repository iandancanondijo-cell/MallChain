import { useCallback, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion } from '../../components/ui';
import { chain } from '../../services/config';
import { displayApiBase } from '../../services/devhubApi';
import type { WasmInspection } from '../../services/wasmInspect';
import { CommandConsole } from './CommandConsole';
import { WasmDeploy } from './WasmDeploy';
import { ApiKeys } from './ApiKeys';
import { Endpoints } from './Endpoints';
import { RunNode } from './RunNode';
import './devhub.css';

type Tab = 'console' | 'deploy' | 'keys' | 'endpoints' | 'node';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'console', label: 'Console', icon: '›_' },
  { id: 'deploy', label: 'Deploy', icon: '⬡' },
  { id: 'keys', label: 'API keys', icon: '🔑' },
  { id: 'endpoints', label: 'Endpoints', icon: '⇄' },
  { id: 'node', label: 'Run a node', icon: '🖧' },
];

/**
 * Developer Hub.
 *
 * Every panel here does something real: the console parses a sentence into one
 * exact transaction and signs it with the app's own builders, the deploy bench
 * inspects a compiled module and uploads it, the key panel manages keys the
 * backend actually authenticates, and the endpoint list is read from the server
 * and runnable. The previous version advertised `npm i @mallchain/sdk` and
 * `pip install mallchain` — neither package is published, and the files under
 * sdk/ are TypeScript with .js extensions that no runtime can load. Those
 * claims are gone rather than replaced with new ones.
 *
 * Panels stay mounted when hidden so a session log, an inspected module and a
 * half-filled request survive switching tabs.
 */
export default function DevHub() {
  useStoreVersion();
  const [tab, setTab] = useState<Tab>('console');
  const [wasm, setWasm] = useState<WasmInspection | null>(null);
  const [seed, setSeed] = useState<{ text: string; id: number } | null>(null);
  const [tryKey, setTryKey] = useState<string | undefined>(undefined);
  const [keyCount, setKeyCount] = useState(0);
  const wallet = store.state.wallet.address;
  // Existence only, never the phrase: an address can be loaded on a device that
  // holds no key material, and calling that "signing wallet" is a lie of
  // implication. This mirrors the snapshot CipherChallenge takes when the wall
  // opens, so the strip and the wall agree before you are interrupted by it.
  const canSign = !!store.state.wallet.pinEncryptedMnemonic || !!store.state.wallet.mnemonic;
  const apiBase = displayApiBase();

  const useInConsole = useCallback((text: string) => {
    setSeed({ text, id: Date.now() });
    setTab('console');
  }, []);

  const pane = (id: Tab, node: React.ReactNode) => (
    <div key={id} style={{ display: tab === id ? undefined : 'none' }} role="tabpanel" id={`dh-panel-${id}`} aria-labelledby={`dh-tab-${id}`}>
      {node}
    </div>
  );

  return (
    <div className="dh-root">
      <div className="view-head">
        <h1 className="text-gradient">Developer Hub</h1>
        <span className="sub">write a sentence, sign a transaction, run a node</span>
      </div>

      <div className="dh-env">
        <div className="dh-env-cell"><div className="dh-env-k">Chain ID</div><div className="dh-env-v gold">{chain.chainId}</div></div>
        <div className="dh-env-cell"><div className="dh-env-k">Address prefix</div><div className="dh-env-v">{chain.addressPrefix}1…</div></div>
        <div className="dh-env-cell"><div className="dh-env-k">Gas price</div><div className="dh-env-v">{chain.gasPrice}</div></div>
        <div className="dh-env-cell"><div className="dh-env-k">API base</div><div className="dh-env-v" title={apiBase}>{apiBase}</div></div>
        <div className="dh-env-cell"><div className="dh-env-k">{wallet && !canSign ? 'Wallet address' : 'Signing wallet'}</div><div className="dh-env-v" title={wallet}>{wallet || 'not connected'}</div></div>
      </div>

      <div className="dh-tabs" role="tablist" aria-label="Developer Hub sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`dh-tab-${t.id}`}
            className="dh-tab"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`dh-panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            <span className="dh-tab-ico" aria-hidden="true">{t.icon}</span>
            {t.label}
            {t.id === 'keys' && keyCount > 0 && <span className="dh-tab-count">{keyCount}</span>}
            {t.id === 'deploy' && wasm && <span className="dh-tab-count">{wasm.ok ? 'ready' : 'bad'}</span>}
          </button>
        ))}
      </div>

      {pane('console', <CommandConsole wasm={wasm} onOpenDeploy={() => setTab('deploy')} seed={seed} />)}
      {pane('deploy', <WasmDeploy wasm={wasm} onInspect={setWasm} onUseInConsole={useInConsole} />)}
      {pane('keys', <ApiKeys onTryKey={(k) => { setTryKey(k.key); setTab('endpoints'); }} onCount={setKeyCount} />)}
      {pane('endpoints', <Endpoints initialKey={tryKey} keysVersion={keyCount} />)}
      {pane('node', <RunNode />)}
    </div>
  );
}
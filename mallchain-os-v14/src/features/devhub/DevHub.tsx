import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, toast } from '../../components/ui';
import { devhubApi, type DevApiKey } from '../../services/devhubApi';
import { config } from '../../services/config';

/** Node bundles are published by the backend under /downloads/node/. */
const NODE_DOWNLOAD_BASE = `${config.apiBaseUrl.replace(/\/$/, '')}/downloads/node`;

/** Developer Hub — real API-key management (backend/src/routes/devhub.js). */
export default function DevHub() {
  useStoreVersion();
  const [keys, setKeys] = useState<DevApiKey[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await devhubApi.listKeys();
    if (res.ok && res.data) setKeys(res.data);
    else setError(res.error || 'Failed to load API keys');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createKey = async () => {
    if (!keyName.trim()) return toast('Key name required', false);
    const res = await devhubApi.createKey(keyName.trim());
    if (res.ok) {
      toast('API key created');
      setKeyName('');
      load();
    } else {
      toast(res.error || 'Failed to create key', false);
    }
  };

  const testKey = async (key: string) => {
    const res = await devhubApi.testKey(key);
    if (res.ok && res.data) {
      toast(`Key valid — ${res.data.used} total call${res.data.used === 1 ? '' : 's'}`);
      load();
    } else {
      toast(res.error || 'Key test failed', false);
    }
  };

  const revoke = async (id: string) => {
    const res = await devhubApi.revokeKey(id);
    if (res.ok) {
      toast('Key revoked');
      load();
    } else {
      toast(res.error || 'Failed to revoke key', false);
    }
  };

  const copy = (k: string) => {
    const ta = document.createElement('textarea');
    ta.value = k; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    setCopied(k);
    setTimeout(() => setCopied(''), 1500);
  };

  const snippets = [
    { lang: 'JavaScript', code: `import { MallchainClient } from '@mallchain/sdk';\n\nconst client = new MallchainClient({ apiKey: process.env.MALLCHAIN_API_KEY });\nconst balance = await client.wallet.balance('mall1…');` },
    { lang: 'Python', code: `from mallchain import MallchainClient\n\nclient = MallchainClient(api_key="mk_…")\nbalance = client.wallet.balance("mall1…")\nprint(balance)` },
    { lang: 'cURL', code: `curl http://localhost:4000/api/wallet/mall1… \\\n  -H "Authorization: Bearer <token>"` },
  ];

  const nodeSnippets = [
    {
      lang: 'Verify download',
      code: `unzip mallchain-node-v48052ec8.zip && cd mallchain-node-v48052ec8-linux-amd64\nsha256sum -c SHA256SUMS.txt   # every file must report OK`,
    },
    {
      lang: 'Verify chain data yourself',
      code: `# your own node, your own truth — no mallchain.com backend involved\nRPC="http://127.0.0.1:26657"; API="http://127.0.0.1:1317"\ncurl -s $RPC/status | jq '.result.sync_info'          # height + latest_app_hash\ncurl -s $API/cosmos/staking/v1beta1/validators | jq '.validators|length'\ncurl -s $API/cosmos/bank/v1beta1/supply | jq          # real supply, straight from state`,
    },
  ];

  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">Developer Hub</h1><span className="sub">build on Mallchain</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      <div className="grid-2 stagger">
        <div className="card card-glow bg-gradient-card">
          <div className="sec-title"><h2>SDKs</h2></div>
          <div className="row">
            <span className="chip gold">JavaScript · npm i @mallchain/sdk</span>
            <span className="chip">Python · pip install mallchain</span>
          </div>
          <div className="sec-title mt"><h2>Endpoints</h2></div>
          <div className="tiny mono" style={{ lineHeight: 2 }}>
            GET /api/wallet/:address<br />POST /api/send/mallcoins<br />GET /api/explorer/latest<br />GET /api/mines/campaigns/active<br />GET /api/staking/summary/:address
          </div>
        </div>

        <div className="card card-glow bg-gradient-card">
          <div className="sec-title"><h2>API keys</h2></div>
          {!loading && keys?.length === 0 && <div className="tiny" style={{ padding: 12 }}>No API keys yet.</div>}
          {(keys || []).map((k) => (
            <div key={k._id} className="list-row">
              <div className="grow"><div className="t">{k.name}</div><div className="m mono" style={{ fontSize: 11 }}>{k.key}</div></div>
              <span className="chip">{k.used} calls</span>
              <button className="btn btn-ghost btn-sm" onClick={() => testKey(k.key)}>Test key</button>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(k.key)}>{copied === k.key ? '✓ copied' : 'Copy'}</button>
              <button className="btn btn-danger btn-sm" onClick={() => revoke(k._id)}>Revoke</button>
            </div>
          ))}
          <div className="row mt">
            <input className="input" placeholder="Key name…" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
            <button className="btn btn-primary" onClick={createKey}>Create key</button>
          </div>
        </div>
      </div>

      <div className="card mt card-glow bg-gradient-card">
        <div className="sec-title"><h2>Run a Node</h2><span className="sub">don't trust, verify</span></div>
        <div className="tiny" style={{ lineHeight: 1.8, marginBottom: 12 }}>
          Anyone in the world can run a Mallchain validator or full node on their own PC. A node needs
          <b> only</b> the chain binary, <span className="mono">genesis.json</span> and a peer list — never our
          Express backend or MongoDB (those are the web app's off-chain API layer, not consensus). Your node
          re-executes every block itself and checks app hashes, so you verify the ledger instead of trusting it.
          <br />
          <b>In the bundle:</b> <span className="mono">marketplaced</span> + <span className="mono">gen-node-home</span> binaries (linux/amd64 &amp; arm64, statically linked),
          verified <span className="mono">genesis.json</span>, config templates (correct ports, gRPC safely disabled), real peer ID, <span className="mono">INSTALL.md</span>, <span className="mono">PEERS.md</span>, <span className="mono">CREATE_VALIDATOR.sh</span>, <span className="mono">VERSION.txt</span> and <span className="mono">SHA256SUMS.txt</span>.
        </div>
        <div className="row">
          <a className="btn btn-primary" href={`${NODE_DOWNLOAD_BASE}/amd64.zip`} download>Download node bundle (linux/amd64)</a>
          <a className="btn btn-primary" href={`${NODE_DOWNLOAD_BASE}/arm64.zip`} download>Download node bundle (linux/arm64)</a>
          <a className="btn btn-ghost" href={`${NODE_DOWNLOAD_BASE}/full.zip`} download>Combined zip</a>
          <a className="btn btn-ghost" href={`${NODE_DOWNLOAD_BASE}/sha256sums.txt`}>SHA256 checksums</a>
          <a className="btn btn-ghost" href={`${NODE_DOWNLOAD_BASE}/docs`} target="_blank" rel="noreferrer">Setup guide</a>
        </div>
        <div className="tiny mono" style={{ marginTop: 10, opacity: 0.75 }}>
          Per-arch bundles ≈ 49 MB (amd64) / 44 MB (arm64), combined ≈ 89 MB · v48052ec8 · served live by the
          backend at <span className="mono">{NODE_DOWNLOAD_BASE}/</span> (index lists checksums and sizes).
          If a route 404s the bundle is missing from <span className="mono">backend/build/validator-bundle/zips/</span>;
          rebuild with <span className="mono">scripts/build-validator-bundle.sh</span>.
        </div>
        {nodeSnippets.map((s) => (
          <div key={s.lang} className="code-block">
            <div className="code-head"><span className="chip">{s.lang}</span><button className="btn btn-ghost btn-sm" onClick={() => copy(s.code)}>{copied === s.code ? '✓ copied' : 'Copy'}</button></div>
            <pre>{s.code}</pre>
          </div>
        ))}
      </div>

      <div className="card mt card-glow bg-gradient-card">
        <div className="sec-title"><h2>Code examples</h2></div>
        {snippets.map((s) => (
          <div key={s.lang} className="code-block">
            <div className="code-head"><span className="chip">{s.lang}</span><button className="btn btn-ghost btn-sm" onClick={() => copy(s.code)}>{copied === s.code ? '✓ copied' : 'Copy'}</button></div>
            <pre>{s.code}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

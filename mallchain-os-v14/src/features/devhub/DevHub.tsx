import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, toast } from '../../components/ui';
import { devhubApi, type DevApiKey } from '../../services/devhubApi';

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

  return (
    <div>
      <div className="view-head"><h1>Developer Hub</h1><span className="sub">build on Mallchain</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
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

        <div className="card">
          <div className="sec-title"><h2>API keys</h2></div>
          {!loading && keys?.length === 0 && <div className="tiny" style={{ padding: 12 }}>No API keys yet.</div>}
          {(keys || []).map((k) => (
            <div key={k._id} className="list-row">
              <div className="grow"><div className="t">{k.name}</div><div className="m mono" style={{ fontSize: 11 }}>{k.key}</div></div>
              <span className="chip">{k.used} calls</span>
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

      <div className="card mt">
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

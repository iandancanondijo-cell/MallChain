import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';

/** Developer Hub — SDKs, API keys, RPC/REST, code snippets, docs index. */
export default function DevHub() {
  useStoreVersion();
  const st = store.state;
  const [keyName, setKeyName] = useState('');
  const [copied, setCopied] = useState('');

  const createKey = () => {
    if (!keyName.trim()) { toast('Key name required', false); return; }
    st.devhub.keys.unshift({ id: 'k' + Date.now(), name: keyName.trim(), key: 'mc_' + Math.random().toString(36).slice(2, 14), used: 0, created: new Date().toISOString().slice(0, 10) });
    st.devhub.keys = st.devhub.keys.slice(0, 3);
    store.commit();
    setKeyName('');
    toast('API key created');
  };

  const copy = (k: string) => {
    const ta = document.createElement('textarea');
    ta.value = k; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    setCopied(k);
    setTimeout(() => setCopied(''), 1500);
  };

  const snippets = [
    { lang: 'JavaScript', code: `import { MallchainClient } from '@mallchain/sdk';\n\nconst client = new MallchainClient({ apiKey: process.env.MALLCHAIN_API_KEY });\nconst balance = await client.wallet.balance('0x…');` },
    { lang: 'Python', code: `from mallchain import MallchainClient\n\nclient = MallchainClient(api_key="mc_…")\nbalance = client.wallet.balance("0x…")\nprint(balance)` },
    { lang: 'cURL', code: `curl https://api.mallchain.ke/v1/wallet/balance \\\n  -H "Authorization: Bearer mc_…" \\\n  -d '{"address":"0x…"}'` },
  ];

  return (
    <div>
      <div className="view-head"><h1>Developer Hub</h1><span className="sub">build on Mallchain</span></div>

      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>SDKs</h2></div>
          <div className="row">
            <span className="chip gold">JavaScript · npm i @mallchain/sdk</span>
            <span className="chip">Python · pip install mallchain</span>
            <span className="chip">Go · go get mallchain/client</span>
          </div>
          <div className="sec-title mt"><h2>Endpoints</h2></div>
          <div className="tiny mono" style={{ lineHeight: 2 }}>
            GET /v1/wallet/balance<br />POST /v1/tx/send<br />GET /v1/explorer/blocks<br />GET /v1/mines/campaigns<br />POST /v1/validators/review
          </div>
        </div>

        <div className="card">
          <div className="sec-title"><h2>API keys</h2><span className="sub">max 3 · usage metered</span></div>
          {st.devhub.keys.map((k) => (
            <div key={k.id} className="list-row">
              <div className="grow"><div className="t">{k.name}</div><div className="m mono" style={{ fontSize: 11 }}>{k.key}</div></div>
              <span className="chip">{k.used} calls</span>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(k.key)}>{copied === k.key ? '✓ copied' : 'Copy'}</button>
              <button className="btn btn-danger btn-sm" onClick={() => { st.devhub.keys = st.devhub.keys.filter((x) => x.id !== k.id); store.commit(); toast('Key revoked'); }}>Revoke</button>
            </div>
          ))}
          <div className="row mt">
            <input className="input" placeholder="Key name…" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
            <button className="btn btn-primary" onClick={createKey}>Create key</button>
          </div>
          <div className="tiny mt">Usage meter: {st.devhub.keys.reduce((a, k) => a + k.used, 0)} requests this month (free tier 10,000).</div>
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

      <div className="card mt">
        <div className="sec-title"><h2>Documentation index</h2></div>
        <div className="row">
          {['Getting started', 'Wallets & keys', 'Transactions', 'Mines API', 'Validator guide', 'Smart contracts', 'Webhooks', 'Rate limits'].map((d) => (
            <span key={d} className="chip" style={{ cursor: 'pointer' }} onClick={() => toast(`Docs: ${d}`)}>{d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

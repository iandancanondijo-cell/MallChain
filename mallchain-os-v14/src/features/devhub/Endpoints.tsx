import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '../../components/ui';
import { devhubApi, displayApiBase, type DevDocs, type DevEndpoint, type DevApiKey, type EndpointResponse } from '../../services/devhubApi';

type AuthFilter = 'all' | 'x-api-key' | 'bearer' | 'public';

const placeholders = (path: string): string[] => (path.match(/:([A-Za-z_]+)/g) || []).map((s) => s.slice(1));
const hasQuery = (path: string) => path.endsWith('/blocks');

/**
 * The API surface, read from GET /api/devhub/docs rather than typed into this
 * file, with a runner that sends the request for real. The response panel shows
 * the actual status, latency and body — including the 401 a bad key earns and
 * the 502 an unreachable node earns.
 */
export function Endpoints({ initialKey, keysVersion }: { initialKey?: string; keysVersion?: number }) {
  const [docs, setDocs] = useState<DevDocs | null>(null);
  const [keys, setKeys] = useState<DevApiKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [authFilter, setAuthFilter] = useState<AuthFilter>('all');
  const [keyId, setKeyId] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('20');
  const [includeSecret, setIncludeSecret] = useState(false);
  const [sending, setSending] = useState(false);
  const [responses, setResponses] = useState<Record<string, EndpointResponse>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [d, k] = await Promise.all([devhubApi.docs(), devhubApi.listKeys()]);
    if (d.ok && d.data) { setDocs(d.data); setError(null); }
    else { setDocs(null); setError(d.error || 'Could not load the endpoint list'); }
    if (k.ok) setKeys(k.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!initialKey || keys.length === 0) return;
    const hit = keys.find((k) => k.key === initialKey);
    if (hit) setKeyId(hit._id);
  }, [initialKey, keys]);

  // Keys are created over in the API keys tab while this panel stays mounted,
  // so the list it fetched at boot is stale the moment one is made — and the
  // rail then reads "No keys yet" to someone who has three. The shell watches
  // the count; every change here re-reads the server's list.
  useEffect(() => {
    if (keysVersion === undefined) return;
    devhubApi.listKeys().then((r) => { if (r.ok) setKeys(r.data || []); });
  }, [keysVersion]);

  const selectedKey = keys.find((k) => k._id === keyId) || null;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (docs?.endpoints || []).filter((e) => {
      if (authFilter === 'public' && e.auth !== false) return false;
      if (authFilter !== 'all' && authFilter !== 'public' && e.auth !== authFilter) return false;
      return !q || e.path.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.method.toLowerCase().includes(q);
    });
  }, [docs, search, authFilter]);

  const idOf = (e: DevEndpoint) => `${e.method} ${e.path}`;

  const filledPath = (e: DevEndpoint) => {
    let path = e.path;
    for (const name of placeholders(e.path)) path = path.replace(`:${name}`, params[`${idOf(e)}:${name}`]?.trim() || `:${name}`);
    if (hasQuery(e.path) && query.trim()) path += `?limit=${encodeURIComponent(query.trim())}`;
    return path;
  };

  const send = async (e: DevEndpoint) => {
    const missing = placeholders(e.path).filter((n) => !params[`${idOf(e)}:${n}`]?.trim());
    if (missing.length) return toast(`Fill in ${missing.join(', ')} first`, false);
    if (e.auth === 'x-api-key' && !selectedKey) return toast('Choose one of your API keys to send with this request', false);

    setSending(true);
    const values: Record<string, string> = {};
    for (const n of placeholders(e.path)) values[n] = params[`${idOf(e)}:${n}`].trim();
    const res = await devhubApi.tryEndpoint(e, values, selectedKey?.key || '', hasQuery(e.path) ? { limit: query.trim() } : {});
    setSending(false);
    setResponses((r) => ({ ...r, [idOf(e)]: res }));
    if (res.status >= 200 && res.status < 300) toast(`${e.method} ${e.path} → ${res.status} in ${res.ms} ms`);
    else toast(`${e.method} ${e.path} → ${res.status || 'network error'}`, false);
    if (e.auth === 'x-api-key') {
      const k = await devhubApi.listKeys();
      if (k.ok) setKeys(k.data || []);
    }
  };

  const base = docs?.baseUrl || displayApiBase();

  const curlFor = (e: DevEndpoint) => {
    const headers = e.auth === 'x-api-key' ? ` \\\n  -H "x-api-key: ${includeSecret && selectedKey ? selectedKey.key : 'mk_…'}"` : '';
    return `curl -X ${e.method} "${base}${filledPath(e)}"${headers}`;
  };

  const copy = async (value: string, what: string) => {
    try { await navigator.clipboard.writeText(value); toast(`${what} copied`); }
    catch { toast('Clipboard is blocked in this browser', false); }
  };

  return (
    <div>
      {error && <div className="dh-error" role="alert" style={{ marginBottom: 14 }}>{error} <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>}

      <div className="grid-2 stagger" style={{ marginBottom: 14 }}>
        <div className="card card-glow bg-gradient-card" style={{ padding: 15 }}>
          <div className="sec-title"><h2>Developer key</h2><span className="sub">x-api-key</span></div>
          <div className="dh-note">
            {docs?.authentication.developer.description || 'A Developer Hub key grants read on the developer API and is rate-limited per key.'}
          </div>
          <div className="dh-rail-row" style={{ marginTop: 11 }}>
            <span className="chip gold mono">{docs?.authentication.developer.header || 'x-api-key'}</span>
            <span className="chip mono">{docs?.authentication.developer.prefix || 'mk_'}…</span>
            <span className="chip">{docs?.authentication.developer.rateLimitPerMinute ?? 120} / min</span>
          </div>
        </div>
        <div className="card card-glow bg-gradient-card" style={{ padding: 15 }}>
          <div className="sec-title"><h2>Your login session</h2><span className="sub">account routes</span></div>
          <div className="dh-note">
            {docs?.authentication.user.description || 'The token from login. Required for key management; a developer key cannot manage keys.'}
          </div>
          <div className="dh-rail-row" style={{ marginTop: 11 }}>
            <span className="chip mono">{base}</span>
            <span className="chip">API v{docs?.version || '—'}</span>
          </div>
        </div>
      </div>

      <div className="card card-glow bg-gradient-card dh-pane">
        <div className="dh-pane-head">
          <h2>Endpoints</h2>
          <span className="chip">{rows.length} of {docs?.endpoints.length ?? 0}</span>
          <div className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>{loading ? <><span className="spin" /> Loading</> : 'Refresh'}</button>
        </div>
        <div className="dh-rail">
          <div className="dh-rail-row">
            <span className="dh-rail-label">Find</span>
            <input className="input" style={{ flex: '1 1 200px', minWidth: 0 }} placeholder="Search path, method or description…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search endpoints" />
            <select className="dh-select" value={authFilter} onChange={(e) => setAuthFilter(e.target.value as AuthFilter)} aria-label="Filter by authentication">
              <option value="all">Any auth</option>
              <option value="x-api-key">Developer key</option>
              <option value="bearer">Login session</option>
              <option value="public">Public</option>
            </select>
            {(search || authFilter !== 'all') && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setAuthFilter('all'); }}>Reset</button>}
          </div>
          <div className="dh-rail-row">
            <span className="dh-rail-label">Send with</span>
            <select className="dh-select" value={keyId} onChange={(e) => setKeyId(e.target.value)} aria-label="API key to send">
              <option value="">No key chosen</option>
              {keys.map((k) => <option key={k._id} value={k._id}>{k.name} · {k.used} calls</option>)}
            </select>
            <label className="dh-toggle"><input type="checkbox" checked={includeSecret} onChange={(e) => setIncludeSecret(e.target.checked)} /> Put the real key in copied cURL</label>
            {keys.length === 0 && <span className="dh-hintline">No keys yet — create one in the API keys tab.</span>}
          </div>
        </div>

        <div className="dh-pane-body">
          {loading && !docs && <div className="dh-loading">Reading the endpoint list from the server…</div>}
          {docs && rows.length === 0 && <div className="dh-note">Nothing matches those filters.</div>}
          {rows.map((e) => {
            const id = idOf(e);
            const isOpen = open === id;
            const res = responses[id];
            const names = placeholders(e.path);
            return (
              <div className="dh-endpoint" key={id}>
                <button className="dh-endpoint-head" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}>
                  <span className={'dh-method dh-method-' + e.method}>{e.method}</span>
                  <span className="dh-endpoint-path">{e.path}</span>
                  <span className="dh-endpoint-auth">{e.auth === false ? 'public' : e.auth === 'bearer' ? 'session' : 'api key'}</span>
                </button>
                <div className="dh-endpoint-desc">{e.description}</div>
                {isOpen && (
                  <div className="dh-endpoint-body">
                    {names.length > 0 && (
                      <div className="dh-try-row">
                        {names.map((n) => (
                          <input
                            key={n}
                            className="input"
                            placeholder={n}
                            value={params[`${id}:${n}`] || ''}
                            onChange={(ev) => setParams((p) => ({ ...p, [`${id}:${n}`]: ev.target.value }))}
                            aria-label={`${n} for ${e.path}`}
                          />
                        ))}
                      </div>
                    )}
                    {hasQuery(e.path) && (
                      <div className="dh-try-row">
                        <span className="dh-rail-label" style={{ minWidth: 0 }}>limit</span>
                        <input className="input" style={{ flex: '0 0 90px' }} value={query} onChange={(ev) => setQuery(ev.target.value)} inputMode="numeric" aria-label="Block limit" />
                        <span className="dh-hintline">1–50</span>
                      </div>
                    )}
                    <div className="dh-try-row">
                      <span className="dh-wallet grow">{base}{filledPath(e)}</span>
                      <button className="btn btn-primary btn-sm" onClick={() => send(e)} disabled={sending}>{sending ? <><span className="spin" /> Sending</> : 'Send request'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => copy(curlFor(e), 'cURL command')}>Copy as cURL</button>
                    </div>
                    {e.auth === 'x-api-key' && !selectedKey && <div className="dh-hintline" style={{ color: 'var(--dh-amber)' }}>Choose a key in the rail above — this route rejects requests without one.</div>}
                    {e.auth === 'bearer' && <div className="dh-hintline">Sent with your browser session, not with a developer key.</div>}

                    {res && (
                      <div className="dh-response">
                        <div className="dh-response-head">
                          <span className={'dh-status ' + (res.status >= 200 && res.status < 300 ? 'good' : 'bad')}>{res.status || 'ERR'}</span>
                          <span>{res.ms} ms</span>
                          {res.rateLimit?.remaining !== null && res.rateLimit?.remaining !== undefined && (
                            <span>{res.rateLimit.remaining} / {res.rateLimit.limit} calls left this minute</span>
                          )}
                          <div className="grow" />
                          <button className="btn btn-ghost btn-sm" onClick={() => copy(JSON.stringify(res.body, null, 2), 'Response')}>Copy body</button>
                        </div>
                        <pre>{JSON.stringify(res.body, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {docs && docs.notes.length > 0 && (
        <div className="card mt card-glow bg-gradient-card" style={{ padding: 15 }}>
          <div className="sec-title"><h2>Behaviour worth knowing</h2></div>
          <ul className="dh-note" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docs.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
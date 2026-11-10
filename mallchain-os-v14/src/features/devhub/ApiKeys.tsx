import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '../../components/ui';
import { devhubApi, displayApiBase, type DevApiKey, type UsageStats } from '../../services/devhubApi';

type Sort = 'newest' | 'used' | 'name';

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : 'never');
const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');
const mask = (key: string) => `${key.slice(0, 6)}${'•'.repeat(18)}${key.slice(-4)}`;
const calls = (n: number) => `${n.toLocaleString()} call${n === 1 ? '' : 's'}`;

/**
 * Developer keys, straight from backend/src/routes/devhub.js.
 *
 * A key grants exactly one enforced permission — `read` on /api/devhub/v1 — so
 * there is no scope picker here pretending to offer more. Usage numbers come
 * from the server's own counter, which moves when a key is really used.
 */
export function ApiKeys({ onTryKey, onCount }: { onTryKey: (key: DevApiKey) => void; onCount?: (n: number) => void }) {
  const [keys, setKeys] = useState<DevApiKey[] | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('newest');

  const load = useCallback(async () => {
    setLoading(true);
    const [k, u] = await Promise.all([devhubApi.listKeys(), devhubApi.usage()]);
    if (k.ok) { setKeys(k.data || []); setError(null); onCount?.((k.data || []).length); }
    else { setKeys(null); setError(k.error || 'Could not load your API keys'); }
    if (u.ok) setUsage(u.data || null);
    setLoading(false);
  }, [onCount]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const list = (keys || []).filter((k) => k.name.toLowerCase().includes(search.trim().toLowerCase()));
    const sorted = [...list];
    if (sort === 'newest') sorted.sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
    else if (sort === 'used') sorted.sort((a, b) => (b.used || 0) - (a.used || 0));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [keys, search, sort]);

  const maxUsed = Math.max(1, ...(keys || []).map((k) => k.used || 0));

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(''), 1600);
      toast(`${what} copied`);
    } catch {
      toast('Clipboard is blocked — reveal the key and copy it by hand', false);
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast('Give the key a name first', false);
    setCreating(true);
    const res = await devhubApi.createKey(trimmed);
    setCreating(false);
    if (!res.ok || !res.data) return toast(res.error || 'Could not create the key', false);
    setName('');
    setRevealed((r) => ({ ...r, [res.data!._id]: true }));
    toast('Key created — copy it now, it is shown in full only here');
    load();
  };

  const test = async (k: DevApiKey) => {
    setBusyId(k._id);
    const res = await devhubApi.testKey(k.key);
    setBusyId(null);
    if (!res.ok || !res.data) return toast(res.error || 'That key was rejected', false);
    toast(`${res.data.keyName}: valid · ${calls(res.data.used)} recorded`);
    load();
  };

  const revoke = async (k: DevApiKey) => {
    if (!window.confirm(`Revoke “${k.name}”?\n\nAny integration using it stops working immediately. This cannot be undone.`)) return;
    setBusyId(k._id);
    const res = await devhubApi.revokeKey(k._id);
    setBusyId(null);
    if (!res.ok) return toast(res.error || 'Could not revoke the key', false);
    setKeys((prev) => (prev || []).filter((x) => x._id !== k._id));
    toast('Key revoked');
    load();
  };

  const startRename = (k: DevApiKey) => { setRenaming(k._id); setRenameValue(k.name); };

  const saveRename = async (k: DevApiKey) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return toast('A key name cannot be empty', false);
    if (trimmed === k.name) { setRenaming(null); return; }
    setBusyId(k._id);
    const res = await devhubApi.renameKey(k._id, trimmed);
    setBusyId(null);
    if (!res.ok) return toast(res.error || 'Could not rename the key', false);
    setKeys((prev) => (prev || []).map((x) => (x._id === k._id ? { ...x, name: res.data?.name || trimmed } : x)));
    setRenaming(null);
    toast('Key renamed');
  };

  const revokedCount = usage ? Math.max(0, usage.keysTotal - usage.keysActive) : 0;
  const lastCall = usage?.usage.reduce<string | null>((latest, u) => (u.lastUsed && (!latest || u.lastUsed > latest) ? u.lastUsed : latest), null) || null;
  const curlSnippet = `curl ${displayApiBase()}/api/devhub/v1/status \\\n  -H "x-api-key: mk_…"`;

  return (
    <div>
      <div className="dh-facts" style={{ marginBottom: 14 }}>
        <div className="dh-fact"><div className="dh-fact-k">Total requests</div><div className="dh-fact-v" style={{ color: 'var(--gold)', fontSize: 18, fontWeight: 800 }}>{usage ? usage.totalRequests.toLocaleString() : '—'}</div></div>
        <div className="dh-fact"><div className="dh-fact-k">Active keys</div><div className="dh-fact-v" style={{ fontSize: 18, fontWeight: 800 }}>{usage ? usage.keysActive : '—'}</div></div>
        <div className="dh-fact"><div className="dh-fact-k">Revoked</div><div className="dh-fact-v" style={{ fontSize: 18, fontWeight: 800, color: revokedCount ? 'var(--red-2)' : undefined }}>{usage ? revokedCount : '—'}</div></div>
        <div className="dh-fact"><div className="dh-fact-k">Last call</div><div className="dh-fact-v">{fmtTime(lastCall)}</div></div>
        <div className="dh-fact"><div className="dh-fact-k">Permission</div><div className="dh-fact-v mono">read</div></div>
        <div className="dh-fact"><div className="dh-fact-k">Rate limit</div><div className="dh-fact-v">120 / min / key</div></div>
      </div>

      {error && <div className="dh-error" role="alert" style={{ marginBottom: 14 }}>{error} <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>}

      <div className="card card-glow bg-gradient-card dh-pane">
        <div className="dh-pane-head">
          <h2>Your keys</h2>
          <span className="chip">{keys?.length ?? 0} active</span>
          <div className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>{loading ? <><span className="spin" /> Loading</> : 'Refresh'}</button>
        </div>
        <div className="dh-rail">
          <div className="dh-rail-row">
            <span className="dh-rail-label">Find</span>
            <input className="input" style={{ flex: '1 1 200px', minWidth: 0 }} placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search API keys" />
            <select className="dh-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort keys">
              <option value="newest">Newest first</option>
              <option value="used">Most used</option>
              <option value="name">Name A–Z</option>
            </select>
            {search && <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>Clear</button>}
          </div>
          <div className="dh-rail-row">
            <span className="dh-rail-label">New key</span>
            <input
              className="input"
              style={{ flex: '1 1 220px', minWidth: 0 }}
              placeholder="What is it for? e.g. price-bot"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
              disabled={creating}
              aria-label="New API key name"
            />
            <button className="btn btn-primary" onClick={create} disabled={creating || !name.trim()}>{creating ? <><span className="spin" /> Creating</> : 'Create key'}</button>
          </div>
        </div>

        <div className="dh-pane-body">
          {!keys && !error && <div className="dh-loading">Loading your keys…</div>}
          {keys && keys.length === 0 && (
            <div className="empty-state">
              <div className="es-ico">🔑</div>
              <div className="es-t">No API keys yet</div>
              <div className="es-m">Create one above, then call <span className="mono">/api/devhub/v1/status</span> with it in the <span className="mono">x-api-key</span> header. Every call is counted here.</div>
            </div>
          )}
          {keys && keys.length > 0 && rows.length === 0 && (
            <div className="dh-note">No key matches “{search}”. <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>Clear the search</button></div>
          )}

          <div className="dh-scroll-list">
            {rows.map((k) => (
              <div className="card dh-key mb" key={k._id}>
                <div className="dh-key-top">
                  <div className="grow" style={{ minWidth: 0 }}>
                    {renaming === k._id ? (
                      <div className="dh-rename">
                        <input
                          className="input"
                          value={renameValue}
                          maxLength={60}
                          autoFocus
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRename(k); if (e.key === 'Escape') setRenaming(null); }}
                          aria-label={`Rename ${k.name}`}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => saveRename(k)} disabled={busyId === k._id}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div className="dh-key-name">{k.name}</div>
                        <div className="dh-key-meta">
                          <span>created {fmtDate(k.created)}</span>
                          <span>last used {fmtDate(k.lastUsed)}</span>
                          <span className="mono">{(k.permissions || []).join(', ') || 'no permission'}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <span className="chip gold">{calls(k.used || 0)}</span>
                </div>

                <div className="dh-key-secret">
                  <span className="grow">{revealed[k._id] ? k.key : mask(k.key)}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setRevealed((r) => ({ ...r, [k._id]: !r[k._id] }))}>{revealed[k._id] ? 'Hide' : 'Reveal'}</button>
                </div>
                <div className="dh-usage-bar" title={`${(k.used || 0).toLocaleString()} of the busiest key's ${calls(maxUsed)}`}>
                  <div className="dh-usage-fill" style={{ width: `${Math.round(((k.used || 0) / maxUsed) * 100)}%` }} />
                </div>

                <div className="dh-key-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => copy(k.key, 'Key')}>{copied === k.key ? '✓ copied' : 'Copy'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => test(k)} disabled={busyId === k._id}>{busyId === k._id ? 'Testing…' : 'Test key'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onTryKey(k)}>Try an endpoint</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startRename(k)} disabled={busyId === k._id}>Rename</button>
                  <div className="grow" />
                  <button className="btn btn-danger btn-sm" onClick={() => revoke(k)} disabled={busyId === k._id}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt card-glow bg-gradient-card">
        <div className="sec-title"><h2>Using a key</h2><span className="sub">header auth, counted per call</span></div>
        <div className="code-block">
          <div className="code-head"><span className="chip">cURL</span><button className="btn btn-ghost btn-sm" onClick={() => copy(curlSnippet, 'Command')}>{copied === curlSnippet ? '✓ copied' : 'Copy'}</button></div>
          <pre>{curlSnippet}</pre>
        </div>
        <div className="dh-note" style={{ marginTop: 10 }}>
          Send the key in the <span className="mono">x-api-key</span> header, never in the URL — query strings end up in access logs.
          A key authenticates as you, so it can read your account's chain queries but cannot create or revoke keys; those routes need your login session.
          Responses are <span className="mono">{'{ ok: true, data }'}</span> or <span className="mono">{'{ ok: false, error }'}</span>, and every call carries
          <span className="mono"> X-RateLimit-Remaining</span>.
        </div>
      </div>
    </div>
  );
}
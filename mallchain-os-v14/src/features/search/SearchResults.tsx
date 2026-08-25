import { useEffect, useState } from 'react';
import { PlatformIcon } from '../mines/platformIcons';
import { search, type SearchResults as SearchResultsData } from '../../services/searchApi';

function getQuery(): string {
  const hash = window.location.hash.replace(/^#\/?/, '/');
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return '';
  return new URLSearchParams(hash.slice(qIndex)).get('q') || '';
}

export default function SearchResults({ navigate }: { navigate: (p: string) => void }) {
  const [q, setQ] = useState(getQuery());
  const [data, setData] = useState<SearchResultsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setQ(getQuery());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!q) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    search(q).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok && res.data) setData(res.data);
      else setError(res.error || 'Search failed');
    });
    return () => {
      cancelled = true;
    };
  }, [q]);

  const totalResults =
    (data?.blocks.length || 0) + (data?.txs.length || 0) + (data?.validators.length || 0) + (data?.campaigns.length || 0);

  return (
    <div>
      <div className="view-head">
        <h1>Search</h1>
        <span className="sub">{q ? `Results for "${q}"` : 'Enter a query to search'}</span>
      </div>

      {!q && (
        <div className="empty-state">
          <div className="es-ico">🔍</div>
          <div className="es-t">Nothing to search yet</div>
          <div className="es-m">Use the search bar in the top bar — you can look up campaigns, block heights, transaction hashes, or validators.</div>
        </div>
      )}

      {q && loading && <div className="empty-state"><div className="es-ico">⏳</div><div className="es-t">Searching…</div></div>}

      {q && error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      {q && !loading && !error && data && totalResults === 0 && (
        <div className="empty-state">
          <div className="es-ico">🕳️</div>
          <div className="es-t">No results for "{q}"</div>
          <div className="es-m">Try a campaign name, an exact block height, a full transaction hash, or a validator name/address.</div>
        </div>
      )}

      {q && !loading && !error && data && data.blocks.length > 0 && (
        <div className="card mb" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Blocks</div>
          {data.blocks.map((b) => (
            <div key={b.block.height} className="row-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line-1)' }}>
              <div>
                <div><b>Block #{b.block.height}</b></div>
                <div style={{ fontSize: 12, color: 'var(--txt-2)' }}>{b.block.txCount} txs · proposer {b.block.proposer?.slice(0, 12) || '—'}…</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/explorer')}>View in explorer →</button>
            </div>
          ))}
        </div>
      )}

      {q && !loading && !error && data && data.txs.length > 0 && (
        <div className="card mb" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Transactions</div>
          {data.txs.map((t) => (
            <div key={t.transaction.txHash} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line-1)' }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{t.transaction.txHash}</div>
                <div style={{ fontSize: 12, color: t.transaction.success ? 'var(--green)' : 'var(--red)' }}>
                  {t.transaction.success ? 'Success' : 'Failed'} · block #{t.transaction.height}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/explorer')}>View in explorer →</button>
            </div>
          ))}
        </div>
      )}

      {q && !loading && !error && data && data.validators.length > 0 && (
        <div className="card mb" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Validators</div>
          {data.validators.map((v) => (
            <div key={v.operatorAddress} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line-1)' }}>
              <div>
                <div><b>{v.name}</b></div>
                <div style={{ fontSize: 12, color: 'var(--txt-2)' }}>{v.commission}% commission · {v.status.replace('BOND_STATUS_', '')}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/validators')}>View →</button>
            </div>
          ))}
        </div>
      )}

      {q && !loading && !error && data && data.campaigns.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Mines campaigns</div>
          {data.campaigns.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line-1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {c.platform && <PlatformIcon platform={c.platform} />}
                <div>
                  <div><b>{c.title}</b></div>
                  <div style={{ fontSize: 12, color: 'var(--txt-2)' }}>{c.rate_per_task} MLPTS · budget {c.budget_remaining}</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/mines/discover')}>View →</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion } from '../../components/ui';
import { minesApi, type WalletTx } from '../../services/minesApi';

function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** History — real WalletTransaction timeline (backend/src/routes/mines.js: GET /transactions). */
export default function MinesHistory() {
  useStoreVersion();

  const [txs, setTxs] = useState<WalletTx[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await minesApi.getTransactions(200);
    if (result.ok && result.data) {
      setTxs(result.data);
    } else {
      setError(result.error || 'Failed to load history');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups: Array<{ day: string; items: WalletTx[] }> = [];
  for (const t of txs || []) {
    const key = dateKey(t.created_at);
    let g = groups.find((x) => x.day === key);
    if (!g) { g = { day: key, items: [] }; groups.push(g); }
    g.items.push(t);
  }

  return (
    <div>
      <div className="view-head"><h1>History</h1><span className="sub">Your campaign timeline</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div className="empty-state"><div className="es-ico">🕘</div><div className="es-t">No campaign history yet</div><div className="es-m">Completed campaigns and rewards will appear here.</div></div>
      )}

      {groups.map((g) => (
        <div key={g.day} className="card mb">
          <div className="sec-title"><h2>{g.day}</h2></div>
          {g.items.map((t) => (
            <div key={t._id} className="list-row">
              <span style={{ fontSize: 18 }}>{t.type === 'credit' ? '💰' : '➖'}</span>
              <div className="grow"><div className="t">{t.description || t.type}</div><div className="m">{t.currency}</div></div>
              <b className={t.type === 'credit' ? 'green' : 'red'}>{t.type === 'credit' ? '+' : '-'}{t.amount} {t.currency}</b>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

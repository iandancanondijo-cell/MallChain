import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, BarChart } from '../../components/ui';
import { minesApi, type WalletTx, type MinesSubmission } from '../../services/minesApi';

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
}

/** Earnings — real WalletTransaction ledger (backend/src/routes/mines.js: GET /transactions). */
export default function MinesEarnings() {
  useStoreVersion();

  const [txs, setTxs] = useState<WalletTx[] | null>(null);
  const [submissions, setSubmissions] = useState<MinesSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [txResult, subResult] = await Promise.all([minesApi.getTransactions(100), minesApi.mySubmissions(100)]);
    if (txResult.ok && txResult.data) setTxs(txResult.data);
    else setError(txResult.error || 'Failed to load earnings');
    if (subResult.ok && subResult.data) setSubmissions(subResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const credits = (txs || []).filter((t) => t.type === 'credit');
  const total = credits.reduce((a, t) => a + t.amount, 0);
  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = credits.filter((t) => new Date(t.created_at).getTime() >= weekCutoff).reduce((a, t) => a + t.amount, 0);

  const byDay: Record<string, number> = {};
  for (const t of credits) {
    const k = dayKey(t.created_at);
    byDay[k] = (byDay[k] || 0) + t.amount;
  }
  const labels = Object.keys(byDay);
  const data = labels.map((k) => byDay[k]);

  const approved = submissions.filter((s) => s.status === 'auto_approved').length;
  const rejected = submissions.filter((s) => s.status === 'rejected').length;

  return (
    <div>
      <div className="view-head"><h1>Earnings</h1><span className="sub">Your Mallpoints from validated campaigns</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      <div className="mc-stats-grid">
        <div className="card"><div className="lbl">Total earned</div><div className="num">{loading ? '—' : fmtNum(total)} <small>MLPTS</small></div></div>
        <div className="card"><div className="lbl">This week</div><div className="num">{loading ? '—' : fmtNum(thisWeek)} <small>MLPTS</small></div></div>
        <div className="card"><div className="lbl">Approved submissions</div><div className="num">{approved} <small>tasks</small></div></div>
        <div className="card"><div className="lbl">Rejected</div><div className="num" style={{ color: 'var(--red-2)' }}>{rejected} <small>tasks</small></div></div>
      </div>
      <div className="card">
        <div className="sec-title"><h2>Earnings over time</h2></div>
        {!loading && credits.length === 0 ? (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 30, textAlign: 'center' }}>No earnings yet — join a campaign to start earning Mallpoints.</div>
        ) : (
          <BarChart data={data} labels={labels} height={180} />
        )}
      </div>
    </div>
  );
}

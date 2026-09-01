import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, LineChart } from '../../components/ui';
import { usePerformance } from '../../services/performanceApi';

const DAY_OPTIONS = [7, 30, 90] as const;

/** Real on-chain inflow/outflow performance for the connected wallet — backend/src/routes/history.js's GET /api/history/performance. */
export default function Performance() {
  useStoreVersion();
  const address = store.state.wallet.address;
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);
  const { data, loading, error } = usePerformance(address, days);

  const series = data?.series ?? [];
  const totalInflow = series.reduce((a, p) => a + p.inflow, 0);
  const totalOutflow = series.reduce((a, p) => a + p.outflow, 0);
  const netTotal = totalInflow - totalOutflow;
  const currentCumulative = series.length ? series[series.length - 1].cumulativeNet : 0;

  return (
    <div>
      <div className="view-head">
        <h1>Performance</h1>
        <span className="sub">Real inflow/outflow, computed from your on-chain transaction history</span>
      </div>

      {!address ? (
        <div className="card">
          <div className="empty-state"><div className="es-ico">🔗</div><div className="es-t">No wallet connected</div><div className="es-m">Connect a wallet to view performance.</div></div>
        </div>
      ) : (
        <>
          {error && (
            <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
              <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
            </div>
          )}

          <div className="seg-group mb" role="group" aria-label="Time range">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={'seg' + (days === d ? ' active' : '')}
                aria-pressed={days === d}
                onClick={() => setDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>

          <div className="mc-stats-grid">
            <div className="card"><div className="lbl">Total inflow</div><div className="num">{loading ? '—' : fmtNum(totalInflow)}</div></div>
            <div className="card"><div className="lbl">Total outflow</div><div className="num">{loading ? '—' : fmtNum(totalOutflow)}</div></div>
            <div className="card"><div className="lbl">Net ({days}d)</div><div className="num">{loading ? '—' : fmtNum(netTotal)}</div></div>
            <div className="card"><div className="lbl">Cumulative net</div><div className="num">{loading ? '—' : fmtNum(currentCumulative)}</div></div>
          </div>

          <div className="card">
            <div className="sec-title"><h2>Cumulative net over time</h2></div>
            {series.length === 0 ? (
              <div className="tiny" style={{ padding: 16 }}>{loading ? 'Loading…' : 'No transactions in this period yet'}</div>
            ) : (
              <LineChart data={series.map((p) => p.cumulativeNet)} height={180} />
            )}
          </div>

          {series.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="sec-title"><h2>Daily breakdown</h2></div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>Date</th><th className="num">Inflow</th><th className="num">Outflow</th><th className="num">Net</th></tr></thead>
                  <tbody>
                    {[...series].reverse().map((p) => (
                      <tr key={p.date}>
                        <td>{p.date}</td>
                        <td className="num">{fmtNum(p.inflow)}</td>
                        <td className="num">{fmtNum(p.outflow)}</td>
                        <td className="num">{fmtNum(p.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

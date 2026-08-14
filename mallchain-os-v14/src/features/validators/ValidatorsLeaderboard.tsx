import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum } from '../../components/ui';
import { validatorsApi, type ValidatorLeaderboardEntry } from '../../services/validatorsApi';

/** Real validator leaderboard — reputation computed on-chain from uptime/stake/commission (see validatorCenterService.js). */
export default function ValidatorsLeaderboard() {
  useStoreVersion();

  const [rows, setRows] = useState<ValidatorLeaderboardEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await validatorsApi.leaderboard();
    if (result.ok && result.data) {
      setRows(result.data.validators);
    } else {
      setError(result.error || 'Failed to load leaderboard');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="view-head"><h1>Validators Leaderboard</h1><span className="sub">Ranked by uptime, stake share &amp; commission</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      <div className="card">
        {loading && !rows && <div className="tiny">Loading…</div>}
        {rows?.length === 0 && (
          <div className="empty-state"><div className="es-ico">🏆</div><div className="es-t">No validators yet</div></div>
        )}
        {(rows || []).map((r, i) => (
          <div key={r.operatorAddress} className="lb-row">
            <span className="lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <div className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>{r.name[0]}</div>
            <div className="lb-name">
              <div className="t">{r.name} {r.jailed && <span className="mc-badge b-rejected">jailed</span>}</div>
              <div className="m">{r.status} · {r.commission}% commission</div>
            </div>
            <div className="lb-acc"><div className="bar"><i style={{ width: r.uptime + '%', background: r.uptime >= 99 ? 'var(--green)' : 'var(--gold)' }} /></div><div className="tiny" style={{ textAlign: 'right' }}>{r.uptime.toFixed(1)}% uptime</div></div>
            <div className="lb-stat"><div className="t">{fmtNum(r.totalStaked)}</div><div className="m">MALL staked</div></div>
            <div className="lb-stat"><div className="t gold">{r.reputationScore}</div><div className="m">score</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

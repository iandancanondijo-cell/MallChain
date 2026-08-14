import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum } from '../../components/ui';
import { validatorsApi, type ChainValidator } from '../../services/validatorsApi';

/** Real Cosmos x/staking validator set for Mallchain — not the Mines review game (see /mines/validator-queue). */
export default function ValidatorsHome({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();

  const [validators, setValidators] = useState<ChainValidator[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await validatorsApi.list();
    if (result.ok && result.data) {
      setValidators(result.data.validators);
    } else {
      setError(result.error || 'Failed to load validators');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalStaked = (validators || []).reduce((s, v) => s + v.totalStaked, 0);
  const bonded = (validators || []).filter((v) => v.status === 'BOND_STATUS_BONDED').length;

  return (
    <div>
      <div className="mc-hero" style={{ borderColor: 'rgba(243,186,47,.3)' }}>
        <h1>Mallchain Validators</h1>
        <p>
          Validators run the Cosmos consensus that produces Mallchain's blocks — they bond stake and are
          slashed for downtime or double-signing. This is separate from Mines Proof Reviewers, who vote on
          social-content submissions (see the Mines section for that).
        </p>
        <div className="mc-hero-btns">
          <button className="btn btn-primary" onClick={() => navigate('/validators/apply')}>Apply to Validate</button>
          <button className="btn btn-ghost" onClick={() => navigate('/validators/leaderboard')}>View Leaderboard</button>
          <button className="btn btn-ghost" onClick={() => navigate('/validators/profile')}>My Application</button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      <div className="mc-stats-grid">
        <div className="card"><div className="lbl">Bonded validators</div><div className="num">{loading ? '—' : bonded}</div></div>
        <div className="card"><div className="lbl">Total staked</div><div className="num">{loading ? '—' : fmtNum(totalStaked)} MALL</div></div>
      </div>

      <div className="card">
        <div className="sec-title"><h2>Active validator set</h2></div>
        {loading && !validators && <div className="tiny">Loading…</div>}
        {validators?.length === 0 && (
          <div className="empty-state"><div className="es-ico">🛡</div><div className="es-t">No bonded validators found</div><div className="es-m">The chain may still be initializing.</div></div>
        )}
        {(validators || []).map((v) => (
          <div key={v.operatorAddress} className="list-row">
            <span style={{ fontSize: 18 }}>{v.logo}</span>
            <div className="grow">
              <div className="t">{v.name}</div>
              <div className="m" style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>{v.operatorAddress}</div>
            </div>
            <div className="tiny" style={{ textAlign: 'right' }}>
              <div>{fmtNum(v.totalStaked)} MALL staked</div>
              <div>{v.commission}% commission</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

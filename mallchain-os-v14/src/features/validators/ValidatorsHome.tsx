import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum } from '../../components/ui';
import { validatorsApi, type ChainValidator } from '../../services/validatorsApi';
import { Shield, Server, AlertTriangle, ArrowRight, Lock } from 'lucide-react';

/** Real Cosmos x/staking validator set — infrastructure/trust glassmorphism layout. */
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

  useEffect(() => { load(); }, [load]);

  const totalStaked = error ? null : (validators || []).reduce((s, v) => s + v.totalStaked, 0);
  const bonded = error ? null : (validators || []).filter((v) => v.status === 'BOND_STATUS_BONDED').length;

  return (
    <div>
      <div className="mc-hero">
        <h1>Mallchain Validators</h1>
        <p>
          Validators run the Cosmos consensus that produces Mallchain's blocks — they bond stake and are
          slashed for downtime or double-signing. This is separate from Mines Proof Reviewers, who vote on
          social-content submissions (see the Mines section for that).
        </p>
        <div className="mc-hero-btns">
          <button className="btn btn-primary" onClick={() => navigate('/validators/apply')}><Shield size={14} /> Apply to Validate</button>
          <button className="btn btn-ghost" onClick={() => navigate('/validators/leaderboard')}>View Leaderboard</button>
          <button className="btn btn-ghost" onClick={() => navigate('/validators/profile')}>My Application</button>
        </div>
      </div>

      {error && (
        <div className="wallet-error-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--red)', fontSize: 13, flex: 1 }}>{error}</span>
          <button onClick={load} className="sec-link-btn" style={{ color: 'var(--red)' }}>Retry</button>
        </div>
      )}

      {/* Stat cards */}
      <div className="mc-stats-grid" style={error ? { opacity: 0.65 } : undefined}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.12)', color: 'rgb(var(--section-accent-rgb))' }}>
            <Server size={20} />
          </div>
          <div>
            <div className="lbl" style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bonded validators</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>
              {loading ? '—' : error ? 'N/A' : bonded}
            </div>
            {error && <div className="tiny muted" style={{ marginTop: 4 }}>service unavailable</div>}
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.08)', color: 'rgb(var(--section-accent-rgb))' }}>
            <Lock size={20} />
          </div>
          <div>
            <div className="lbl" style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total staked</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>
              {loading ? '—' : error ? 'N/A' : `${fmtNum(totalStaked ?? 0)} MALL`}
            </div>
            {error && <div className="tiny muted" style={{ marginTop: 4 }}>data unavailable</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sec-title">
          <h2>Active validator set</h2>
          {error && <span className="sub" style={{ color: 'var(--gold-2)' }}>⚠ partial data</span>}
        </div>
        {loading && !validators && <div className="tiny" style={{ padding: 16 }}>Loading…</div>}
        {error && !loading && (
          <div className="empty-state">
            <div className="es-ico"><AlertTriangle size={28} /></div>
            <div className="es-t">Validator data unavailable</div>
            <div className="es-m">Couldn't load the validator set — retry above.</div>
          </div>
        )}
        {!error && validators?.length === 0 && (
          <div className="empty-state">
            <div className="es-ico"><Shield size={28} /></div>
            <div className="es-t">No bonded validators found</div>
            <div className="es-m">The chain may still be initializing.</div>
          </div>
        )}
        {(!error && validators || []).map((v) => (
          <div key={v.operatorAddress} className="list-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{v.logo}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="t" style={{ fontWeight: 600 }}>{v.name}</div>
              <div className="m" style={{ fontSize: 11.5, color: 'var(--txt-2)', fontFamily: 'var(--font-mono)' }}>{v.operatorAddress}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtNum(v.totalStaked)} MALL</div>
              <div className="tiny" style={{ color: 'var(--txt-3)' }}>{v.commission}% commission</div>
            </div>
            <ArrowRight size={14} style={{ color: 'var(--txt-3)', flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

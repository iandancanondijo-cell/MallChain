import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum } from '../../components/ui';
import { validatorsApi, type ValidatorLeaderboardEntry } from '../../services/validatorsApi';

/**
 * Real validator leaderboard — reputation computed on-chain from uptime, stake
 * share and commission (see validatorCenterService.js).
 *
 * Two things this board can and cannot tell you, both stated below rather than
 * left to the reader: it only ever lists validators in the chain's BOND_STATUS_BONDED
 * set, and a validator whose slashing record could not be read has no uptime at
 * all — the server sends null for that, never the flattering 100 a defaulted
 * "0 blocks missed" would draw.
 */
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

  useEffect(() => { load(); }, [load]);

  const listed = rows || [];
  const uptimeKnown = listed.filter((r) => r.uptime !== null);
  const uptimeMissing = listed.length - uptimeKnown.length;
  const totalStake = listed.reduce((t, r) => t + (r.totalStaked || 0), 0);
  const jailedCount = listed.filter((r) => r.jailed).length;
  const avgUptime = uptimeKnown.length > 0
    ? uptimeKnown.reduce((t, r) => t + (r.uptime || 0), 0) / uptimeKnown.length
    : null;

  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">Validators Leaderboard</h1><span className="sub">Bonded chain validators, ranked by uptime, stake share &amp; commission</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="earn-grid" style={{ marginBottom: 14 }}>
          <div className="card earn-card">
            <div className="lbl">Validators listed</div>
            <div className="num">{rows.length}</div>
            <div className="def">Every one is in the chain's bonded set. Applicants who were approved but never bonded, and validators that have since unbonded, are not on this board.</div>
            <div className="src">cosmos/staking v1beta1 validators · status=BOND_STATUS_BONDED</div>
          </div>
          <div className="card earn-card">
            <div className="lbl">Stake behind them</div>
            <div className="num">{fmtNum(totalStake)} <span className="unit" style={{ fontSize: 11 }}>MALL</span></div>
            <div className="def">Self-delegations plus every delegation these {rows.length} validators hold, summed. It is not a share of the chain — the bonded pool total is not reported here.</div>
            <div className="src">cosmos/staking v1beta1 validators · tokens</div>
          </div>
          <div className="card earn-card">
            <div className="lbl">Average uptime</div>
            <div className="num">{avgUptime === null ? '—' : `${avgUptime.toFixed(1)}%`}</div>
            <div className="def">
              {avgUptime === null
                ? 'No validator here has a signing record the chain would share, so there is no uptime to average — not even a zero.'
                : `Mean of the ${uptimeKnown.length} validators whose signing record was readable${uptimeMissing > 0 ? `; ${uptimeMissing} could not be read and are left out of this average` : ''}.`}
            </div>
            <div className="src">cosmos/slashing v1beta1 signing_infos · missed_blocks_counter</div>
          </div>
          <div className="card earn-card">
            <div className="lbl">Jailed right now</div>
            <div className="num">{jailedCount}</div>
            <div className="def">
              {jailedCount === 0
                ? `None of the ${rows.length} bonded validators is jailed, so all of them are signing.`
                : `${jailedCount} of ${rows.length} are jailed: their node missed blocks in the signing window, so it is not validating or earning until it unjails.`}
            </div>
            <div className="src">cosmos/staking v1beta1 validators · jailed</div>
          </div>
        </div>
      )}

      <div className="card card-glow bg-gradient-card stagger" style={error ? { opacity: 0.65 } : undefined}>
        {loading && !rows && <div className="tiny">Loading…</div>}
        {error && !loading && (
          <div className="empty-state">
            <div className="es-ico">⚠️</div>
            <div className="es-t">Leaderboard unavailable</div>
            <div className="es-m">Couldn't load validator rankings — use the Retry button above.</div>
          </div>
        )}
        {!error && rows?.length === 0 && (
          <div className="empty-state">
            <div className="es-ico">🏆</div>
            <div className="es-t">No bonded validators</div>
            <div className="es-m">The chain reports an empty bonded set, so nothing can be ranked yet. A validator only appears here after its own signed self-bond enters the bonded set.</div>
          </div>
        )}
        {(!error && rows || []).map((r, i) => (
          <div key={r.operatorAddress} className="lb-row">
            <span className="lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <div className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>{r.name[0]}</div>
            <div className="lb-name">
              <div className="t">{r.name} {r.jailed && <span className="mc-badge b-rejected">jailed</span>}</div>
              <div className="m">{r.status} · {r.commission}% commission</div>
            </div>
            <div className="lb-acc">
              <div className="bar"><i style={r.uptime === null ? undefined : { width: r.uptime + '%', background: r.uptime >= 99 ? 'var(--green)' : 'var(--gold)' }} /></div>
              <div className="tiny" style={{ textAlign: 'right' }}>{r.uptime === null ? 'uptime not reported' : `${r.uptime.toFixed(1)}% uptime`}</div>
            </div>
            <div className="lb-stat"><div className="t">{fmtNum(r.totalStaked)}</div><div className="m">MALL staked</div></div>
            <div className="lb-stat"><div className="t gold">{r.reputationScore}</div><div className="m">score</div></div>
          </div>
        ))}
      </div>

      {rows && rows.length > 0 && (
        <div className="tiny muted" style={{ marginTop: 12 }}>
          Score weights uptime at 55%, stake share at 25% and commission at 20%.
          {uptimeMissing > 0 && ` ${uptimeMissing} of these have no readable signing record, so their score is built from stake share and commission alone and their uptime reads "not reported" rather than 100%.`}
          {' '}These are chain validators; the Mallpoints Proof Reviewers who vote on your submissions are a separate pool of approved applicants holding an MLPTS bond — see Proof Reviewers.
        </div>
      )}
    </div>
  );
}

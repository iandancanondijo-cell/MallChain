import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, ScoreRing } from '../../components/ui';
import { minesApi, type ParticipantLeaderboardEntry, type MinesProfile } from '../../services/minesApi';

/** Leaderboard — real top Campaign Participants (backend/src/routes/mines.js: GET /leaderboard). */
export default function MinesLeaderboard() {
  useStoreVersion();

  const [rows, setRows] = useState<ParticipantLeaderboardEntry[] | null>(null);
  const [profile, setProfile] = useState<MinesProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [lbResult, profileResult] = await Promise.all([minesApi.campaignLeaderboard(), minesApi.getProfile()]);
    if (lbResult.ok && lbResult.data) setRows(lbResult.data);
    else setError(lbResult.error || 'Failed to load leaderboard');
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = rows || [];
  const myIndex = profile ? sorted.findIndex((r) => r.id === profile.id) : -1;
  const myRow = myIndex >= 0 ? sorted[myIndex] : null;
  const maxEarned = Math.max(...sorted.map((r) => r.earned), 1);

  return (
    <div>
      <div className="view-head">
        <h1 className="text-gradient">Leaderboard</h1>
        <span className="sub">Top Campaign Participants by Mallpoints approved from completed campaigns</span>
        {myRow && <span className="chip gold">Your rank: #{myIndex + 1}</span>}
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <div className="empty-state"><div className="es-ico">🏆</div><div className="es-t">No participants yet</div><div className="es-m">Complete campaigns to climb the leaderboard.</div></div>
      )}

      <div className="card card-glow bg-gradient-card">
        {sorted.map((r, i) => (
          <div key={r.id} className={'lb-row' + (profile?.id === r.id ? ' mine' : '')}>
            <span className="lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{r.name[0]?.toUpperCase()}</div>
            <div className="lb-name">
              <div className="t">{r.name} {profile?.id === r.id && <span className="mc-badge b-approved">You</span>}</div>
              <div className="m">{r.tasks} tasks completed</div>
            </div>
            <div className="lb-acc"><div className="bar"><i style={{ width: `${(r.earned / maxEarned) * 100}%` }} /></div></div>
            <div className="lb-stat"><div className="t">{fmtNum(r.earned)} <span className="unit" style={{ fontSize: 10 }}>MLPTS</span></div></div>
          </div>
        ))}
      </div>

      {profile && (
        <div className="card card-glow bg-gradient-card mt">
          <div className="sec-title"><h2>Your standing</h2></div>
          {myRow ? (
            <div className="row">
              <ScoreRing pct={Math.round((myRow.earned / maxEarned) * 100)} size={84} label="Share of top earner" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>#{myIndex + 1} shown on this board</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {fmtNum(myRow.earned)} MLPTS approved from {myRow.tasks} completed campaign{myRow.tasks === 1 ? '' : 's'}.
                </div>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>
              You are not in the ranked list yet — only approved campaign rewards count here, and your wallet balance is not part of it.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

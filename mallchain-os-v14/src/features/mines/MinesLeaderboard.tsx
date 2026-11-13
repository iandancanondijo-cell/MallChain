import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, fmtMoney, ScoreRing } from '../../components/ui';
import { useCurrencyConverter } from '../../services/currency';
import { useMallpointsPrice } from '../../hooks/useMallpointsPrice';
import { store } from '../../store/store';
import { minesApi, type EarningsSummary, type ParticipantLeaderboardEntry, type MinesProfile } from '../../services/minesApi';

/**
 * Leaderboard — real top Campaign Participants (backend/src/routes/mines.js:
 * GET /leaderboard).
 *
 * Every figure here is Mallpoints, which has no price of its own: the server
 * quotes it in KES from its own economy constants, over the dedicated rate
 * endpoint (hooks/useMallpointsPrice.ts → GET /api/mallpoints/price) that the
 * purchase screen reads too. The fiat line is therefore derived in the browser
 * from that rate rather than baked into the ranked rows, so a rate change
 * cannot leave stale money figures on a board that only re-fetches when it
 * reloads. When the rate is unavailable the row says so instead of printing a
 * number computed from a guess.
 */
export default function MinesLeaderboard() {
  useStoreVersion();
  const st = store.state;
  const cur = st.prefs.currency;
  const toDisplay = useCurrencyConverter(cur);
  const { pointPriceKes, pegSource, error: priceError } = useMallpointsPrice();

  const [rows, setRows] = useState<ParticipantLeaderboardEntry[] | null>(null);
  const [profile, setProfile] = useState<MinesProfile | null>(null);
  // Lifetime campaign rewards for THIS account. The ranked list is capped at
  // the top 50, so a miner outside it would otherwise have no total at all.
  const [mine, setMine] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The small money figure beside a Mallpoints amount, or an honest reason. */
  const fiat = (mlpts: number) => {
    if (pointPriceKes === null) return priceError ? 'rate feed unreachable' : 'rate unavailable';
    const converted = toDisplay(mlpts * pointPriceKes, 'KES');
    return converted === null ? 'rate loading…' : `≈ ${fmtMoney(converted, cur)}`;
  };
  /** One Mallpoint in the display currency, for the card that states the rate. */
  const ratePerPoint = pointPriceKes === null ? null : toDisplay(pointPriceKes, 'KES');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [lbResult, profileResult, summaryResult] = await Promise.all([
      minesApi.campaignLeaderboard(),
      minesApi.getProfile(),
      minesApi.getEarningsSummary(),
    ]);
    if (lbResult.ok && lbResult.data) setRows(lbResult.data);
    else setError(lbResult.error || 'Failed to load leaderboard');
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data);
    if (summaryResult.ok && summaryResult.data) setMine(summaryResult.data);
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
              <div className="m">{r.tasks} task{r.tasks === 1 ? '' : 's'} completed</div>
            </div>
            <div className="lb-acc"><div className="bar"><i style={{ width: `${(r.earned / maxEarned) * 100}%` }} /></div></div>
            <div className="lb-stat">
              <div className="t">{fmtNum(r.earned)} <span className="unit" style={{ fontSize: 10 }}>MLPTS</span></div>
              {/* The money figure is this account's ranking turned into what it
                  is worth, at the live Mallpoints rate — not a second reward. */}
              <div className="m">{fiat(r.earned)}</div>
            </div>
          </div>
        ))}
      </div>

      {sorted.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          The money line under each score values that miner&rsquo;s Mallpoints at the live rate &mdash; a way to read the size of a lead, not an amount anyone can withdraw.
        </div>
      )}

      {profile && (
        <div className="card card-glow bg-gradient-card mt">
          <div className="sec-title"><h2>Your standing</h2></div>
          {/* Your total comes from your own settled submissions, not from the
              ranked rows: this board is the top 50, so 51st and below would
              otherwise read as having earned nothing. */}
          <div className="earn-grid" style={{ marginBottom: 12 }}>
            <div className="card earn-card">
              <div className="lbl">Mallpoints you have made</div>
              <div className="num">{fmtNum(mine?.approvedMlpts ?? 0)} <span className="unit" style={{ fontSize: 11 }}>MLPTS</span></div>
              <div className="def">
                {mine
                  ? `Approved by reviewers across ${mine.approvedCount} completed campaign task${mine.approvedCount === 1 ? '' : 's'}, since your first one.`
                  : 'Not loaded yet.'}
              </div>
              <div className="src">task_submissions · settled rewards</div>
            </div>
            <div className="card earn-card">
              <div className="lbl">What that is worth</div>
              <div className="num" style={{ fontSize: pointPriceKes === null ? 14 : 20 }}>{fiat(mine?.approvedMlpts ?? 0)}</div>
              <div className="def">
                {ratePerPoint === null
                  ? 'No rate, so no money figure is printed.'
                  : `${fmtNum(mine?.approvedMlpts ?? 0)} MLPTS at the live Mallpoints rate of ${fmtMoney(ratePerPoint, cur)} each${cur === 'KES' ? '' : ' (converted from KES)'}.`}
              </div>
              <div className="src">mallpoints/price · pointPriceKes{pegSource === 'default' ? ' (deployment default)' : ''}, {cur}</div>
            </div>
          </div>
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
              {mine && mine.approvedCount > 0
                ? `You have earned rewards but are not in the rows above — this board lists the top ${sorted.length}, and rank is decided by Mallpoints approved, not your wallet balance.`
                : 'You are not in the ranked list yet — only approved campaign rewards count here, and your wallet balance is not part of it.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

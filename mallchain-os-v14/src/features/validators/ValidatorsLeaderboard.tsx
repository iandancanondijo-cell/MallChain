import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';

/** Rewards Leaderboard — projected monthly MALL (net desc) + reputation board. */
export default function ValidatorsLeaderboard({ tab: initialTab = 'reputation', navigate }: { tab?: string; navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const [tab, setTab] = useState<'reputation' | 'rewards'>(initialTab === 'rewards' ? 'rewards' : 'reputation');

  const lb = st.validators.rewardsLeaderboard.validators;
  const rewards = [...lb].sort((a, b) => (b.net as number) - (a.net as number));

  const calcMine = (v: { name: string; reviewsPerDay: number; accuracy: number }) => {
    store.state.validators.calculator.inputs = { ...store.state.validators.calculator.inputs, reviews: v.reviewsPerDay, acc: v.accuracy, days: 26 };
    store.commit();
    toast(`Calculator pre-filled with ${v.name} stats ✓`);
    navigate('/validators/calculator');
  };

  const reps = [
    { name: 'Kevin Otieno', acc: 92, votes: 412, correct: 379, rank: 'Gold', mine: true },
    { name: 'Amina Wanjiru', acc: 97, votes: 388, correct: 376, rank: 'Gold', mine: false },
    { name: 'Brian Mwangi', acc: 94, votes: 355, correct: 334, rank: 'Gold', mine: false },
    { name: 'Grace Achieng', acc: 90, votes: 300, correct: 270, rank: 'Silver', mine: false },
    { name: 'Samuel Kipchoge', acc: 88, votes: 264, correct: 232, rank: 'Silver', mine: false },
    { name: 'Faith Njeri', acc: 95, votes: 420, correct: 399, rank: 'Gold', mine: false },
  ];

  return (
    <div>
      <div className="view-head"><h1>Validators Leaderboard</h1><span className="sub">The trust layer of the mining ecosystem</span></div>
      <div className="mc-subnav" style={{ marginBottom: 16 }}>
        <button className={tab === 'reputation' ? 'on' : ''} onClick={() => setTab('reputation')}>Reputation / accuracy</button>
        <button className={tab === 'rewards' ? 'on' : ''} onClick={() => setTab('rewards')}>Rewards (projected MALL)</button>
      </div>

      {tab === 'reputation' ? (
        <div className="card">
          {reps.map((r, i) => (
            <div key={r.name} className={'lb-row' + (r.mine ? ' mine' : '')}>
              <span className="lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <div className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>{r.name[0]}</div>
              <div className="lb-name"><div className="t">{r.name} {r.mine && <span className="mc-badge b-approved">You</span>}</div><div className="m">{r.rank} rank · {r.votes} votes</div></div>
              <div className="lb-acc"><div className="bar"><i style={{ width: r.acc + '%', background: r.acc >= 90 ? 'var(--green)' : 'var(--gold)' }} /></div><div className="tiny" style={{ textAlign: 'right' }}>{r.acc}% accuracy</div></div>
              <div className="lb-stat"><div className="t">{r.correct}/{r.votes}</div><div className="m">correct</div></div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="card">
            {rewards.length === 0 && (
              <div className="empty-state"><div className="es-ico">🏅</div><div className="es-t">No reward projections yet</div><div className="es-m">Validators appear here once they have review history.</div></div>
            )}
            {rewards.map((v, i) => {
              const r = v as { name: string; initial: string; verified: boolean; reviewsPerDay: number; accuracy: number; strikeTier: number; multiplier: number; gross: number; net: number; change: number; mine?: boolean };
              return (
                <div key={r.name} className={'lb-row' + (r.mine ? ' mine' : '')}>
                  <span className="lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                  <div className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>{r.initial || r.name[0]}</div>
                  <div className="lb-name">
                    <div className="t">{r.name} {r.verified && <span title="Verified">✓</span>} {r.mine && <span className="mc-badge b-approved">You</span>}</div>
                    <div className="m">{r.reviewsPerDay}/day · {r.accuracy}% acc</div>
                  </div>
                  <div className="lb-stat"><div className="t">{r.strikeTier > 0 ? <span className={'mc-badge ' + (r.strikeTier >= 4 ? 'b-rejected' : 'b-pending')}>T{r.strikeTier}</span> : <span className="mc-badge b-approved">0</span>}</div><div className="m">strike</div></div>
                  <div className="lb-stat"><div className="t">{r.multiplier}×</div><div className="m">mult</div></div>
                  <div className="lb-stat"><div className="t">{fmtNum(r.gross)}</div><div className="m">gross/mo</div></div>
                  <div className="lb-stat"><div className="t gold">{fmtNum(r.net)}</div><div className="m">net/mo</div></div>
                  <div className="lb-stat"><div className="t" style={{ color: r.change >= 0 ? 'var(--green-2)' : 'var(--red-2)' }}>{r.change >= 0 ? '▲' : '▼'} {Math.abs(r.change)}%</div><div className="m">vs last mo</div></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => calcMine(r)}>Calculate mine →</button>
                </div>
              );
            })}
          </div>
          <div className="tiny mt">Projections use the standard model: 0.8 MALL per consensus-matched review, 80% consensus, strike ladder 0.5× from tier 2, 25% stake slash at tier 4. Open the Rewards Calculator to model your own numbers.</div>
        </>
      )}
    </div>
  );
}

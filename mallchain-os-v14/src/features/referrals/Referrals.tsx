import { store } from '../../store/store';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';

/** Referrals — invite code + referral tree + claim commission via applyTx. */
export default function Referrals() {
  useStoreVersion();
  const st = store.state;
  const R = st.referrals;

  const copyCode = async () => {
    const link = `https://mallchain.ke/r/${R.code}`;
    try { await navigator.clipboard.writeText(link); }
    catch {
      const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast('Referral link copied');
  };

  const claim = () => {
    if (R.earned - R.claimed <= 0) { toast('No unclaimed commission yet', false); return; }
    const amount = R.earned - R.claimed;
    store.applyTx({ type: 'referral-claim', amount, asset: 'MLPTS', kind: 'credit', note: 'Referral commission claim', notifTitle: `Claimed ${amount} MLPTS referral commission`, notifKind: 'social', activityText: `Claimed ${amount} MLPTS referral commission` });
    R.claimed = R.earned;
    store.commit();
    toast(`Claimed ${amount} MLPTS — credited to your balance`);
  };

  return (
    <div>
      <div className="view-head"><h1>Referrals</h1><span className="sub">Earn 5% of your referrals' MLPTS rewards</span></div>
      <div className="stat-grid">
        <div className="card"><div className="card-label">Your code</div><div className="card-value mono" style={{ fontSize: 19 }}>{R.code}</div><div className="card-sub"><button className="btn btn-ghost btn-sm" onClick={copyCode}>Copy invite link</button></div></div>
        <div className="card"><div className="card-label">Referrals</div><div className="card-value">{R.count}</div><div className="card-sub">7 active this month</div></div>
        <div className="card"><div className="card-label">Total earned</div><div className="card-value up">{fmtNum(R.earned)} <span className="unit">MLPTS</span></div><div className="card-sub">lifetime commission</div></div>
        <div className="card"><div className="card-label">Claimable</div><div className="card-value" style={{ color: 'var(--gold)' }}>{fmtNum(R.earned - R.claimed)} <span className="unit">MLPTS</span></div><div className="card-sub"><button className="btn btn-primary btn-sm" onClick={claim} disabled={R.earned - R.claimed <= 0}>Claim commission</button></div></div>
      </div>

      <div className="card">
        <div className="sec-title"><h2>Referral tree</h2><span className="sub">tier 1 & 2</span></div>
        <div className="ref-tree">
          <div className="ref-node">You<br /><b className="gold">{R.code}</b></div>
          <div className="ref-node">T1 · Faith N.<br />+60 MLPTS</div>
          <div className="ref-node">T1 · David O.<br />+35 MLPTS</div>
          <div className="ref-node">T1 · Lucy K.<br />+50 MLPTS</div>
          <div className="ref-node">T2 · Mary W.<br />+12 MLPTS</div>
          <div className="ref-node">T2 · Peter N.<br />+8 MLPTS</div>
        </div>
        <div className="tiny mt">Commission: 5% of tier-1 and 2% of tier-2 referrals' MLPTS rewards. Claimable any time via applyTx.</div>
      </div>
    </div>
  );
}

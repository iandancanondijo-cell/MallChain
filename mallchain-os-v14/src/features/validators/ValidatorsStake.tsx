import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';

/** Stake — 500 MALL locked via applyTx (deducts balance, records tx/notif/activity). */
export default function ValidatorsStake({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const V = st.validators;
  const [busy, setBusy] = useState(false);

  const stake = () => {
    if (st.balances.MALL < 500) { toast('Insufficient MALL — need 500 to stake', false); return; }
    setBusy(true);
    setTimeout(() => {
      const res = store.applyTx({
        type: 'validator-stake', amount: 500, asset: 'MALL', kind: 'debit',
        note: 'Validator stake deposit (locked)',
        notifTitle: 'Validator stake locked — 500 MALL', notifKind: 'validators',
        activityText: 'Locked 500 MALL as validator stake',
      });
      if (res.ok) {
        V.stakeLocked = 500;
        V.stakeTx = res.tx?.id || '';
        store.commit();
        toast('500 MALL locked — proceed to training');
        navigate('/validators/training');
      } else toast(res.error || 'Failed', false);
      setBusy(false);
    }, 900);
  };

  return (
    <div>
      <div className="view-head"><h1>Stake deposit</h1><span className="sub">Step 3 of 13 — lock 500 MALL</span></div>
      <div className="card" style={{ maxWidth: 560 }}>
        {V.stakeLocked >= 500 ? (
          <>
            <div className="sec-title"><h2>✓ Stake locked</h2></div>
            <div className="mc-stats-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <div className="card"><div className="lbl">Locked</div><div className="num">{fmtNum(V.stakeLocked)} <small>MALL</small></div></div>
              <div className="card"><div className="lbl">Slash risk (tier 4)</div><div className="num">125 <small>MALL</small></div></div>
            </div>
            <button className="btn btn-primary btn-block" onClick={() => navigate('/validators/training')}>Continue to Training →</button>
          </>
        ) : (
          <>
            <div className="sec-title"><h2>Lock 500 MALL</h2><span className="sub">withheld while you validate — returned on exit (minus any slash)</span></div>
            <div className="mc-stats-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <div className="card"><div className="lbl">Your MALL balance</div><div className="num" style={{ color: st.balances.MALL >= 500 ? 'var(--green-2)' : 'var(--red-2)' }}>{fmtNum(st.balances.MALL)}</div></div>
              <div className="card"><div className="lbl">Required</div><div className="num">500 <small>MALL</small></div></div>
            </div>
            {st.balances.MALL < 500 && <span className="chip red mb">Insufficient balance — acquire more MALL to stake.</span>}
            <button className="btn btn-primary btn-block" onClick={stake} disabled={busy || st.balances.MALL < 500}>
              {busy && <span className="spin" />} Lock 500 MALL via applyTx
            </button>
            <div className="tiny mt">Transaction is signed with your wallet, broadcast, and recorded in your activity + notifications. Stake is eligible for a 25% slash at strike tier 4.</div>
          </>
        )}
      </div>
    </div>
  );
}

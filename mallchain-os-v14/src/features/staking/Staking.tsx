import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney, BarChart, toast } from '../../components/ui';

/** Staking — delegate + 7-day cooldown unstake + claim after cooldown. */
export default function Staking() {
  useStoreVersion();
  const st = store.state;
  const cur = st.prefs.currency;
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);

  const cooldownLeft = st.staking.cooldownEnds ? Math.max(0, Math.ceil((st.staking.cooldownEnds - Date.now()) / 86400e3)) : 0;

  const delegate = () => {
    const a = parseFloat(amt);
    if (!a || a > st.balances.MALL) { toast('Invalid amount or insufficient balance', false); return; }
    setBusy(true);
    setTimeout(() => {
      store.applyTx({ type: 'stake', amount: a, asset: 'MALL', kind: 'debit', note: 'Delegate to staking pool', notifTitle: `Staked ${a} MALL`, notifKind: 'tx', activityText: `Delegated ${a} MALL at ${st.staking.apy}% APY` });
      st.staking.delegated += a;
      st.staking.history.unshift({ id: 'st' + Date.now(), type: 'delegate', amount: a, ts: Date.now() });
      store.commit();
      setBusy(false);
      toast(`Staked ${a} MALL — earning ${st.staking.apy}% APY`);
    }, 800);
  };

  const startUnstake = () => {
    if (st.staking.delegated <= 0) { toast('Nothing staked yet', false); return; }
    const a = Math.min(st.staking.delegated, parseFloat(amt) || st.staking.delegated);
    st.staking.pendingUnstake = a;
    st.staking.cooldownEnds = Date.now() + 7 * 86400e3;
    store.commit();
    toast('Unstake initiated — 7-day cooldown started');
  };

  const claim = () => {
    store.credit('MALL', st.staking.pendingUnstake, 'unstake', 'Unstake after cooldown');
    st.staking.delegated -= st.staking.pendingUnstake;
    st.staking.pendingUnstake = 0;
    st.staking.cooldownEnds = null;
    store.commit();
    toast(`Claimed ${st.staking.pendingUnstake || ''} MALL back — cooldown complete`);
  };

  const rewards7d = st.staking.delegated * (st.staking.apy / 100) / 52;

  return (
    <div>
      <div className="view-head"><h1>Staking</h1><span className="sub">Delegate MALL and earn {st.staking.apy}% APY</span></div>
      <div className="stat-grid">
        <div className="card"><div className="card-label">Delegated</div><div className="card-value">{fmtNum(st.staking.delegated)} <span className="unit">MALL</span></div><div className="card-sub">≈ {fmtMoney(st.staking.delegated * 0.42, cur)}</div></div>
        <div className="card"><div className="card-label">APY</div><div className="card-value up">{st.staking.apy}%</div><div className="card-sub">compounded weekly</div></div>
        <div className="card"><div className="card-label">Est. weekly reward</div><div className="card-value">{rewards7d.toFixed(2)} <span className="unit">MALL</span></div><div className="card-sub">≈ {fmtMoney(rewards7d * 0.42, cur)}</div></div>
        {cooldownLeft > 0 && <div className="card"><div className="card-label">Unstake cooldown</div><div className="card-value" style={{ color: 'var(--gold)' }}>{cooldownLeft}d <span className="unit">left</span></div><div className="card-sub">{fmtNum(st.staking.pendingUnstake)} MALL pending</div></div>}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>{cooldownLeft > 0 ? 'Claim after cooldown' : 'Delegate MALL'}</h2></div>
          {cooldownLeft > 0 ? (
            <>
              <div className="muted mb">Your unstake of <b className="gold">{fmtNum(st.staking.pendingUnstake)} MALL</b> will be claimable in {cooldownLeft} day(s).</div>
              <button className="btn btn-primary btn-block" disabled={cooldownLeft > 0} onClick={claim}>Claim {fmtNum(st.staking.pendingUnstake)} MALL</button>
              <div className="tiny mt">Unstake requires a 7-day cooldown. Rewards continue accruing until the claim.</div>
            </>
          ) : (
            <>
              <div className="field"><label>Amount (MALL) — balance {fmtNum(st.balances.MALL)}</label>
                <div className="row">
                  <input className="input" type="number" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setAmt(String(st.balances.MALL))}>Max</button>
                </div>
              </div>
              <button className="btn btn-primary btn-block" onClick={delegate} disabled={busy}>{busy && <span className="spin" />} Delegate & stake</button>
              <button className="btn btn-ghost btn-block mt" onClick={startUnstake} disabled={st.staking.delegated <= 0}>Start unstake (7-day cooldown)</button>
            </>
          )}
        </div>
        <div className="card">
          <div className="sec-title"><h2>Staking history</h2></div>
          {st.staking.history.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>No staking activity yet — delegate MALL to start earning.</div>}
          {st.staking.history.slice(0, 6).map((h) => (
            <div key={h.id} className="list-row">
              <div className="grow"><div className="t">{h.type === 'delegate' ? 'Delegated' : 'Reward'} {h.amount} MALL</div><div className="m">{new Date(h.ts).toLocaleDateString()}</div></div>
              <span className={h.type === 'reward' ? 'green' : 'gold'}>{h.type === 'reward' ? '+' : ''}{h.amount} MALL</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

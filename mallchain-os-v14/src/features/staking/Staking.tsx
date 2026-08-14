import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { stakingApi, type StakingSummary } from '../../services/stakingApi';
import { stakeMlcns, unstake, StakingTxError } from '../../services/stakingTx';

/** Staking — real MsgStake/MsgUnstake against x/mlcoin (backend/src/routes/staking.js). */
export default function Staking() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [summary, setSummary] = useState<StakingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const [unstakingId, setUnstakingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    const res = await stakingApi.getSummary(address);
    if (res.ok && res.data) setSummary(res.data.summary);
    else setError(res.error || 'Failed to load staking summary');
    setLoading(false);
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const delegate = async () => {
    const a = parseFloat(amt);
    if (!a || a <= 0 || a > st.balances.MALL) return toast('Invalid amount or insufficient balance', false);
    if (!st.wallet.mnemonic || !address) return toast('Wallet not connected', false);
    setBusy(true);
    try {
      const result = await stakeMlcns({ mnemonic: st.wallet.mnemonic, fromAddress: address, amountMlcns: a });
      toast(`Staked ${a} MLCNS — tx ${result.txHash.slice(0, 10)}…`);
      setAmt('');
      load();
    } catch (e) {
      toast(e instanceof StakingTxError || e instanceof Error ? e.message : 'Stake failed', false);
    } finally {
      setBusy(false);
    }
  };

  const doUnstake = async (stakeId: string) => {
    if (!st.wallet.mnemonic || !address) return toast('Wallet not connected', false);
    setUnstakingId(stakeId);
    try {
      const result = await unstake({ mnemonic: st.wallet.mnemonic, fromAddress: address, stakeId });
      toast(`Unstaked — principal + rewards paid out (tx ${result.txHash.slice(0, 10)}…)`);
      load();
    } catch (e) {
      toast(e instanceof StakingTxError || e instanceof Error ? e.message : 'Unstake failed', false);
    } finally {
      setUnstakingId(null);
    }
  };

  if (!address) {
    return (
      <div>
        <div className="view-head"><h1>Staking</h1></div>
        <div className="card"><div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>Connect a wallet to stake MLCNS.</div></div>
      </div>
    );
  }

  return (
    <div>
      <div className="view-head"><h1>Staking</h1><span className="sub">Stake MLCNS on-chain — unstaking pays out principal + rewards in one transaction</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="card"><div className="card-label">Actively staked</div><div className="card-value">{loading ? '—' : fmtNum(summary?.totalStaked ?? 0)} <span className="unit">MLCNS</span></div></div>
        <div className="card"><div className="card-label">Rewards claimed (lifetime)</div><div className="card-value up">{loading ? '—' : fmtNum(summary?.totalRewardsClaimed ?? 0)} <span className="unit">MLCNS</span></div></div>
        <div className="card"><div className="card-label">Active stakes</div><div className="card-value">{loading ? '—' : summary?.active.length ?? 0}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>Stake MLCNS</h2></div>
          <div className="field"><label>Amount (MLCNS) — balance {fmtNum(st.balances.MALL)}</label>
            <div className="row">
              <input className="input" type="number" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => setAmt(String(st.balances.MALL))}>Max</button>
            </div>
          </div>
          <button className="btn btn-primary btn-block" onClick={delegate} disabled={busy}>{busy && <span className="spin" />} Stake</button>
          <div className="tiny mt">Unstaking a stake pays out its principal and any accrued rewards together — there's no separate claim step.</div>
        </div>
        <div className="card">
          <div className="sec-title"><h2>Active stakes</h2></div>
          {!loading && (summary?.active.length ?? 0) === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>No active stakes yet.</div>}
          {(summary?.active || []).map((s) => (
            <div key={s.stakeId} className="list-row">
              <div className="grow">
                <div className="t">{fmtNum(s.stakedAmount)} MLCNS</div>
                <div className="m">staked {new Date(s.stakeDate * 1000).toLocaleDateString()}</div>
              </div>
              <button className="btn btn-ghost btn-sm" disabled={unstakingId === s.stakeId} onClick={() => doUnstake(s.stakeId)}>
                {unstakingId === s.stakeId && <span className="spin" />} Unstake
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title"><h2>History</h2></div>
        {!loading && (summary?.history.length ?? 0) === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>No completed stakes yet.</div>}
        {(summary?.history || []).map((s) => (
          <div key={s.stakeId} className="list-row">
            <div className="grow"><div className="t">{fmtNum(s.stakedAmount)} MLCNS</div><div className="m">staked {new Date(s.stakeDate * 1000).toLocaleDateString()}</div></div>
            <span className="green">+{fmtNum(s.rewardsEarned)} MLCNS rewards</span>
          </div>
        ))}
      </div>
    </div>
  );
}

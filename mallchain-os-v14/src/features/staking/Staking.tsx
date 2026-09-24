import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { stakingApi, type StakingSummary } from '../../services/stakingApi';
import { stakeMlcns, unstake, StakingTxError } from '../../services/stakingTx';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { Lock, Unlock, TrendingUp, Coins, History, Zap, AlertTriangle } from 'lucide-react';

/** Staking — DeFi-style glassmorphism layout with real MsgStake/MsgUnstake. */
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

  useEffect(() => { load(); }, [load]);

  const delegate = async () => {
    const a = parseFloat(amt);
    if (!a || a <= 0 || a > st.balances.MALL) return toast('Invalid amount or insufficient balance', false);
    if (!st.wallet.pinEncryptedMnemonic || !address) return toast('Wallet not connected', false);
    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;
    setBusy(true);
    try {
      const result = await stakeMlcns({ mnemonic, fromAddress: address, amountMlcns: a });
      toast(`Staked ${a} MLCNS — tx ${result.txHash.slice(0, 10)}…`);
      setAmt('');
      load();
    } catch (e) {
      toast(e instanceof StakingTxError || e instanceof Error ? e.message : 'Stake failed', false);
    } finally { setBusy(false); }
  };

  const doUnstake = async (stakeId: string) => {
    if (!st.wallet.pinEncryptedMnemonic || !address) return toast('Wallet not connected', false);
    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;
    setUnstakingId(stakeId);
    try {
      const result = await unstake({ mnemonic, fromAddress: address, stakeId });
      toast(`Unstaked — principal + rewards paid out (tx ${result.txHash.slice(0, 10)}…)`);
      load();
    } catch (e) {
      toast(e instanceof StakingTxError || e instanceof Error ? e.message : 'Unstake failed', false);
    } finally { setUnstakingId(null); }
  };

  if (!address) {
    return (
      <div>
        <div className="view-head"><h1>Staking</h1></div>
        <div className="card">
          <div className="empty-state">
            <div className="es-ico"><Lock size={28} /></div>
            <div className="es-t">No wallet connected</div>
            <div className="es-m">Connect a wallet to stake MLCNS and earn rewards.</div>
          </div>
        </div>
      </div>
    );
  }

  const totalStaked = summary?.totalStaked ?? 0;
  const totalRewards = summary?.totalRewardsClaimed ?? 0;
  const activeCount = summary?.active.length ?? 0;

  return (
    <div>
      <div className="view-head">
        <h1>Staking</h1>
        <span className="sub">Stake MLCNS on-chain — unstaking pays out principal + rewards in one transaction</span>
      </div>

      {error && (
        <div className="wallet-error-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--red)', fontSize: 13, flex: 1 }}>{error}</span>
          <button onClick={load} className="sec-link-btn" style={{ color: 'var(--red)' }}>Retry</button>
        </div>
      )}

      {/* Hero panel */}
      <div className="wallet-hero" style={{ opacity: error ? 0.7 : 1 }}>
        <div className="wallet-hero-left">
          <div className="wallet-hero-label">Total value staked</div>
          <div className="wallet-hero-balance">
            <div className="wallet-hero-num">
              {loading ? '—' : fmtNum(totalStaked)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--txt-3)', marginTop: 2 }}>MLCNS locked</div>
          </div>
          <div className="wallet-hero-meta">
            <span className="chip"><Zap size={12} style={{ marginRight: 4 }} />{activeCount} active stake{activeCount !== 1 ? 's' : ''}</span>
            <span className="chip"><TrendingUp size={12} style={{ marginRight: 4 }} />{fmtNum(totalRewards)} rewards claimed</span>
          </div>
        </div>
        <div className="wallet-hero-right" style={{ justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Lock size={36} style={{ color: 'rgb(var(--section-accent-rgb))', marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>On-chain locking</div>
            <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>No unbonding period</div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stat-grid" style={{ opacity: error ? 0.65 : 1 }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.12)', color: 'rgb(var(--section-accent-rgb))' }}>
            <Coins size={20} />
          </div>
          <div>
            <div className="card-label">Actively staked</div>
            <div className="card-value">{loading ? '—' : error ? 'N/A' : <>{fmtNum(totalStaked)} <span className="unit">MLCNS</span></>}</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.12)', color: 'var(--green-2)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="card-label">Rewards claimed</div>
            <div className="card-value up">{loading ? '—' : error ? 'N/A' : <>{fmtNum(totalRewards)} <span className="unit">MLCNS</span></>}</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.08)', color: 'rgb(var(--section-accent-rgb))' }}>
            <Lock size={20} />
          </div>
          <div>
            <div className="card-label">Active stakes</div>
            <div className="card-value">{loading ? '—' : error ? 'N/A' : activeCount}</div>
          </div>
        </div>
      </div>

      {/* Stake form + Active stakes */}
      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>Stake MLCNS</h2></div>
          <div className="field">
            <label>
              Amount (MLCNS)
              <span className="tiny muted" style={{ float: 'right', fontWeight: 400 }}>Balance: {fmtNum(st.balances.MALL)}</span>
            </label>
            <div className="row">
              <input className="input" type="number" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => setAmt(String(st.balances.MALL))}>Max</button>
            </div>
          </div>
          <button className="btn btn-primary btn-block" onClick={delegate} disabled={busy || !!error}>
            {busy && <span className="spin" />} {error ? 'Service unavailable' : 'Stake'}
          </button>
          <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>
            Unstaking pays out principal + accrued rewards together — no separate claim step.
          </div>
        </div>

        <div className="card" style={{ opacity: error ? 0.65 : 1 }}>
          <div className="sec-title">
            <h2>Active stakes</h2>
            {error && <span className="sub" style={{ color: 'var(--gold-2)' }}>⚠ unavailable</span>}
          </div>
          {!loading && error && (
            <div className="empty-state" style={{ padding: '24px 16px' }}>
              <div className="es-ico"><AlertTriangle size={28} /></div>
              <div className="es-t">Active stakes unavailable</div>
              <div className="es-m">Retry above to reload.</div>
            </div>
          )}
          {!loading && !error && activeCount === 0 && (
            <div className="wallet-empty-inline">
              <Unlock size={20} style={{ marginBottom: 6, opacity: 0.5 }} /><br />
              No active stakes yet.
            </div>
          )}
          {((!error && summary?.active) || []).map((s) => (
            <div key={s.stakeId} className="list-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgb(var(--section-accent-rgb))', flexShrink: 0, boxShadow: '0 0 6px rgba(var(--section-accent-rgb),0.5)' }} />
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

      {/* History */}
      <div className="card mt" style={{ opacity: error ? 0.65 : 1 }}>
        <div className="sec-title">
          <h2><History size={16} style={{ marginRight: 8, verticalAlign: -2 }} />History</h2>
          {error && <span className="sub" style={{ color: 'var(--gold-2)' }}>⚠ unavailable</span>}
        </div>
        {!loading && error && (
          <div className="empty-state" style={{ padding: '24px 16px' }}>
            <div className="es-ico"><AlertTriangle size={28} /></div>
            <div className="es-t">Staking history unavailable</div>
            <div className="es-m">Retry above to reload.</div>
          </div>
        )}
        {!loading && !error && (summary?.history.length ?? 0) === 0 && (
          <div className="wallet-empty-inline">No completed stakes yet.</div>
        )}
        {((!error && summary?.history) || []).map((s) => (
          <div key={s.stakeId} className="list-row">
            <div className="grow">
              <div className="t">{fmtNum(s.stakedAmount)} MLCNS</div>
              <div className="m">staked {new Date(s.stakeDate * 1000).toLocaleDateString()}</div>
            </div>
            <span className="green" style={{ fontWeight: 700, fontSize: 13 }}>+{fmtNum(s.rewardsEarned)} MLCNS</span>
          </div>
        ))}
      </div>
    </div>
  );
}

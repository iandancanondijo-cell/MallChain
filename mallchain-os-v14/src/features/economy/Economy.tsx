import { useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney } from '../../components/ui';
import { economyApi, type EconomyState, type EconomyUserHoldings } from '../../services/economyApi';

/** Economy / Tokenomics — real emission schedule, supply, burn, and treasury data from GET /api/economy/state. */
export default function Economy() {
  useStoreVersion();
  const st = store.state;
  const walletAddress = st.wallet.address;
  const [data, setData] = useState<EconomyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<EconomyUserHoldings | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    economyApi.getState().then((res) => {
      if (res.ok && res.data) setData(res.data);
      else setError(res.error || 'Failed to load economic data');
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setHoldings(null);
      return;
    }
    setHoldingsLoading(true);
    economyApi.getUserHoldings(walletAddress).then((res) => {
      setHoldings(res.ok && res.data ? res.data : null);
      setHoldingsLoading(false);
    });
  }, [walletAddress]);

  return (
    <div>
      <div className="view-head">
        <h1>Economy</h1>
        <span className="sub">Mallchain's real emission schedule, supply, and treasury — live from the chain</span>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="empty-state"><div className="es-ico">⏳</div><div className="es-t">Loading economic data…</div></div>
      )}

      {data && (
        <>
          <div className="stat-grid">
            <div className="card">
              <div className="card-label">MLCNS price</div>
              <div className="card-value">{fmtMoney(data.mlcnsPriceKes, 'KES')}</div>
              <div className="tiny mt">buy {fmtMoney(data.market.buyPriceKes, 'KES')} · sell {fmtMoney(data.market.sellPriceKes, 'KES')}</div>
            </div>
            <div className="card">
              <div className="card-label">Total supply</div>
              <div className="card-value">{fmtNum(data.emission.totalSupply)} <span className="unit">MLCNS</span></div>
              <div className="tiny mt">{fmtNum(data.emission.totalAvailable)} available to emission schedule</div>
            </div>
            <div className="card">
              <div className="card-label">Emitted so far</div>
              <div className="card-value">{fmtNum(Number(data.emission.emittedTotal))} <span className="unit">MLCNS</span></div>
              <div className="tiny mt">{fmtNum(data.emission.remainingInSchedule)} remaining in schedule</div>
            </div>
            <div className="card">
              <div className="card-label">Burned so far</div>
              <div className="card-value down">{fmtNum(Number(data.emission.burnedTotal))} <span className="unit">MLCNS</span></div>
              <div className="tiny mt">{data.emission.burnRatePercent}% burn rate on qualifying flows</div>
            </div>
          </div>

          <div className="grid-2 mb">
            <div className="card">
              <div className="sec-title"><h2>Emission — Phase {data.emission.phase}</h2></div>
              <table className="tbl">
                <tbody>
                  <tr><td className="muted">Current month</td><td>{data.emission.currentMonth}</td></tr>
                  <tr><td className="muted">Monthly cap</td><td>{fmtNum(data.emission.monthlyCap)} MLCNS</td></tr>
                  <tr><td className="muted">Daily limit</td><td>{fmtNum(data.emission.dailyLimit)} MLCNS</td></tr>
                  <tr><td className="muted">Months left in schedule</td><td>{data.emission.monthsRemaining}</td></tr>
                </tbody>
              </table>
              <div className="tiny mt">Emission halves every 36 months across 5 phases, from an initial 3,000,000 MLCNS/month down to 187,500 MLCNS/month.</div>
            </div>

            <div className="card">
              <div className="sec-title"><h2>Mallpoints → MLCNS conversion</h2></div>
              <table className="tbl">
                <tbody>
                  <tr><td className="muted">Rate</td><td>{data.conversion.rate}</td></tr>
                  <tr><td className="muted">Value ratio</td><td>1 MLPTS ≈ {data.conversion.valueRatio} MLCNS by market value</td></tr>
                  <tr><td className="muted">Badge holders</td><td>{data.conversion.badgeHolders}</td></tr>
                  <tr><td className="muted">Everyone else</td><td>{data.conversion.nonBadge}</td></tr>
                </tbody>
              </table>
              <div className="tiny mt">Mallpoints are priced at {fmtMoney(data.pointPriceKes, 'KES')} each for value-ratio purposes.</div>
            </div>
          </div>

          <div className="card mb">
            <div className="sec-title"><h2>Emission schedule — all phases</h2></div>
            <table className="tbl">
              <thead>
                <tr><th>Phase</th><th>Months</th><th>Monthly emission</th><th>Cumulative by end of phase</th></tr>
              </thead>
              <tbody>
                {data.schedule.phases.map((p) => (
                  <tr key={p.phase} style={p.phase === data.emission.phase ? { background: 'var(--bg-2)' } : undefined}>
                    <td>{p.phase === data.emission.phase ? <b className="gold">Phase {p.phase} (current)</b> : `Phase ${p.phase}`}</td>
                    <td>{p.months}</td>
                    <td>{p.monthly} MLCNS</td>
                    <td>{p.cumulative} MLCNS</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.wallets && (
            <div className="card mb">
              <div className="sec-title"><h2>Treasury wallets</h2><span className="sub">On-chain balances, for transparency</span></div>
              <table className="tbl">
                <tbody>
                  {Object.entries(data.wallets).map(([name, balance]) => (
                    <tr key={name}>
                      <td className="muted" style={{ textTransform: 'capitalize' }}>{name}</td>
                      <td>{balance === null ? <span className="muted">unavailable</span> : `${fmtNum(balance)} MLCNS`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <div className="sec-title"><h2>Your holdings</h2></div>
            {!walletAddress ? (
              <div className="muted" style={{ padding: 12 }}>Connect a wallet to see your personal holdings here.</div>
            ) : holdingsLoading && !holdings ? (
              <div className="muted" style={{ padding: 12 }}>Loading your holdings…</div>
            ) : holdings ? (
              <table className="tbl">
                <tbody>
                  <tr><td className="muted">MLCNS</td><td>{fmtNum(holdings.mlcns)}</td></tr>
                  <tr><td className="muted">Mallpoints</td><td>{fmtNum(holdings.mallpoints)}</td></tr>
                  <tr><td className="muted">Estimated value</td><td className="gold">{fmtMoney(holdings.estimatedKesValue, 'KES')}</td></tr>
                </tbody>
              </table>
            ) : (
              <div className="muted" style={{ padding: 12 }}>Couldn't load holdings for {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

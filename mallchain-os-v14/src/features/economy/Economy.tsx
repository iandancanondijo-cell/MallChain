import { useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney } from '../../components/ui';
import { economyApi, type EconomyState, type EconomyUserHoldings, type TrackEconomics } from '../../services/economyApi';
import { TrendingUp, Coins, Flame, BarChart3, AlertTriangle, Wallet, ArrowDownRight, Eye, ChevronDown, ChevronUp, Droplets, Users } from 'lucide-react';

/** Economy / Tokenomics — macro-financial glassmorphism layout with real emission/supply/treasury data. */
export default function Economy() {
  useStoreVersion();
  const st = store.state;
  const walletAddress = st.wallet.address;
  const [data, setData] = useState<EconomyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<EconomyUserHoldings | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [track, setTrack] = useState<TrackEconomics | null>(null);
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackLoading, setTrackLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    economyApi.getState().then((res) => {
      if (res.ok && res.data) setData(res.data);
      else setError(res.error || 'Failed to load economic data');
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!walletAddress) { setHoldings(null); return; }
    setHoldingsLoading(true);
    economyApi.getUserHoldings(walletAddress).then((res) => {
      setHoldings(res.ok && res.data ? res.data : null);
      setHoldingsLoading(false);
    });
  }, [walletAddress]);

  const loadTrack = () => {
    setTrackLoading(true);
    economyApi.getTrackEconomics().then((res) => {
      if (res.ok && res.data) setTrack(res.data);
      setTrackLoading(false);
    });
  };

  const toggleTrack = () => {
    if (!trackOpen) loadTrack();
    setTrackOpen((v) => !v);
  };

  return (
    <div>
      <div className="view-head">
        <h1>Economy</h1>
        <span className="sub">Mallchain's real emission schedule, supply, and treasury — live from the chain</span>
      </div>

      {error && (
        <div className="wallet-error-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--red)', fontSize: 13, flex: 1 }}>{error}</span>
          <button onClick={load} className="sec-link-btn" style={{ color: 'var(--red)' }}>Retry</button>
        </div>
      )}

      {loading && !data && (
        <div className="empty-state"><div className="es-ico">⏳</div><div className="es-t">Loading economic data…</div></div>
      )}

      {data && (
        <>
          {/* Hero panel */}
          <div className="wallet-hero">
            <div className="wallet-hero-left">
              <div className="wallet-hero-label">Mallchain economy</div>
              <div className="wallet-hero-balance">
                <div className="wallet-hero-num">{fmtMoney(data.mlcnsPriceKes, 'KES')}</div>
                <div style={{ fontSize: 14, color: 'var(--txt-3)', marginTop: 2 }}>MLCNS market price</div>
              </div>
              <div className="wallet-hero-meta">
                <span className="chip"><TrendingUp size={12} style={{ marginRight: 4 }} />Buy {fmtMoney(data.market.buyPriceKes, 'KES')}</span>
                <span className="chip"><ArrowDownRight size={12} style={{ marginRight: 4 }} />Sell {fmtMoney(data.market.sellPriceKes, 'KES')}</span>
                <span className="chip">Phase {data.emission.phase}</span>
              </div>
            </div>
            <div className="wallet-hero-right" style={{ justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <BarChart3 size={36} style={{ color: 'rgb(var(--section-accent-rgb))', marginBottom: 8 }} />
                <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>Live on-chain data</div>
                <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>Halving every 36 months</div>
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="stat-grid">
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.12)', color: 'rgb(var(--section-accent-rgb))' }}>
                <Coins size={20} />
              </div>
              <div>
                <div className="card-label">Total supply</div>
                <div className="card-value">{fmtNum(data.emission.totalSupply)} <span className="unit">MLCNS</span></div>
                <div className="tiny mt">{fmtNum(data.emission.totalAvailable)} available</div>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.08)', color: 'rgb(var(--section-accent-rgb))' }}>
                <TrendingUp size={20} />
              </div>
              <div>
                <div className="card-label">Emitted so far</div>
                <div className="card-value">{fmtNum(Number(data.emission.emittedTotal))} <span className="unit">MLCNS</span></div>
                <div className="tiny mt">{fmtNum(data.emission.remainingInSchedule)} remaining</div>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.10)', color: 'var(--red-2)' }}>
                <Flame size={20} />
              </div>
              <div>
                <div className="card-label">Burned so far</div>
                <div className="card-value" style={{ color: 'var(--red-2)' }}>{fmtNum(Number(data.emission.burnedTotal))} <span className="unit">MLCNS</span></div>
                <div className="tiny mt">{data.emission.burnRatePercent}% burn rate</div>
              </div>
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
              <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>Emission halves every 36 months across 5 phases, from 3,000,000 MLCNS/month down to 187,500 MLCNS/month.</div>
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
              <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>Mallpoints are priced at {fmtMoney(data.pointPriceKes, 'KES')} each for value-ratio purposes.</div>
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
                  <tr key={p.phase} style={p.phase === data.emission.phase ? { background: 'rgba(var(--section-accent-rgb),0.06)' } : undefined}>
                    <td>{p.phase === data.emission.phase ? <b style={{ color: 'rgb(var(--section-accent-rgb))' }}>Phase {p.phase} (current)</b> : `Phase ${p.phase}`}</td>
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
                <thead>
                  <tr><th>Wallet</th><th>Address</th><th>Status</th><th>Balance</th></tr>
                </thead>
                <tbody>
                  {Object.entries(data.wallets).map(([name, w]) => (
                    <tr key={name}>
                      <td className="muted" style={{ textTransform: 'capitalize' }}>{name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82em', letterSpacing: '-0.02em' }}>
                        {w?.address ? `${w.address.slice(0, 14)}…${w.address.slice(-6)}` : <span className="muted">—</span>}
                      </td>
                      <td>
                        {w?.locked ? (
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                            fontSize: '0.78em', fontWeight: 600,
                            background: w.locked === 'locked' ? 'rgba(220,38,38,0.10)' : 'rgba(34,197,94,0.10)',
                            color: w.locked === 'locked' ? 'var(--red-2)' : 'var(--green-2)',
                            border: `1px solid ${w.locked === 'locked' ? 'rgba(220,38,38,0.25)' : 'rgba(34,197,94,0.25)'}`
                          }}>
                            {w.locked === 'locked' ? 'Locked' : 'Unlocked'}
                          </span>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>{w?.balance == null ? <span className="muted">unavailable</span> : `${fmtNum(w.balance)} MLCNS`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Track Economics ── */}
          <div className="card mb" style={{ overflow: 'hidden' }}>
            <button
              onClick={toggleTrack}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 4px',
                color: 'inherit', fontFamily: 'inherit'
              }}
            >
              <div className="sec-title" style={{ margin: 0 }}>
                <h2><Eye size={16} style={{ marginRight: 8, verticalAlign: -2 }} />Track Economics</h2>
                <span className="sub">Live supply breakdown, wallet count &amp; liquidity</span>
              </div>
              {trackOpen ? <ChevronUp size={18} className="muted" /> : <ChevronDown size={18} className="muted" />}
            </button>

            {trackOpen && (
              <div style={{ marginTop: 12 }}>
                {trackLoading && !track && (
                  <div className="muted" style={{ padding: 16, textAlign: 'center' }}>Loading track data…</div>
                )}
                {track && (
                  <>
                    {/* Supply bar — held (red) vs unclaimed (green) */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--txt-3)', marginBottom: 6 }}>
                        <span>Supply distribution</span>
                        <span>{fmtNum(track.totalSupply)} MLCNS total</span>
                      </div>
                      <div style={{
                        height: 28, borderRadius: 14, overflow: 'hidden',
                        display: 'flex', background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.06)'
                      }}>
                        {/* Held portion — red glow */}
                        <div style={{
                          width: `${Math.min(100, Number(track.heldPercent))}%`,
                          background: 'linear-gradient(90deg, rgba(220,38,38,0.7), rgba(239,68,68,0.5))',
                          boxShadow: '0 0 16px rgba(220,38,38,0.45), inset 0 0 8px rgba(255,80,80,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff',
                          textShadow: '0 0 6px rgba(220,38,38,0.6)',
                          transition: 'width 0.6s ease'
                        }}>
                          {Number(track.heldPercent) > 8 && `${track.heldPercent}%`}
                        </div>
                        {/* Unclaimed portion — green glow */}
                        <div style={{
                          flex: 1,
                          background: 'linear-gradient(90deg, rgba(34,197,94,0.5), rgba(34,197,94,0.7))',
                          boxShadow: '0 0 16px rgba(34,197,94,0.35), inset 0 0 8px rgba(80,255,120,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff',
                          textShadow: '0 0 6px rgba(34,197,94,0.5)',
                          transition: 'width 0.6s ease'
                        }}>
                          {Number(track.unclaimedPercent) > 8 && `${track.unclaimedPercent}%`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--red-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(220,38,38,0.8)', boxShadow: '0 0 6px rgba(220,38,38,0.5)' }} />
                          Held by wallets
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--green-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(34,197,94,0.8)', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
                          Waiting on chain
                        </span>
                      </div>
                    </div>

                    {/* Stat tiles */}
                    <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                      {/* Total Mallcoins */}
                      <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                        <Coins size={20} style={{ color: 'rgb(var(--section-accent-rgb))', marginBottom: 6 }} />
                        <div className="card-label">Total Mallcoins</div>
                        <div className="card-value" style={{ fontSize: '1.15em' }}>{fmtNum(track.totalSupply)}</div>
                        <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>MLCNS</div>
                      </div>

                      {/* Held by wallets — red glow */}
                      <div className="card" style={{
                        padding: 16, textAlign: 'center',
                        borderColor: 'rgba(220,38,38,0.2)',
                        boxShadow: '0 0 20px rgba(220,38,38,0.08), inset 0 0 12px rgba(220,38,38,0.03)'
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, margin: '0 auto 6px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(220,38,38,0.12)',
                          boxShadow: '0 0 12px rgba(220,38,38,0.25)'
                        }}>
                          <Flame size={18} style={{ color: 'var(--red-2)' }} />
                        </div>
                        <div className="card-label">Held by wallets</div>
                        <div className="card-value" style={{ color: 'var(--red-2)', textShadow: '0 0 10px rgba(220,38,38,0.3)' }}>{fmtNum(track.heldByWallets)}</div>
                        <div className="tiny mt" style={{ color: 'var(--red-2)', opacity: 0.7 }}>{track.heldPercent}% of supply — gone</div>
                      </div>

                      {/* Unclaimed on chain — green glow */}
                      <div className="card" style={{
                        padding: 16, textAlign: 'center',
                        borderColor: 'rgba(34,197,94,0.2)',
                        boxShadow: '0 0 20px rgba(34,197,94,0.08), inset 0 0 12px rgba(34,197,94,0.03)'
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, margin: '0 auto 6px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(34,197,94,0.12)',
                          boxShadow: '0 0 12px rgba(34,197,94,0.25)'
                        }}>
                          <TrendingUp size={18} style={{ color: 'var(--green-2)' }} />
                        </div>
                        <div className="card-label">Waiting on chain</div>
                        <div className="card-value" style={{ color: 'var(--green-2)', textShadow: '0 0 10px rgba(34,197,94,0.3)' }}>{fmtNum(track.unclaimedOnChain)}</div>
                        <div className="tiny mt" style={{ color: 'var(--green-2)', opacity: 0.7 }}>{track.unclaimedPercent}% — available to own</div>
                      </div>

                      {/* Wallets created */}
                      <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, margin: '0 auto 6px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(var(--section-accent-rgb),0.10)'
                        }}>
                          <Users size={18} style={{ color: 'rgb(var(--section-accent-rgb))' }} />
                        </div>
                        <div className="card-label">Wallets created</div>
                        <div className="card-value" style={{ fontSize: '1.3em' }}>{fmtNum(track.totalWallets)}</div>
                        <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>ever on Mallchain</div>
                      </div>

                      {/* Liquidity pool fiat */}
                      <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, margin: '0 auto 6px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(59,130,246,0.10)'
                        }}>
                          <Droplets size={18} style={{ color: '#3b82f6' }} />
                        </div>
                        <div className="card-label">Liquidity pool</div>
                        <div className="card-value" style={{ fontSize: '1.15em', color: '#3b82f6' }}>
                          {track.liquidityPoolKes > 0 ? fmtMoney(track.liquidityPoolKes, 'KES') : '—'}
                        </div>
                        <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>
                          {track.liquidityPool?.name || 'MLCNS/KES'} fiat value
                        </div>
                      </div>

                      {/* Burned */}
                      <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, margin: '0 auto 6px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(220,38,38,0.08)'
                        }}>
                          <Flame size={18} style={{ color: 'var(--red-2)', opacity: 0.7 }} />
                        </div>
                        <div className="card-label">Burned</div>
                        <div className="card-value" style={{ fontSize: '1.15em', color: 'var(--red-2)', opacity: 0.8 }}>{fmtNum(track.burnedTotal)}</div>
                        <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>permanently destroyed</div>
                      </div>
                    </div>

                    {/* Emitted vs total progress */}
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--txt-3)', marginBottom: 4 }}>
                        <span>Emission progress</span>
                        <span>{fmtNum(track.emittedTotal)} / {fmtNum(track.totalSupply)} emitted</span>
                      </div>
                      <div style={{
                        height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(100, track.totalSupply > 0 ? (track.emittedTotal / track.totalSupply) * 100 : 0)}%`,
                          borderRadius: 4,
                          background: 'linear-gradient(90deg, rgb(var(--section-accent-rgb)), rgba(var(--section-accent-rgb),0.6))',
                          boxShadow: '0 0 8px rgba(var(--section-accent-rgb),0.3)',
                          transition: 'width 0.6s ease'
                        }} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="sec-title"><h2><Wallet size={16} style={{ marginRight: 8, verticalAlign: -2 }} />Your holdings</h2></div>
            {!walletAddress ? (
              <div className="muted" style={{ padding: 12 }}>Connect a wallet to see your personal holdings here.</div>
            ) : holdingsLoading && !holdings ? (
              <div className="muted" style={{ padding: 12 }}>Loading your holdings…</div>
            ) : holdings ? (
              <table className="tbl">
                <tbody>
                  <tr><td className="muted">MLCNS</td><td style={{ fontWeight: 600 }}>{fmtNum(holdings.mlcns)}</td></tr>
                  <tr><td className="muted">Mallpoints</td><td style={{ fontWeight: 600 }}>{fmtNum(holdings.mallpoints)}</td></tr>
                  <tr><td className="muted">Estimated value</td><td style={{ fontWeight: 700, color: 'rgb(var(--section-accent-rgb))' }}>{fmtMoney(holdings.estimatedKesValue, 'KES')}</td></tr>
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

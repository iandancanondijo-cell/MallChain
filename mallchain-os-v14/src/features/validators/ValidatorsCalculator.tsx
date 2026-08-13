import { useMemo, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, ScoreRing, BarChart, toast } from '../../components/ui';

/** Validator Rewards Calculator — projection + break-even + export/share.
 *  Full v13 parity: live inputs, strike ladder projection, presets,
 *  Copy Summary / Download CSV / Share, query-param pre-fill. */
export default function ValidatorsCalculator({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const V = st.validators;

  // query-param pre-fill (?r=50&d=26&a=92&c=85&p=1&s=1)
  const qp = useMemo(() => {
    const q = new URLSearchParams(window.location.hash.split('?')[1] || '');
    return {
      r: q.get('r') ? +q.get('r')! : undefined,
      d: q.get('d') ? +q.get('d')! : undefined,
      a: q.get('a') ? +q.get('a')! : undefined,
      c: q.get('c') ? +q.get('c')! : undefined,
      p: q.get('p') ? q.get('p') === '1' : undefined,
      s: q.get('s') ? q.get('s') === '1' : undefined,
    };
  }, []);

  const saved = V.calculator;
  const [mode, setMode] = useState<'projection' | 'breakeven'>(saved.mode);
  const [reviews, setReviews] = useState(qp.r ?? saved.inputs.reviews);
  const [days, setDays] = useState(qp.d ?? saved.inputs.days);
  const [acc, setAcc] = useState(qp.a ?? saved.inputs.acc);
  const [cons, setCons] = useState(qp.c ?? saved.inputs.cons);
  const [penalty, setPenalty] = useState(qp.p ?? saved.inputs.penalty);
  const [strikeOn, setStrikeOn] = useState(qp.s ?? saved.inputs.strike);
  const [stake, setStake] = useState(saved.stake);

  const liveAcc = st.validators.reputation.accuracy || acc;

  const calc = useMemo(() => {
    const total = reviews * days;
    const matched = total * (cons / 100);
    const gross = matched * 0.8;
    const wrong = total * ((100 - liveAcc) / 100);
    const tier = strikeOn ? Math.min(5, Math.floor(wrong / 5)) : 0;
    const mult = tier >= 2 ? 0.5 : 1;
    const slash = tier >= 4 ? stake * 0.25 : 0;
    const net = gross * mult - slash;
    const dailyAvg = net / Math.max(days, 1);
    const weeklyAvg = dailyAvg * 7;
    const repDrop = wrong / Math.max(total, 1) * 100;
    const repEnd = Math.max(0, Math.min(100, liveAcc - repDrop));
    const effective = gross > 0 ? (net / gross) * 100 : 0;
    return { total, matched, gross, wrong, tier, mult, slash, net, dailyAvg, weeklyAvg, repEnd, effective };
  }, [reviews, days, liveAcc, cons, penalty, strikeOn, stake]);

  const persist = (next: Partial<typeof saved.inputs>) => {
    Object.assign(V.calculator.inputs, next);
    V.calculator.mode = mode;
    V.calculator.stake = stake;
    V.calculator.result = { gross: calc.gross, net: calc.net, mult: calc.mult, tier: calc.tier, repEnd: calc.repEnd, effective: calc.effective };
    store.commit();
  };

  const applyPreset = (r: number, d = 26) => {
    setReviews(r); setDays(d); persist({ reviews: r, days: d });
    toast(`Preset loaded: ${r}/day`);
  };

  const tiers = [
    { min: 5, label: 'Tier 1 — Warning', cls: 'gold' },
    { min: 10, label: 'Tier 2 — Reduced rewards (0.5×)', cls: 'gold' },
    { min: 15, label: 'Tier 3 — Suspension', cls: 'gold' },
    { min: 20, label: 'Tier 4 — Stake slash 25%', cls: 'red' },
    { min: 25, label: 'Tier 5 — Permanent ban', cls: 'red' },
  ];
  const projectedTier = tiers.find((t) => calc.wrong >= t.min);

  const summary = [
    `Reviews/day: ${reviews} | Days: ${days} | Accuracy: ${liveAcc}% | Consensus: ${cons}%`,
    `Matched: ${calc.matched.toFixed(0)}/mo | Gross: ${calc.gross.toFixed(2)} MALL | Penalties: ${penalty ? `${calc.wrong.toFixed(0)} wrong votes` : 'off'}`,
    `Strike tier: ${calc.tier > 0 ? tiers.find((t) => calc.wrong >= t.min)?.label || '—' : 'none'} | Multiplier: ${calc.mult}× | Slash: ${calc.slash.toFixed(0)} MALL`,
    `Net projected: ${calc.net.toFixed(2)} MALL/mo | Effective payout: ${calc.effective.toFixed(0)}%`,
    `Projection model: 0.8 MALL per consensus-matched review, 80% consensus threshold, strike ladder every 5th incorrect vote, 0.5× multiplier from strike tier 2, 25% stake slash at tier 4. — Mallchain Validator Rewards Calculator`,
  ].join('\n');

  const copySummary = async () => {
    try { await navigator.clipboard.writeText(summary); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = summary; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast('Summary copied to clipboard ✓');
  };

  const downloadCsv = () => {
    const rows = [['metric', 'value', 'unit', 'notes'].join(',')];
    const add = (m: string, v: number | string, u = '', n = '') => rows.push([m, String(v), u, n].join(','));
    add('reviewsPerDay', reviews, 'reviews'); add('workingDays', days, 'days'); add('accuracy', liveAcc, '%'); add('consensusMatchRate', cons, '%');
    add('totalReviews', calc.total, 'reviews'); add('matchedReviews', Math.round(calc.matched), 'reviews'); add('grossMALL', calc.gross.toFixed(2), 'MALL');
    add('penaltyMALL', penalty ? calc.wrong.toFixed(0) : 0, 'wrong votes'); add('strikeTier', calc.tier, ''); add('multiplier', calc.mult, 'x');
    add('stakeSlash', calc.slash.toFixed(2), 'MALL'); add('netMALL', calc.net.toFixed(2), 'MALL'); add('dailyAvg', calc.dailyAvg.toFixed(2), 'MALL');
    add('weeklyAvg', calc.weeklyAvg.toFixed(2), 'MALL'); add('reputationEnd', calc.repEnd.toFixed(1), '%'); add('effectivePayoutRate', calc.effective.toFixed(1), '%');
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mallchain-validator-rewards-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('CSV downloaded ✓');
  };

  const share = async () => {
    const link = `#/validators/calculator?r=${reviews}&d=${days}&a=${liveAcc}&c=${cons}&p=${penalty ? 1 : 0}&s=${strikeOn ? 1 : 0}`;
    const text = `My Mallchain validator projection: ${calc.gross.toFixed(0)} gross → ${calc.net.toFixed(0)} MALL net/mo (${reviews}/day, ${liveAcc}% acc) — ${summary.split('\n')[4]}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try { await nav.share({ text, url: link }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(link); }
    catch {
      const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast('Share link copied ✓');
  };

  const be = (() => {
    const net = calc.net;
    const daysToBE = net > 0 ? Math.ceil((stake / (net / 30))) : Infinity;
    const monthsToBE = net > 0 ? Math.ceil(stake / net) : Infinity;
    const date = new Date(Date.now() + daysToBE * 86400e3);
    const pct1 = net > 0 ? (net / stake) * 100 : 0;
    const pct3 = net > 0 ? (net * 3 / stake) * 100 : 0;
    const pct6 = net > 0 ? (net * 6 / stake) * 100 : 0;
    const cumulative = Array.from({ length: 12 }, (_, i) => Math.round(net * (i + 1) * 100) / 100);
    const beMonth = cumulative.findIndex((v) => v >= stake) + 1;
    return { daysToBE, monthsToBE, date, pct1, pct3, pct6, cumulative, beMonth };
  })();

  const lastMonth = st.validators.weekly.length ? st.validators.weekly[st.validators.weekly.length - 1].reward : 0;

  return (
    <div>
      <div className="view-head">
        <h1>Validator Rewards Calculator</h1>
        <span className="sub">Project monthly MALL earnings from review volume & accuracy</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate('/validators')}>Learn more ›</button>
      </div>

      <div className="mc-subnav" style={{ marginBottom: 16 }}>
        <button className={mode === 'projection' ? 'on' : ''} onClick={() => { setMode('projection'); persist({}); }}>Projection</button>
        <button className={mode === 'breakeven' ? 'on' : ''} onClick={() => { setMode('breakeven'); persist({}); }}>Break-even</button>
      </div>

      <div className="calc-grid">
        {/* inputs */}
        <div className="card">
          <div className="sec-title"><h2>Inputs</h2><span className="sub">live-updating</span></div>
          <div className="field">
            <label>Reviews per day — <b className="gold">{reviews}</b></label>
            <input type="range" min={1} max={200} value={reviews} onChange={(e) => { setReviews(+e.target.value); persist({ reviews: +e.target.value }); }} style={{ width: '100%', accentColor: 'var(--gold)' }} />
          </div>
          <div className="field">
            <label>Working days / month — <b className="gold">{days}</b></label>
            <input type="range" min={1} max={31} value={days} onChange={(e) => { setDays(+e.target.value); persist({ days: +e.target.value }); }} style={{ width: '100%', accentColor: 'var(--gold)' }} />
          </div>
          <div className="field">
            <label>Accuracy — <b className="gold">{liveAcc}%</b> <span className="tiny">(live from store)</span></label>
            <input type="range" min={0} max={100} value={liveAcc} onChange={(e) => { setAcc(+e.target.value); persist({ acc: +e.target.value }); }} style={{ width: '100%', accentColor: 'var(--gold)' }} />
          </div>
          <div className="field">
            <label>Consensus match rate — <b className="gold">{cons}%</b></label>
            <input type="range" min={0} max={100} value={cons} onChange={(e) => { setCons(+e.target.value); persist({ cons: +e.target.value }); }} style={{ width: '100%', accentColor: 'var(--gold)' }} />
          </div>
          <label className="check" style={{ marginBottom: 6 }}><input type="checkbox" checked={penalty} onChange={(e) => { setPenalty(e.target.checked); persist({ penalty: e.target.checked }); }} /> Include wrong-vote penalties</label>
          <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" checked={strikeOn} onChange={(e) => { setStrikeOn(e.target.checked); persist({ strike: e.target.checked }); }} /> Apply strike multiplier {calc.tier >= 2 && <span className="chip red" style={{ marginLeft: 6 }}>Strike Tier {calc.tier} active · 0.5×</span>}</label>
          {mode === 'breakeven' && (
            <div className="field"><label>Stake invested — <b className="gold">{stake} MALL</b></label><input type="range" min={0} max={2000} step={50} value={stake} onChange={(e) => { setStake(+e.target.value); V.calculator.stake = +e.target.value; store.commit(); }} style={{ width: '100%', accentColor: 'var(--gold)' }} /></div>
          )}
          <div className="preset-row">
            <span className="tiny">Presets:</span>
            {[['Casual', 10], ['Standard', 20], ['Pro', 50], ['Hardcore', 100]].map(([l, r]) => (
              <button key={l as string} className={'btn btn-ghost btn-sm' + (reviews === r ? ' gold' : '')} onClick={() => applyPreset(r as number)}>{l as string} ({r}/day)</button>
            ))}
          </div>
        </div>

        {/* outputs */}
        <div>
          <div className="calc-toolbar">
            <button className="btn btn-ghost btn-sm" onClick={copySummary}>📋 Copy Summary</button>
            <button className="btn btn-ghost btn-sm" onClick={downloadCsv}>⬇ Download CSV</button>
            <button className="btn btn-ghost btn-sm" onClick={share}>🔗 Share</button>
          </div>
          {mode === 'projection' ? (
            <>
              <div className="calc-hero-row">
                <div className="card"><div className="card-label">Gross monthly</div><div className="card-value">{calc.gross.toFixed(1)} <span className="unit">MALL</span></div><div className="card-sub">{Math.round(calc.matched)} matched reviews × 0.8</div></div>
                <div className="card"><div className="card-label">Penalties & adjustments</div><div className="card-value down">−{calc.slash > 0 ? calc.slash.toFixed(1) : calc.tier >= 2 ? (calc.gross * 0.5).toFixed(1) : '0'} <span className="unit">MALL</span></div><div className="card-sub">{calc.tier >= 4 ? `stake slash 25% (${calc.slash.toFixed(0)})` : calc.tier >= 2 ? '0.5× reward multiplier' : `${calc.wrong.toFixed(0)} wrong votes (rep only)`}</div></div>
                <div className="card" style={{ borderColor: 'rgba(243,186,47,.4)' }}><div className="card-label">Net monthly</div><div className="card-value" style={{ color: 'var(--gold)' }}>{calc.net.toFixed(1)} <span className="unit">MALL</span></div><div className="card-sub">daily ≈ {calc.dailyAvg.toFixed(1)} · weekly ≈ {calc.weeklyAvg.toFixed(1)}</div></div>
              </div>
              <div className="card">
                <div className="sec-title"><h2>Breakdown</h2></div>
                <table className="tbl calc-tbl">
                  <thead><tr><th>Metric</th><th>Formula</th><th className="num">Value</th></tr></thead>
                  <tbody>
                    <tr><td>Total reviews</td><td className="muted">reviews × days</td><td className="num">{calc.total.toLocaleString()}</td></tr>
                    <tr><td>Matched reviews</td><td className="muted">total × consensus</td><td className="num">{Math.round(calc.matched).toLocaleString()}</td></tr>
                    <tr><td>Gross reward</td><td className="muted">matched × 0.8</td><td className="num">{calc.gross.toFixed(2)} MALL</td></tr>
                    <tr><td>Wrong votes</td><td className="muted">total × (1 − acc)</td><td className="num">{calc.wrong.toFixed(0)}</td></tr>
                    <tr><td>Strike tier</td><td className="muted">every 5th incorrect</td><td className="num">{calc.tier > 0 ? <span className={'mc-badge ' + (calc.tier >= 4 ? 'b-rejected' : 'b-pending')}>{tiers.find((t) => calc.wrong >= t.min)?.label || `Tier ${calc.tier}`}</span> : <span className="chip green">none</span>}</td></tr>
                    <tr><td>Multiplier</td><td className="muted">tier ≥ 2 → 0.5×</td><td className="num">{calc.mult}×</td></tr>
                    <tr><td>Stake slash</td><td className="muted">tier ≥ 4 → 25% of {stake}</td><td className="num">{calc.slash.toFixed(2)} MALL</td></tr>
                    <tr><td><b>Net monthly</b></td><td className="muted">gross × mult − slash</td><td className="num"><b className="gold">{calc.net.toFixed(2)} MALL</b></td></tr>
                    <tr><td>Reputation drift</td><td className="muted">start {liveAcc}% → end</td><td className="num">{calc.repEnd.toFixed(1)}%</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="grid-2 mt">
                <div className="card">
                  <div className="sec-title"><h2>Projected vs last month</h2></div>
                  <BarChart data={[calc.net, lastMonth]} labels={['Projected', 'Last month']} height={130} />
                </div>
                <div className="card">
                  <div className="sec-title"><h2>Effective payout rate</h2></div>
                  <div className="row"><ScoreRing pct={Math.round(calc.effective)} size={84} label="net/gross" /><div><div style={{ fontWeight: 800, fontSize: 17 }}>{calc.effective.toFixed(0)}%</div><div className="tiny">of gross retained after penalties</div></div></div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="calc-hero-row">
                <div className="card"><div className="card-label">Stake invested</div><div className="card-value">{stake} <span className="unit">MALL</span></div><div className="card-sub">locked (from store)</div></div>
                <div className="card" style={{ borderColor: 'rgba(243,186,47,.4)' }}>
                  <div className="card-label">Days to break-even</div>
                  <div className="card-value" style={{ color: be.daysToBE === Infinity ? 'var(--red-2)' : 'var(--gold)' }}>{be.daysToBE === Infinity ? 'Never' : `~${be.daysToBE}`} <span className="unit">days</span></div>
                  <div className="card-sub">{be.monthsToBE === Infinity ? 'net ≤ 0 — tune accuracy/volume' : `≈ ${be.monthsToBE} month(s) · ${be.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}</div>
                </div>
                <div className="card"><div className="card-label">Net monthly</div><div className="card-value">{calc.net.toFixed(1)} <span className="unit">MALL</span></div><div className="card-sub">same model as projection</div></div>
              </div>
              {be.daysToBE !== Infinity && (
                <div className="card mb">
                  <div className="sec-title"><h2>Stake recovery</h2></div>
                  {[['1 month', be.pct1], ['3 months', be.pct3], ['6 months', be.pct6]].map(([l, p]) => (
                    <div key={l as string} className="list-row">
                      <div className="grow"><div className="t">{l}</div><div className="bar mt"><i style={{ width: Math.min(100, p as number) + '%' }} /></div></div>
                      <b className="gold">{Math.min(100, p as number).toFixed(0)}%</b>
                    </div>
                  ))}
                  <div className="sec-title mt"><h2>12-month cumulative vs stake</h2><span className="chip gold">break-even month {be.beMonth > 0 ? `M${be.beMonth}` : '—'}</span></div>
                  <div className="chart-bars" style={{ height: 120 }}>
                    {be.cumulative.map((v, i) => (
                      <div key={i} className="chart-bar" style={{ height: `${Math.min(100, (v / Math.max(stake, 1)) * 100)}%`, background: i + 1 === be.beMonth ? 'linear-gradient(180deg,var(--gold),var(--gold-2))' : 'linear-gradient(180deg,var(--green),rgba(34,197,94,.25))' }}>
                        <span className="tip">M{i + 1}: {v.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="chart-x">{be.cumulative.map((_, i) => <span key={i}>M{i + 1}</span>)}</div>
                </div>
              )}
              <div className="card">
                <div className="sec-title"><h2>Insight</h2></div>
                <p style={{ fontSize: 13, color: 'var(--txt-2)' }}>
                  {be.daysToBE === Infinity
                    ? 'At your current settings your net is ≤ 0 — tune accuracy or volume to recover your stake.'
                    : <>At your current settings you recover <b className="gold">{be.pct1.toFixed(0)}%</b> of your {stake} MALL stake in the first month and fully break even in <b className="gold">~{be.monthsToBE} month(s)</b>.</>}
                </p>
              </div>
            </>
          )}
          <div className="tiny" style={{ marginTop: 10 }}>Projection model: 0.8 MALL per consensus-matched review · 80% consensus threshold · strike ladder every 5th incorrect vote · 0.5× multiplier from strike tier 2 · 25% stake slash at tier 4. <a onClick={() => navigate('/validators')} style={{ cursor: 'pointer' }}>Learn more →</a></div>
        </div>
      </div>
    </div>
  );
}

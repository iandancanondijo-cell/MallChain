import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';

/** Apply — data-driven eligibility check + application form validation. */
export default function ValidatorsApply({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const V = st.validators;
  const [form, setForm] = useState({ name: '', country: 'Kenya', occ: '', net: '4h/day', hours: 5, exp: 0 });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const eligible = st.balances.MALL >= 500 && (V.eligibility?.eligible ?? false);
  const checks = V.eligibility?.checks || [
    { ok: st.balances.MALL >= 500, label: 'Minimum stake — 500 MALL available' },
    { ok: true, label: 'Verified identity — KYC Level 2' },
    { ok: true, label: 'Wallet age — older than 30 days' },
    { ok: true, label: 'Reputation — above 90' },
    { ok: true, label: 'No fraud record' },
  ];

  const runCheck = () => {
    V.eligibility = { checks, eligible: checks.every((c) => c.ok), ts: new Date().toISOString() };
    store.commit();
    toast(checks.every((c) => c.ok) ? 'You are eligible — continue with your application' : 'Eligibility failed — review the checks below', checks.every((c) => c.ok));
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Full name is required';
    if (!form.occ.trim()) e.occ = 'Occupation is required';
    if (!form.hours || form.hours < 1) e.hours = 'Minimum 1 hour per day';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setTimeout(() => {
      V.application = { ...form, wallet: st.wallet.address, ts: new Date().toISOString() };
      store.commit();
      setBusy(false);
      toast('Application submitted — next: stake 500 MALL');
      navigate('/validators/stake');
    }, 800);
  };

  return (
    <div>
      <div className="view-head"><h1>Apply to become a Validator</h1><span className="sub">Step 1–2 of 13</span></div>

      <div className="card mb">
        <div className="sec-title"><h2>Eligibility check</h2><span className="sub">data-driven from your wallet & store</span></div>
        {checks.map((c, i) => (
          <div key={i} className="list-row">
            <span className={c.ok ? 'green' : 'red'} style={{ fontWeight: 800 }}>{c.ok ? '✓' : '✕'}</span>
            <div className="grow"><div className="t">{c.label}</div></div>
          </div>
        ))}
        <div className="row mt">
          <button className="btn btn-ghost gold" onClick={runCheck}>Re-run eligibility check</button>
          {!eligible && <span className="chip red">Not eligible — stake 500 MALL first</span>}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="sec-title"><h2>Application form</h2></div>
        <div className="field"><label>Full name</label><input className={'input' + (errs.name ? ' err' : '')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kevin Otieno" />{errs.name && <div className="hint red">{errs.name}</div>}</div>
        <div className="grid-2">
          <div className="field"><label>Country</label>
            <select className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
              {['Kenya', 'Nigeria', 'South Africa', 'Ghana', 'Uganda', 'Tanzania', 'Ethiopia', 'Other'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field"><label>Occupation</label><input className={'input' + (errs.occ ? ' err' : '')} value={form.occ} onChange={(e) => setForm({ ...form, occ: e.target.value })} placeholder="e.g. Software Engineer" />{errs.occ && <div className="hint red">{errs.occ}</div>}</div>
        </div>
        <div className="grid-2">
          <div className="field"><label>Availability</label>
            <select className="input" value={form.net} onChange={(e) => setForm({ ...form, net: e.target.value })}>
              {['2h/day', '4h/day', '6h/day', '8h/day', 'Full-time'].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="field"><label>Hours per day: {form.hours}</label><input type="range" min={1} max={24} value={form.hours} onChange={(e) => setForm({ ...form, hours: +e.target.value })} style={{ width: '100%', accentColor: 'var(--gold)' }} />{errs.hours && <div className="hint red">{errs.hours}</div>}</div>
        </div>
        <div className="field"><label>Years of Web3 / moderation experience</label><input className="input" type="number" min={0} max={40} value={form.exp} onChange={(e) => setForm({ ...form, exp: +e.target.value })} /></div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/validators')}>← Back</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !eligible}>{busy && <span className="spin" />} Submit application →</button>
        </div>
        {!eligible && <div className="tiny">Complete eligibility first — you need 500 MALL to stake.</div>}
      </div>
    </div>
  );
}

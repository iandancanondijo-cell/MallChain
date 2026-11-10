import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { validatorsApi } from '../../services/validatorsApi';

/** Real validator application — matches the backend ValidatorApplication schema (models/ValidatorApplication.js). */
export default function ValidatorsApply({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [form, setForm] = useState({
    validatorAddress: '',
    moniker: '',
    website: '',
    details: '',
    selfDelegationAmount: '',
    denom: 'stake',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!address) e.address = 'Connect a wallet first';
    if (!form.moniker.trim()) e.moniker = 'Moniker is required';
    setErrs(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    const result = await validatorsApi.apply({
      applicantAddress: address,
      validatorAddress: form.validatorAddress || undefined,
      moniker: form.moniker,
      website: form.website || undefined,
      details: form.details || undefined,
      selfDelegationAmount: form.selfDelegationAmount || undefined,
      denom: form.denom,
    });
    setBusy(false);

    if (result.ok) {
      toast('Application submitted — track its status on your profile page');
      navigate('/validators/profile');
    } else {
      toast(result.error || 'Application failed', false);
    }
  };

  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">Apply to become a Validator</h1><span className="sub">Submitted for admin review — see My Application for status</span></div>

      <div className="card card-glow bg-gradient-card" style={{ maxWidth: 620, marginBottom: 14 }}>
        <div className="sec-title"><h2>What actually makes you a validator</h2></div>
        <div className="tiny muted">
          Two separate things, and neither one alone is enough:{' '}
          <b>allowed</b> — an admin approves this application, which is what puts your moniker in the pool of accounts that may hold review duties
          (routes/taskAssignment.js checks it against your reviewer bond before assigning or accepting any vote); and <b>staked</b> — you sign a
          validator self-bond from your own wallet on My Application, which is the only thing that makes the chain count you as a validator at all.
          This form grants nothing by itself: it is a request for the first half.
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>
          A stake with no approved application gets you no tasks to review, and an approved application with no stake never reaches the validator
          leaderboard, which lists only bonded validators. Your application status is tracked on <button onClick={() => navigate('/validators/profile')} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>My Application</button>.
        </div>
      </div>

      <div className="card card-glow bg-gradient-card" style={{ maxWidth: 620 }}>
        <div className="sec-title"><h2>Application form</h2></div>
        {!address && <div className="tiny red" style={{ marginBottom: 10 }}>Connect a wallet before applying.</div>}

        <div className="field">
          <label>Applicant address</label>
          <input className="input" value={address || ''} disabled placeholder="Connect a wallet" />
        </div>
        <div className="field">
          <label>Moniker</label>
          <input className={'input' + (errs.moniker ? ' err' : '')} value={form.moniker} onChange={(e) => setForm({ ...form, moniker: e.target.value })} placeholder="e.g. Nairobi Node" />
          {errs.moniker && <div className="hint red">{errs.moniker}</div>}
        </div>
        <div className="grid-2">
          <div className="field"><label>Validator address (optional)</label><input className="input" value={form.validatorAddress} onChange={(e) => setForm({ ...form, validatorAddress: e.target.value })} placeholder="mallvaloper1..." /></div>
          <div className="field"><label>Self-delegation amount</label><input className="input" value={form.selfDelegationAmount} onChange={(e) => setForm({ ...form, selfDelegationAmount: e.target.value })} placeholder="e.g. 500" /></div>
        </div>
        <div className="field"><label>Website (optional)</label><input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></div>
        <div className="field"><label>Details (optional)</label><textarea className="input" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Why you'd run a Mallchain validator" /></div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/validators')}>← Back</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !address}>{busy && <span className="spin" />} Submit application →</button>
        </div>
      </div>
    </div>
  );
}

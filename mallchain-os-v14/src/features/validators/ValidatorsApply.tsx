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
      <div className="view-head"><h1>Apply to become a Validator</h1><span className="sub">Submitted for admin review — see My Application for status</span></div>

      <div className="card" style={{ maxWidth: 620 }}>
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

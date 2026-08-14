import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion } from '../../components/ui';
import { validatorsApi, type ValidatorApplication } from '../../services/validatorsApi';

/** My validator application status — real GET /api/validators/my-application lookup. */
export default function ValidatorsProfile() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [application, setApplication] = useState<ValidatorApplication | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    const result = await validatorsApi.myApplication(address);
    if (result.ok && result.data) {
      setApplication(result.data.application);
    } else {
      setError(result.error || 'Failed to load application status');
    }
    setLoading(false);
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  if (!address) {
    return (
      <div>
        <div className="view-head"><h1>My Application</h1></div>
        <div className="card"><div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>Connect a wallet to view your validator application.</div></div>
      </div>
    );
  }

  const statusColor = application?.status === 'approved' ? 'var(--green)' : application?.status === 'rejected' ? 'var(--red-2)' : 'var(--gold)';

  return (
    <div>
      <div className="view-head"><h1>My Application</h1><span className="sub">{address}</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      <div className="card">
        {loading && application === undefined && <div className="tiny">Loading…</div>}
        {!loading && application === null && (
          <div className="empty-state"><div className="es-ico">📝</div><div className="es-t">No application on file</div><div className="es-m">Apply from the Validators home page.</div></div>
        )}
        {application && (
          <table className="tbl">
            <tbody>
              <tr><td className="muted">Status</td><td className="num"><b style={{ color: statusColor }}>{application.status}</b></td></tr>
              <tr><td className="muted">Moniker</td><td className="num">{application.moniker}</td></tr>
              <tr><td className="muted">Validator address</td><td className="num">{application.validatorAddress || '—'}</td></tr>
              <tr><td className="muted">Self-delegation</td><td className="num">{application.selfDelegationAmount} {application.denom}</td></tr>
              <tr><td className="muted">Submitted</td><td className="num">{new Date(application.submittedAt).toLocaleString()}</td></tr>
              {application.reviewedAt && <tr><td className="muted">Reviewed</td><td className="num">{new Date(application.reviewedAt).toLocaleString()} by {application.reviewer}</td></tr>}
              {application.reviewNotes && <tr><td className="muted">Notes</td><td className="num">{application.reviewNotes}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

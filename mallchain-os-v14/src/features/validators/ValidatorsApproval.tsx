import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';

/** Approval queue — 24h countdown until active. */
export default function ValidatorsApproval({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const V = st.validators;
  const [approved, setApproved] = useState(V.approval?.approved ?? false);

  const endTs = V.approval?.ends ? new Date(V.approval.ends).getTime() : Date.now() + 24 * 3600e3;
  const leftMs = Math.max(0, endTs - Date.now());
  const hours = Math.floor(leftMs / 3600e3);
  const mins = Math.floor((leftMs % 3600e3) / 60e3);

  const simulate = () => {
    setApproved(true);
    V.approval = { start: new Date(Date.now() - 1000).toISOString(), ends: new Date(Date.now() + 3600e3).toISOString(), approved: true };
    store.commit();
    toast('Approved! You are now an active validator');
    navigate('/validators/dashboard');
  };

  return (
    <div>
      <div className="view-head"><h1>Approval queue</h1><span className="sub">Step 5 of 13</span></div>
      <div className="card" style={{ maxWidth: 560 }}>
        {approved ? (
          <>
            <div className="sec-title"><h2>✓ Approved — you are live</h2></div>
            <div className="muted mb">You're now an active Proof Validator. Review submissions from the dashboard.</div>
            <button className="btn btn-primary btn-block" onClick={() => navigate('/validators/dashboard')}>Open Validator Dashboard →</button>
          </>
        ) : (
          <>
            <div className="sec-title"><h2>In the approval queue</h2><span className="chip gold">{hours}h {mins}m remaining</span></div>
            <div className="mc-progress" style={{ height: 10, margin: '12px 0' }}>
              <div style={{ width: `${Math.min(100, Math.max(5, ((24 * 3600e3 - leftMs) / (24 * 3600e3)) * 100))}%` }} />
            </div>
            <div className="muted mb">Your application is being reviewed by the Mallchain trust committee. Typical wait: up to 24 hours.</div>
            <button className="btn btn-ghost gold btn-block" onClick={simulate}>Simulate committee approval (demo)</button>
          </>
        )}
      </div>
    </div>
  );
}

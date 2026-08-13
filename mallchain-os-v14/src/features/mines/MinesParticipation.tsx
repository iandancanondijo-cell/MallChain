import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, StatusChip, Stepper, Modal, toast } from '../../components/ui';

/** Participation — my tasks with a resume-stepper + appeal. */
export default function MinesParticipation() {
  useStoreVersion();
  const st = store.state;
  const [resume, setResume] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const parts = st.mines.participations;
  const campOf = (cid: string) => st.mines.campaigns.find((c) => c.id === cid);
  const steps = ['Open platform', 'Complete Step 1', 'Upload Screenshot', 'Submit', 'Pending Validator Review'];

  const doStep = (p: { id: string }) => {
    const part = parts.find((x) => x.id === p.id);
    if (!part) return;
    if (part.status === 'inprogress' && part.steps < 4) {
      part.steps += 1;
      store.commit();
    } else if (part.status === 'inprogress' && part.steps >= 4) {
      part.status = 'pending';
      part.steps = 5;
      st.mines.submissions.unshift({
        id: '#44' + (9001 + st.mines.submissions.length), pid: part.id, campaign: part.campaign, wallet: st.wallet.address || '0x7A9f…D6f8',
        ai: 96, human: 0, need: 18, status: 'voting', reason: null, reward: part.reward, plat: campOf(part.campaign)?.platform || '',
      });
      store.commit();
      toast('Submitted for validation — awaiting validator consensus');
      setResume(null);
    }
  };

  return (
    <div>
      <div className="view-head"><h1>My Tasks</h1><span className="sub">{parts.length} participations</span></div>
      {parts.length === 0 && (
        <div className="empty-state"><div className="es-ico">🎯</div><div className="es-t">No active participations</div><div className="es-m">Discover campaigns and start earning Mallpoints.</div></div>
      )}
      {parts.map((p) => {
        const c = campOf(p.campaign);
        const stepsDone = p.status === 'pending' || p.status === 'approved' || p.status === 'rejected' ? 5 : p.steps || 0;
        return (
          <div key={p.id} className="card mb">
            <div className="row">
              <div className="grow"><b>{c?.name || p.campaign}</b> <span className="muted">· {p.ts}</span></div>
              <StatusChip status={p.status} />
              <b className="gold">+{p.reward} MLPTS</b>
            </div>
            <Stepper steps={steps} current={stepsDone} />
            {p.status === 'inprogress' && <button className="btn btn-ghost gold btn-sm" onClick={() => { setResume(p.id); setStep(stepsDone); }}>Continue steps →</button>}
            {p.status === 'rejected' && p.appealAvailable !== false && (
              <button className="btn btn-primary btn-sm" style={{ background: 'var(--gold)', color: '#16181d' }} onClick={() => {
                p.status = 'pending'; p.steps = 5; p.appealAvailable = false;
                st.mines.submissions.unshift({ id: '#44' + (9001 + st.mines.submissions.length), pid: p.id, campaign: p.campaign, wallet: st.wallet.address || '0x7A9f…D6f8', ai: 97, human: 0, need: 18, status: 'voting', reason: null, reward: p.reward, plat: c?.platform || '' });
                store.commit();
                toast('Appeal resubmitted — back in the validator queue');
              }}>Appeal / Resubmit</button>
            )}
            {p.status === 'approved' && <span className="chip green">✓ {p.reward} MLPTS credited</span>}
          </div>
        );
      })}

      {resume && (() => {
        const p = parts.find((x) => x.id === resume);
        if (!p) return null;
        const c = campOf(p.campaign);
        return (
          <Modal title={`Progress — ${c?.name || ''}`} onClose={() => setResume(null)}>
            <Stepper steps={steps} current={step} />
            <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{step + 1}. {steps[step]}</div>
            {step < 4 ? (
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setResume(null)}>Close</button>
                <button className="btn btn-primary" onClick={() => { if (step < 4) { if (step === 2) toast('Screenshot uploaded'); setStep(step + 1); if (step >= 3) doStep(p); } }}>Complete step →</button>
              </div>
            ) : (
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={() => doStep(p)}>Submit for Validation</button>
              </div>
            )}
          </Modal>
        );
      })()}
    </div>
  );
}

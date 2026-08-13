import { store } from '../../store/store';
import { useStoreVersion, StatusChip } from '../../components/ui';

/** Validator Queue — submissions awaiting review with appeal state. */
export default function MinesValidatorQueue() {
  useStoreVersion();
  const st = store.state;
  const subs = st.mines.submissions;
  return (
    <div>
      <div className="view-head">
        <h1>Validator Queue</h1>
        <span className="sub">Proof Validators review submissions — votes tick in live</span>
        <span className="chip gold">{subs.filter((s) => s.status === 'voting').length} in queue</span>
      </div>
      <div className="card">
        {subs.length === 0 && (
          <div className="empty-state"><div className="es-ico">🛂</div><div className="es-t">Queue empty — all submissions validated</div><div className="es-m">New submissions appear here as participants complete campaigns.</div></div>
        )}
        {subs.map((s) => {
          const c = st.mines.campaigns.find((x) => x.id === s.campaign);
          return (
            <div key={s.id} className="mc-queue-row">
              <div style={{ flex: 1 }}>
                <div className="t" style={{ fontWeight: 700, fontSize: 13 }}>
                  Submission {s.id}
                  {s.appealOf && <span className="mc-badge b-appealed" style={{ marginLeft: 8 }}>↻ Resubmitted after rejection</span>}
                </div>
                <div className="m" style={{ fontSize: 11.5, color: 'var(--txt-2)', marginTop: 2 }}>{s.wallet} · {c?.name || s.plat} · Proof (Screenshot)</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5 }}>
                  <span className="chip">AI <b>{s.ai}%</b></span>
                  <span className="chip">Human validators: <b>{s.human} / {s.need}</b></span>
                  <span className="chip">Validator votes: <b className="v-yes">{s.human} approved</b></span>
                </div>
                <div className="mc-votes">
                  {Array.from({ length: s.need }, (_, i) => (
                    <span key={i} className={i < s.human ? 'v-yes' : 'v-need'}>{i < s.human ? '✓' : '·'}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {s.status === 'voting' ? <span className="mc-badge b-pending">{s.human}/{s.need} votes</span> : <StatusChip status={s.status} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

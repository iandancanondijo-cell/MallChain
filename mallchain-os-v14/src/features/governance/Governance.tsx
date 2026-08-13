import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, StatusChip, Modal, BarChart, toast } from '../../components/ui';

/** Governance — proposal list + detail (comments, MALL-weighted vote) + create proposal. */
export default function Governance() {
  useStoreVersion();
  const st = store.state;
  const [sel, setSel] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [opt1, setOpt1] = useState('For');
  const [opt2, setOpt2] = useState('Against');
  const [quorum, setQuorum] = useState(800);
  const [comment, setComment] = useState('');
  const [voted, setVoted] = useState<Record<string, string>>({});

  const votingPower = Math.floor(st.balances.MALL / 100); // 1 vote per 100 MALL

  const create = () => {
    if (!title.trim() || !body.trim()) { toast('Title and body are required', false); return; }
    st.governance.proposals.unshift({
      id: String(Date.now()).slice(-5),
      title, body,
      options: [opt1.trim(), opt2.trim(), 'Abstain'],
      votes: [0, 0, 0],
      quorum,
      status: 'active',
      comments: [],
      createdByMe: true,
      ts: Date.now(),
    });
    store.commit();
    setCreateOpen(false);
    setTitle(''); setBody('');
    toast('Proposal submitted — now live for voting');
  };

  const vote = (pid: string, optIdx: number) => {
    const p = st.governance.proposals.find((x) => x.id === pid);
    if (!p) return;
    if (voted[pid]) { toast('You already voted on this proposal', false); return; }
    p.votes[optIdx] += votingPower;
    setVoted((v) => ({ ...v, [pid]: p.options[optIdx] }));
    store.commit();
    toast(`Voted "${p.options[optIdx]}" — ${votingPower} votes (1 per 100 MALL)`);
  };

  const addComment = (pid: string) => {
    if (!comment.trim()) return;
    const p = st.governance.proposals.find((x) => x.id === pid);
    p?.comments.push({ author: st.user.name, text: comment.trim(), ts: Date.now() });
    store.commit();
    setComment('');
    toast('Comment posted');
  };

  const prop = sel ? st.governance.proposals.find((p) => p.id === sel) : null;
  const totalVotes = (p: typeof prop) => (p ? p.votes.reduce((a, b) => a + b, 0) : 0);

  return (
    <div>
      <div className="view-head">
        <h1>Governance</h1>
        <span className="sub">DAO proposals & treasury</span>
        <span className="chip gold">{votingPower} votes available</span>
      </div>

      <div className="stat-grid">
        <div className="card"><div className="card-label">Open proposals</div><div className="card-value">{st.governance.proposals.filter((p) => p.status === 'active').length}</div><div className="card-sub">active now</div></div>
        <div className="card"><div className="card-label">Voting power</div><div className="card-value">{votingPower} <span className="unit">votes</span></div><div className="card-sub">From {Math.floor(st.balances.MALL)} MALL held</div></div>
        <div className="card"><div className="card-label">Quorum</div><div className="card-value">800 <span className="unit">votes</span></div><div className="card-sub">required to pass</div></div>
        <div className="card"><div className="card-label">Participation</div><div className="card-value up">68.4%</div><div className="card-sub">This quarter</div></div>
      </div>

      <div className="sec-title">
        <h2>Proposals</h2>
        <button className="btn btn-ghost gold" style={{ marginLeft: 'auto' }} onClick={() => setCreateOpen(true)}>＋ New proposal</button>
      </div>

      {st.governance.proposals.length === 0 && (
        <div className="empty-state"><div className="es-ico">⚖️</div><div className="es-t">No proposals yet</div><div className="es-m">Be the first — create a proposal to put on-chain.</div><button className="btn btn-primary" onClick={() => setCreateOpen(true)}>Create proposal</button></div>
      )}

      <div className="vgrid" style={{ display: 'grid', gap: 12 }}>
        {st.governance.proposals.map((p) => {
          const total = totalVotes(p);
          return (
            <div key={p.id} className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => setSel(p.id)}>
              <div className="row">
                <span className="chip gold">#{p.id}</span>
                <div className="grow"><b>{p.title}</b></div>
                <StatusChip status={p.status} />
              </div>
              <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>{p.options[0]}: {total ? Math.round((p.votes[0] / total) * 100) : 0}% · {p.options[1]}: {total ? Math.round((p.votes[1] / total) * 100) : 0}% · quorum {Math.min(100, Math.round((total / p.quorum) * 100))}%</div>
              <div className="bar"><i style={{ width: `${Math.min(100, (total / p.quorum) * 100)}%` }} /></div>
              {p.createdByMe && <span className="chip" style={{ marginTop: 6 }}>Created by you</span>}
            </div>
          );
        })}
      </div>

      {createOpen && (
        <Modal title="Create proposal" onClose={() => setCreateOpen(false)}>
          <div className="field"><label>Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Proposal title" /></div>
          <div className="field"><label>Body</label><textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe the proposal and its motivation…" /></div>
          <div className="grid-2">
            <div className="field"><label>Option 1</label><input className="input" value={opt1} onChange={(e) => setOpt1(e.target.value)} /></div>
            <div className="field"><label>Option 2</label><input className="input" value={opt2} onChange={(e) => setOpt2(e.target.value)} /></div>
          </div>
          <div className="field"><label>Quorum: {quorum} votes</label><input type="range" min={100} max={2000} step={100} value={quorum} onChange={(e) => setQuorum(+e.target.value)} style={{ width: '100%', accentColor: 'var(--gold)' }} /></div>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={create}>Submit proposal</button></div>
        </Modal>
      )}

      {prop && (
        <Modal title={`Proposal #${prop.id}`} onClose={() => setSel(null)} wide>
          <h2 style={{ marginBottom: 4 }}>{prop.title}</h2>
          <div className="muted mb" style={{ fontSize: 13 }}>{prop.body}</div>
          <StatusChip status={prop.status} />
          <div className="sec-title mt"><h3>Vote ({votingPower} votes — 1 per 100 MALL)</h3></div>
          <div className="row mb">
            {prop.options.map((o, i) => (
              <button key={o} className={'btn ' + (voted[prop.id] === o ? 'btn-primary' : 'btn-ghost')} onClick={() => vote(prop.id, i)} disabled={!!voted[prop.id]}>
                {voted[prop.id] === o ? '✓ ' : ''}{o}
              </button>
            ))}
          </div>
          {voted[prop.id] && <span className="chip green mb">You voted: {voted[prop.id]}</span>}
          <div className="sec-title mt"><h3>Discussion</h3></div>
          {prop.comments.length === 0 && <div className="muted mb" style={{ fontSize: 12.5 }}>No comments yet — start the discussion.</div>}
          {prop.comments.map((c, i) => (
            <div key={i} className="card mb" style={{ background: 'var(--bg-2)', padding: 10 }}>
              <b style={{ fontSize: 12.5 }}>{c.author}</b> <span className="tiny">· {new Date(c.ts).toLocaleString()}</span>
              <div style={{ fontSize: 13, marginTop: 4 }}>{c.text}</div>
            </div>
          ))}
          <div className="row">
            <input className="input" style={{ flex: 1 }} placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment(prop.id)} />
            <button className="btn btn-ghost" onClick={() => addComment(prop.id)}>Post</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';

/** Small utility views — Careers, Learning, Social Tasks, Notifications,
 *  Analytics, Help — mirroring v14's ecosystem group. */
export const Careers = () => {
  useStoreVersion();
  const st = store.state;
  const apply = (t: string) => {
    const c = st.careers.list.find((x) => x.title === t);
    if (!c) return;
    c.applied = true;
    store.commit();
    toast(`Application sent for "${t}"`);
  };
  return (
    <div>
      <div className="view-head"><h1>Careers</h1><span className="sub">join the Mallchain team</span></div>
      <div className="stat-grid">
        <div className="card"><div className="card-label">Open roles</div><div className="card-value">{st.careers.list.length}</div><div className="card-sub">remote-first</div></div>
        <div className="card"><div className="card-label">Your applications</div><div className="card-value">{st.careers.list.filter((c) => c.applied).length}</div><div className="card-sub">tracked here</div></div>
      </div>
      {st.careers.list.map((c) => (
        <div key={c.title} className="card mb">
          <div className="row">
            <div className="grow"><b>{c.title}</b><div className="tiny">{c.dept} · {c.loc}</div></div>
            {c.applied ? <span className="chip green">Applied ✓</span> : <button className="btn btn-primary btn-sm" onClick={() => apply(c.title)}>Apply</button>}
          </div>
        </div>
      ))}
    </div>
  );
};

export const Learning = () => {
  useStoreVersion();
  const st = store.state;
  const toggle = (i: number) => { st.learning[i] = !st.learning[i]; store.commit(); };
  const lessons = [
    { t: 'What is Mallcoin (MALL)?', d: 'Core token economics', done: st.learning[0] },
    { t: 'Mining vs participation', d: 'Campaign Participants model', done: st.learning[1] },
    { t: 'Validators & consensus', d: '80% threshold, blind review', done: st.learning[2] },
    { t: 'Escrow & marketplace safety', d: 'Dispute resolution', done: st.learning[3] },
  ];
  return (
    <div>
      <div className="view-head"><h1>Learning</h1><span className="sub">Mallchain Academy</span></div>
      {lessons.map((l, i) => (
        <div key={l.t} className="card mb">
          <div className="row">
            <div className="grow"><b>{l.t}</b><div className="tiny">{l.d}</div></div>
            <button className="btn btn-ghost btn-sm" onClick={() => toggle(i)}>{l.done ? '✓ Completed' : 'Mark complete'}</button>
          </div>
        </div>
      ))}
      <div className="tiny">Progress {lessons.filter((l) => l.done).length}/{lessons.length} lessons.</div>
    </div>
  );
};

export const SocialTasks = () => {
  useStoreVersion();
  const st = store.state;
  const tasks = [
    { t: 'Follow @mallchain on X', r: 25, done: st.socialTasks[0] },
    { t: 'Join the Telegram community', r: 40, done: st.socialTasks[1] },
    { t: 'Share your referral link', r: 30, done: st.socialTasks[2] },
    { t: 'Verify your email + phone', r: 50, done: st.socialTasks[3] },
  ];
  const total = tasks.reduce((a, t) => a + t.r, 0);
  const earned = tasks.reduce((a, t, i) => a + (st.socialTasks[i] ? t.r : 0), 0);
  return (
    <div>
      <div className="view-head"><h1>Social Tasks</h1><span className="sub">earn bonus MLPTS</span></div>
      <div className="stat-grid">
        <div className="card"><div className="card-label">Earned</div><div className="card-value up">{earned} <span className="unit">MLPTS</span></div><div className="card-sub">of {total} available</div></div>
      </div>
      {tasks.map((t, i) => (
        <div key={t.t} className="card mb">
          <div className="row">
            <div className="grow"><b>{t.t}</b></div>
            <span className="chip gold">+{t.r} MLPTS</span>
            {st.socialTasks[i] ? <span className="chip green">Done ✓</span> : <button className="btn btn-primary btn-sm" onClick={() => { st.socialTasks[i] = true; store.commit(); toast(`+${t.r} MLPTS earned`); }}>Complete</button>}
          </div>
        </div>
      ))}
    </div>
  );
};

export const NotificationsView = () => {
  useStoreVersion();
  const st = store.state;
  const [filter, setFilter] = useState('all');
  const list = st.notifs.filter((n) => filter === 'all' || n.kind === filter);
  const markAll = () => { st.notifs.forEach((n) => (n.read = true)); store.commit(); toast('All notifications marked read'); };
  const dismiss = (i: number) => { st.notifs.splice(i, 1); store.commit(); };
  return (
    <div>
      <div className="view-head"><h1>Notifications</h1><span className="sub">{st.notifs.filter((n) => !n.read).length} unread</span><button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={markAll}>Mark all read</button></div>
      <div className="mc-subnav" style={{ marginBottom: 16 }}>
        {['all', 'wallet', 'mines', 'validators', 'governance', 'social'].map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      {list.length === 0 && <div className="empty-state"><div className="es-ico">🔔</div><div className="es-t">No notifications</div><div className="es-m">Notifications from wallet, mines and validators appear here.</div></div>}
      {list.map((n, i) => (
        <div key={n.id} className={'card mb list-row' + (!n.read ? ' unread' : '')}>
          <span style={{ fontSize: 16 }}>{n.ico}</span>
          <div className="grow"><div className="t">{n.text}</div><div className="m">{n.time}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={() => dismiss(i)}>✕</button>
        </div>
      ))}
    </div>
  );
};

export const AnalyticsView = () => {
  useStoreVersion();
  const st = store.state;
  return (
    <div>
      <div className="view-head"><h1>Network Analytics</h1><span className="sub">Mallchain mainnet</span></div>
      <div className="stat-grid">
        <div className="card"><div className="card-label">Daily active wallets</div><div className="card-value">12,410</div><div className="card-sub">+8.2% this week</div></div>
        <div className="card"><div className="card-label">Transactions / day</div><div className="card-value">88,204</div><div className="card-sub">avg block time 2.1s</div></div>
        <div className="card"><div className="card-label">Campaign completions</div><div className="card-value">4,982</div><div className="card-sub">validator accuracy 97.4%</div></div>
        <div className="card"><div className="card-label">Marketplace volume</div><div className="card-value">$1.24M</div><div className="card-sub">USD-M settled</div></div>
      </div>
    </div>
  );
};

export const Help = () => {
  useStoreVersion();
  const st = store.state;
  const faqs = [
    { q: 'How do I earn Mallpoints?', a: 'Complete campaign tasks as a Campaign Participant, or validate submissions as a Proof Validator.' },
    { q: 'What is the validator stake?', a: '500 MALL locked while validating — 25% slashable at strike tier 4.' },
    { q: 'How does escrow work?', a: 'Funds lock in the Escrow contract at checkout and release when delivery is confirmed.' },
    { q: 'How do I appeal a rejection?', a: 'Every rejection is appealable once — resubmit from your My Tasks page.' },
  ];
  return (
    <div>
      <div className="view-head"><h1>Help Center</h1><span className="sub">answers & support</span></div>
      {faqs.map((f) => (
        <div key={f.q} className="card mb"><b style={{ fontSize: 13.5 }}>{f.q}</b><div className="tiny mt" style={{ lineHeight: 1.6 }}>{f.a}</div></div>
      ))}
    </div>
  );
};
import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { notificationsApi, type AppNotification } from '../../services/notificationsApi';

/** Small utility views — Careers, Learning, Social Tasks, Notifications,
 *  Analytics, Help — mirroring v14's ecosystem group. */
export const Careers = () => {
  useStoreVersion();
  const st = store.state;
  return (
    <div>
      <div className="view-head"><h1>Careers</h1><span className="sub">join the Mallchain team</span></div>
      <div className="stat-grid">
        <div className="card"><div className="card-label">Open roles</div><div className="card-value">{st.careers.list.length}</div><div className="card-sub">remote-first</div></div>
      </div>
      <div className="card mb">
        <div className="tiny">Applications aren't wired up yet — there's no backend to send them to. Reach out directly for now.</div>
      </div>
      {st.careers.list.map((c) => (
        <div key={c.title} className="card mb">
          <div className="row">
            <div className="grow"><b>{c.title}</b><div className="tiny">{c.dept} · {c.loc}</div></div>
            <button className="btn btn-ghost btn-sm" disabled title="Applications aren't available yet">Apply</button>
          </div>
        </div>
      ))}
    </div>
  );
};

const LESSONS = [
  {
    t: 'What is Mallcoin (MALL)?',
    d: 'Core token economics',
    body: [
      'MALL has a fixed total supply of 670,000,000 — nothing beyond that ever gets minted. New coins enter circulation on a fixed emission schedule, not on demand.',
      'Emission runs in 36-month phases. Phase 1 releases 3,000,000 MALL per month; every phase after that halves the previous rate (phase 2 = 1,500,000/month, phase 3 = 750,000/month, and so on). Nobody can speed this up — it\'s a fixed schedule, not a market decision.',
      'A separate token, MLCNS, is what you actually hold and spend day to day (buy/sell, send, stake) — it\'s the liquid, tradable form backed by the MALL emission above.',
      'Transfers carry a small fee (currently 1% at time of writing). Half goes to active stakers, split proportionally to how much they\'ve staked; half goes to the treasury. This is what "staking rewards" actually are on this chain — a share of real transaction activity, not tokens created from nothing.',
    ],
  },
  {
    t: 'Mining vs participation',
    d: 'Campaign Participants model',
    body: [
      'There\'s no proof-of-work mining here — "Mines" is this app\'s name for its content/task-review system, unrelated to how the underlying chain reaches consensus (see the next lesson for that).',
      'A Campaign Participant completes tasks from active campaigns (the Mines tab) and submits proof of completion. A separate pool of reviewers — a random 6 per submission — votes to approve or reject it.',
      'Each reviewer\'s vote is weighted by their own reputation score (0–100, starting at 50 for a brand-new reviewer), not counted equally — a reviewer with a track record of careful, responsive voting carries more weight than one who doesn\'t.',
      'A submission is approved once the reputation-weighted "yes" votes clear 60% of the total weight cast. Reviewers who never show up to vote lose reputation, and three consecutive no-shows suspends their reviewer stake — the incentive is to actually review, not just hold the role.',
    ],
  },
  {
    t: 'Validators & consensus',
    d: 'How blocks actually get produced',
    body: [
      'This is a completely different "validator" from the reviewers in the previous lesson — this one is about how the blockchain itself reaches agreement on every block, using the standard Cosmos SDK proof-of-stake model (Tendermint/CometBFT consensus).',
      'A validator runs a node and bonds `stake` (this chain\'s native gas/staking token — see the runbook on operator funding if you want the full "where does stake come from" answer). Delegators can add their own stake behind a validator they trust, sharing in that validator\'s rewards minus its commission.',
      'Missing blocks past a configured threshold (currently: signing fewer than 50% of the last 100 blocks) gets a validator jailed — temporarily removed from duty, earning nothing, until it un-jails itself. Double-signing (the same validator signing two conflicting blocks, usually from running the same key on two machines by mistake) is slashed — a real, non-refundable loss of 5% of that validator\'s stake. Ordinary downtime is a smaller 1% slash on top of the jailing.',
      'Anyone can become a validator — see the "Become a Validator" guide for the actual step-by-step (it\'s a technical, operator-level task, not something done through this app\'s UI).',
    ],
  },
  {
    t: 'Escrow & marketplace safety',
    d: 'How a marketplace purchase is actually protected',
    body: [
      'When a buyer pays for something through the marketplace, their funds move into an on-chain escrow — not directly to the seller — where they\'re held until the deal is confirmed.',
      'The buyer releases funds once they\'re satisfied (only the buyer can trigger a release), or the seller can refund the buyer (only the seller can trigger a refund) if the deal falls through. Neither side can unilaterally take the other\'s side of that decision.',
      'If something\'s wrong, the buyer can open a dispute during the escrow\'s dispute window, freezing the funds until it\'s resolved rather than letting a release happen on autopilot.',
      'Every one of these actions — create, release, refund, dispute — is validated on-chain before anything moves: real addresses, a real positive amount, a real (non-empty) escrow reference. Malformed or malicious-looking requests get rejected before they ever touch anyone\'s balance.',
    ],
  },
];

export const Learning = () => {
  useStoreVersion();
  const st = store.state;
  const toggle = (i: number) => { st.learning[i] = !st.learning[i]; store.commit(); };
  const [expanded, setExpanded] = useState<number | null>(null);
  const lessons = LESSONS.map((l, i) => ({ ...l, done: st.learning[i] }));
  return (
    <div>
      <div className="view-head"><h1>Learning</h1><span className="sub">Mallchain Academy</span></div>
      {lessons.map((l, i) => (
        <div key={l.t} className="card mb">
          <div className="row" style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === i ? null : i)}>
            <div className="grow"><b>{l.t}</b><div className="tiny">{l.d}</div></div>
            <span className="tiny muted" style={{ marginRight: 8 }}>{expanded === i ? '▲' : '▼'}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={(e) => { e.stopPropagation(); toggle(i); }}
            >
              {l.done ? '✓ Completed' : 'Mark complete'}
            </button>
          </div>
          {expanded === i && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {l.body.map((p, pi) => (
                <p key={pi} className="tiny" style={{ margin: 0, lineHeight: 1.6 }}>{p}</p>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="tiny">Progress {lessons.filter((l) => l.done).length}/{lessons.length} lessons.</div>
    </div>
  );
};

export const SocialTasks = () => {
  useStoreVersion();
  const tasks = [
    { t: 'Follow @mallchain on X', r: 25 },
    { t: 'Join the Telegram community', r: 40 },
    { t: 'Share your referral link', r: 30 },
    { t: 'Verify your email + phone', r: 50 },
  ];
  return (
    <div>
      <div className="view-head"><h1>Social Tasks</h1><span className="sub">not available yet</span></div>
      <div className="card mb">
        <div className="tiny">Social task rewards aren't wired up yet — there's no real backend crediting MLPTS for these yet, so completing them here wouldn't actually pay out.</div>
      </div>
      {tasks.map((t) => (
        <div key={t.t} className="card mb">
          <div className="row">
            <div className="grow"><b>{t.t}</b></div>
            <span className="chip gold">+{t.r} MLPTS</span>
            <button className="btn btn-ghost btn-sm" disabled title="Not available yet">Complete</button>
          </div>
        </div>
      ))}
    </div>
  );
};

const KIND_ICONS: Record<string, string> = { mines: '⛏', validators: '🛡', system: '⚙', wallet: '💰', governance: '⚖' };

export const NotificationsView = () => {
  useStoreVersion();
  const [filter, setFilter] = useState('all');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    const res = await notificationsApi.list();
    if (res.ok && res.data) setNotifications(res.data.notifications);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const list = notifications.filter((n) => filter === 'all' || n.kind === filter);
  const markAll = async () => {
    await notificationsApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast('All notifications marked read');
  };
  const dismiss = async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications((prev) => prev.filter((n) => n._id !== id));
  };

  return (
    <div>
      <div className="view-head"><h1>Notifications</h1><span className="sub">{notifications.filter((n) => !n.read).length} unread</span><button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={markAll}>Mark all read</button></div>
      <div className="mc-subnav" style={{ marginBottom: 16 }}>
        {['all', 'wallet', 'mines', 'validators', 'governance', 'system'].map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      {list.length === 0 && <div className="empty-state"><div className="es-ico">🔔</div><div className="es-t">No notifications</div><div className="es-m">Notifications from wallet, mines and validators appear here.</div></div>}
      {list.map((n) => (
        <div key={n._id} className={'card mb list-row' + (!n.read ? ' unread' : '')}>
          <span style={{ fontSize: 16 }}>{KIND_ICONS[n.kind] || '🔔'}</span>
          <div className="grow"><div className="t">{n.title}</div><div className="m">{n.body || new Date(n.createdAt).toLocaleString()}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={() => dismiss(n._id)}>✕</button>
        </div>
      ))}
    </div>
  );
};

export const AnalyticsView = () => {
  useStoreVersion();
  return (
    <div>
      <div className="view-head"><h1>Network Analytics</h1><span className="sub">not available yet</span></div>
      <div className="card">
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40 }}>📊</div>
          <h2 style={{ margin: '8px 0' }}>Network analytics isn't available yet</h2>
          <p className="muted">There's no backend endpoint serving real network-wide stats yet — check the Explorer for live chain data in the meantime.</p>
        </div>
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
    { q: 'What is my recovery phrase, and who should I share it with?', a: 'It\'s the master key to your wallet — anyone with it can move your funds. We never ask for it, by email, chat, or support ticket. Set a PIN in Security Settings so it\'s encrypted at rest instead of stored in plain text.' },
    { q: 'Why do I need to complete KYC?', a: 'Some actions (larger buys/cash-outs) require identity verification for regulatory compliance. Submit your ID under Settings → Verification; most reviews complete within 1-2 business days.' },
    { q: 'How does buying/cashing out with M-Pesa work?', a: 'Buying: reserve a quote, then complete the STK push prompt on your phone — MLCNS credits once Safaricom confirms payment. Cashing out: your MLCNS is burned on-chain first, then a KES payout is sent to your phone; large amounts may be held for manual review before payout.' },
    { q: 'Can I export or delete my account data?', a: 'Yes — under Security Settings, you can download a full export of everything linked to your account, or request permanent erasure. Erasure anonymizes your account and personal details immediately; some financial records are retained in redacted form as required for fraud/compliance record-keeping.' },
    { q: 'Why is a feature showing "temporarily paused"?', a: 'That means maintenance mode is active for that specific feature — usually a brief, deliberate pause during an incident or upstream provider issue, not something wrong with your account. Check back shortly.' },
    { q: 'My account shows as frozen — what does that mean?', a: 'An admin has restricted your account, usually pending a fraud/policy review. Most actions are blocked while frozen. Contact support if you believe this is a mistake.' },
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
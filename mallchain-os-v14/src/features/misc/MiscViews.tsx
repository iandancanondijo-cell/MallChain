import { useMemo, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import {
  NOTIF_KINDS,
  NOTIF_KIND_LABEL,
  type NotifKind,
} from '../../services/notificationsApi';
import {
  groupByDay,
  timeAgo,
  useNotificationFeed,
  type FeedEntry,
} from '../../services/notificationFeed';

/** Small utility views — Careers, Learning, Social Tasks, Notifications,
 *  Analytics, Help — mirroring v14's ecosystem group. */
export const Careers = () => {
  useStoreVersion();
  const st = store.state;
  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">Careers</h1><span className="sub">join the Mallchain team</span></div>
      <div className="stat-grid">
        <div className="card card-glow bg-gradient-card"><div className="card-label">Open roles</div><div className="card-value">{st.careers.list.length}</div><div className="card-sub">remote-first</div></div>
      </div>
      <div className="card card-glow bg-gradient-card mb">
        <div className="tiny">Applications aren't wired up yet — there's no backend to send them to. Reach out directly for now.</div>
      </div>
      <div className="stagger">
      {st.careers.list.map((c) => (
        <div key={c.title} className="card card-glow bg-gradient-card card-hover mb">
          <div className="row">
            <div className="grow"><b>{c.title}</b><div className="tiny">{c.dept} · {c.loc}</div></div>
            <button className="btn btn-ghost btn-sm" disabled title="Applications aren't available yet">Apply</button>
          </div>
        </div>
      ))}
      </div>
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
      <div className="view-head"><h1 className="text-gradient">Learning</h1><span className="sub">Mallchain Academy</span></div>
      <div className="stagger">
      {lessons.map((l, i) => (
        <div key={l.t} className="card card-glow bg-gradient-card card-hover mb">
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
      </div>
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
      <div className="view-head"><h1 className="text-gradient">Social Tasks</h1><span className="sub">not available yet</span></div>
      <div className="card card-glow bg-gradient-card mb">
        <div className="tiny">Social task rewards aren't wired up yet — there's no real backend crediting MLPTS for these yet, so completing them here wouldn't actually pay out.</div>
      </div>
      <div className="stagger">
      {tasks.map((t) => (
        <div key={t.t} className="card card-glow bg-gradient-card card-hover mb">
          <div className="row">
            <div className="grow"><b>{t.t}</b></div>
            <span className="chip gold">+{t.r} MLPTS</span>
            <button className="btn btn-ghost btn-sm" disabled title="Not available yet">Complete</button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
};

const KIND_ICONS: Record<NotifKind, string> = {
  transaction: '↔',
  security: '🛡',
  governance: '⚖',
  campaign: '📣',
  badge: '🏅',
  marketing: '📣',
  system: '⚙',
};

/** Only primitives get rendered out of a notification's `data` payload — the
 *  backend stores it as Mixed, so a nested object or array would otherwise
 *  show up as "[object Object]" or crash on React's child rules. */
function dataFields(data: unknown): Array<[string, string]> {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data as Record<string, unknown>)
    .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
    .slice(0, 6)
    .map(([k, v]) => [fieldLabel(k), v === null ? '—' : String(v)]);
}

/** Keys arrive as whatever the producer called them (`txHash`, `proof_url`,
 *  `ip`) — a detail list that reads like a database dump is not finished. */
const FIELD_ABBREVIATIONS: Record<string, string> = {
  ip: 'IP', id: 'ID', url: 'URL', tx: 'Transaction', kyc: 'KYC', api: 'API',
  usd: 'USD', kes: 'KES', pin: 'Cipher', otp: 'OTP', ref: 'Reference',
};

function fieldLabel(key: string): string {
  const words = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(' ');
  return words
    .map((word) => FIELD_ABBREVIATIONS[word.toLowerCase()] ?? word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export const NotificationsView = () => {
  useStoreVersion();
  const st = store.state;
  const [kindFilter, setKindFilter] = useState<'all' | NotifKind>('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all');
  const [query, setQuery] = useState('');

  // TopBar owns the background refresh; this page reads the same store, so a
  // row marked read here is already read in the bell when the panel next opens.
  const { state: feedState, entries, unread, hasMore, feed } =
    useNotificationFeed(st.user.authed ? st.user.id : null, { pollMs: 0 });

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const entry of entries) out[entry.kind] = (out[entry.kind] || 0) + 1;
    return out;
  }, [entries]);

  const needle = query.trim().toLowerCase();
  const shown = entries.filter((e) =>
    (kindFilter === 'all' || e.kind === kindFilter)
    && (readFilter === 'all' || !e.read)
    && (!needle || `${e.title} ${e.body}`.toLowerCase().includes(needle)),
  );
  const sections = groupByDay(shown);

  const markAll = async () => {
    if (await feed.markAllRead()) toast('All notifications marked read');
    else toast(feedState.error || 'Could not mark your notifications as read', false);
  };
  const dismiss = async (entry: FeedEntry) => {
    if (await feed.dismiss(entry.key)) return;
    toast(feedState.error || 'Could not dismiss that notification', false);
  };
  const openEntry = async (entry: FeedEntry) => {
    if (entry.read) return;
    if (entry.source === 'device') {
      feed.markDeviceRead(entry.key);
      return;
    }
    if (await feed.markRead(entry.key)) return;
    toast(feedState.error || 'Could not mark that notification as read', false);
  };

  const filtersActive = kindFilter !== 'all' || readFilter !== 'all' || !!needle;
  const clearFilters = () => { setQuery(''); setKindFilter('all'); setReadFilter('all'); };
  // Filters did work, there is simply nothing to show. The empty state below
  // offers the way out, so the toolbar must not offer the same button twice.
  const nothingMatches = !feedState.loading && entries.length > 0 && shown.length === 0;

  // A fragment list ("are type Security, matching “badge”") is only grammatical
  // for one filter at a time. Naming the active filters after a colon reads
  // correctly for every combination.
  const activeFilters = [
    kindFilter !== 'all' ? NOTIF_KIND_LABEL[kindFilter].toLowerCase() : '',
    readFilter === 'unread' ? 'unread only' : '',
    needle ? `“${query.trim()}”` : '',
  ].filter(Boolean);

  return (
    <div>
      <div className="view-head">
        <h1 className="text-gradient">Notifications</h1>
        <span className="sub">{unread > 0 ? `${unread} unread` : 'All caught up'}</span>
        <span className="nc-head-actions">
          {unread > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => void markAll()}>Mark all read</button>
          )}
          <a className="btn btn-ghost btn-sm" href="#/settings">Notification settings</a>
        </span>
      </div>

      {feedState.error && (
        <div className="card card-glow nc-error mb" role="alert">
          <span>{feedState.error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void feed.refresh()}>Try again</button>
        </div>
      )}

      <div className="mc-subnav" style={{ marginBottom: 10 }}>
        {(['all', 'unread'] as const).map((f) => (
          <button key={f} className={readFilter === f ? 'on' : ''} onClick={() => setReadFilter(f)}>
            {f === 'all' ? `All${feedState.total ? ` (${feedState.total})` : ''}` : `Unread${unread ? ` (${unread})` : ''}`}
          </button>
        ))}
      </div>

      {/* One chip per value the server's `type` enum can actually hold. The
          tabs this page used before — wallet, mines, validators — matched
          nothing in that enum, so three of the six were permanently empty. */}
      <div className="nc-chips">
        <button className={kindFilter === 'all' ? 'on' : ''} onClick={() => setKindFilter('all')}>All types</button>
        {NOTIF_KINDS.map((k) => (
          <button key={k} className={kindFilter === k ? 'on' : ''} onClick={() => setKindFilter(k)}>
            {KIND_ICONS[k]} {NOTIF_KIND_LABEL[k]}{counts[k] ? ` ${counts[k]}` : ''}
          </button>
        ))}
      </div>

      <div className="nc-search">
        <input
          type="search"
          aria-label="Search your notifications"
          placeholder="Search your notifications…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {filtersActive && !nothingMatches && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      {feedState.loading && entries.length === 0 && (
        <div className="nc-skel" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="nc-skel-row"><span className="sk-ico" /><span className="sk-line" /><span className="sk-line short" /></div>)}
        </div>
      )}

      {!feedState.loading && entries.length === 0 && (
        <div className="empty-state">
          <div className="es-ico">🔔</div>
          <div className="es-t">Nothing here yet</div>
          <div className="es-m">
            {feedState.owner
              ? 'Wallet, marketplace, governance and security events land here as they happen. Everything you see is the server’s copy for this account, so it is the same on any device you sign in from.'
              : 'Notifications belong to your account — sign in to see them.'}
          </div>
        </div>
      )}

      {nothingMatches && (
        <div className="empty-state">
          <div className="es-ico">🔍</div>
          <div className="es-t">No notifications match</div>
          <div className="es-m">
            {`None of your ${entries.length} loaded notifications match${activeFilters.length ? `: ${activeFilters.join(', ')}` : ' the current filters'}.`}
            {hasMore && ' Older notifications are still waiting below — load them and search again.'}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
        </div>
      )}

      {sections.map((section) => (
        <section key={section.label} className="nc-day">
          <div className="nc-day-head">{section.label}</div>
          <div className="stagger">
            {section.entries.map((entry) => {
              const fields = dataFields(entry.data);
              return (
                <article
                  key={entry.key}
                  role="button"
                  tabIndex={0}
                  className={'card card-glow bg-gradient-card card-hover mb list-row nc-item' + (entry.read ? '' : ' unread')}
                  onClick={() => void openEntry(entry)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    void openEntry(entry);
                  }}
                >
                  <span className="nc-ico" aria-hidden="true">{KIND_ICONS[entry.kind]}</span>
                  <div className="grow">
                    <div className="t">{entry.title}</div>
                    {entry.body && <div className="m">{entry.body}</div>}
                    <div className="nc-meta">
                      <span className="chip">{NOTIF_KIND_LABEL[entry.kind]}</span>
                      <span className="tiny nc-time" title={new Date(entry.createdAt).toLocaleString()}>{timeAgo(entry.createdAt)}</span>
                      {entry.source === 'device' && (
                        <span className={'chip ' + (entry.sync === 'unsynced' ? 'red' : 'gold')}>
                          {entry.sync === 'unsynced' ? 'This device only' : 'Saving…'}
                        </span>
                      )}
                      {entry.source === 'device' && entry.sync === 'unsynced' && entry.reason && (
                        <span className="tiny nc-reason">Not saved to your account — {entry.reason}.</span>
                      )}
                    </div>
                    {fields.length > 0 && (
                      <details className="nc-data" onClick={(e) => e.stopPropagation()}>
                        <summary>Details</summary>
                        <dl>
                          {fields.map(([k, v]) => (
                            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </div>
                  {!entry.read && <span className="nc-dot" aria-label="Unread" />}
                  <button
                    className="btn btn-ghost btn-sm"
                    aria-label="Dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      void dismiss(entry);
                    }}
                  >
                    ✕
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {(hasMore || feedState.loadingMore) && (
        <div className="nc-foot">
          <span className="tiny">{feedState.loadedCount} of {feedState.total} loaded</span>
          <button className="btn btn-ghost btn-sm" disabled={feedState.loadingMore} onClick={() => void feed.loadMore()}>
            {feedState.loadingMore ? 'Loading…' : 'Load older'}
          </button>
        </div>
      )}

      <div className="tiny nc-note">
        Dismissing archives a notification on your account — it disappears from every device and stops counting towards your unread total. Filters and search apply to the notifications loaded here; older ones arrive as you load them.
      </div>
    </div>
  );
};

export const AnalyticsView = () => {
  useStoreVersion();
  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">Network Analytics</h1><span className="sub">not available yet</span></div>
      <div className="card card-glow bg-gradient-card">
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40 }}>📊</div>
          <h2 style={{ margin: '8px 0' }}>Network analytics isn't available yet</h2>
          <p className="muted">There's no backend endpoint serving real network-wide stats yet — check the Explorer for live chain data in the meantime.</p>
        </div>
      </div>
    </div>
  );
};
/**
 * TopBar — universal search, wallet selector, notifications bell with badge,
 * theme/currency/language switchers, demo-mode chip, user chip.
 */
import { useCallback, useEffect, useState } from 'react';
import { store } from '../store/store';
import { useStoreVersion, fmtNum, toast } from './ui';
import { config } from '../services/config';
import SocketStatus from './SocketStatus';
import { notificationsApi, type AppNotification } from '../services/notificationsApi';
import { socketManager } from '../services/socket';

const CURRENCIES = ['USD', 'KES', 'EUR', 'GBP'];
const LANGS = ['EN', 'FR', 'ES', 'SW'];
const ACCENTS = ['gold', 'cyan', 'purple', 'emerald'];

export default function TopBar({ navigate }: { navigate: (p: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<'notif' | 'prefs' | null>(null);
  const [nf, setNf] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  useStoreVersion();
  const st = store.state;

  const loadNotifications = useCallback(async () => {
    if (!st.user.authed) return;
    const res = await notificationsApi.list();
    if (res.ok && res.data) setNotifications(res.data.notifications);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.user.authed]);

  useEffect(() => {
    loadNotifications();
    const unsubscribe = socketManager.onNotification((n) => {
      setNotifications((prev) => [{ _id: n._id, kind: n.kind, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt }, ...prev]);
      toastLocal(n.title);
    });
    return unsubscribe;
  }, [loadNotifications]);

  const unread = notifications.filter((n) => !n.read).length;
  const notifs = notifications.filter((n) => (nf === 'all' ? true : !n.read));

  const markAllRead = () => {
    notificationsApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toastLocal('All notifications marked as read');
  };
  const dismiss = (id: string) => {
    notificationsApi.markRead(id);
    setNotifications((prev) => prev.filter((n) => n._id !== id));
  };

  const applyAccent = (a: string) => {
    const map: Record<string, string> = { gold: '#f3ba2f', cyan: '#22d3ee', purple: '#a78bfa', emerald: '#34d399' };
    document.documentElement.style.setProperty('--accent', map[a] || '#f3ba2f');
    document.documentElement.style.setProperty('--accent-2', map[a] || '#f59e0b');
    st.prefs.accent = a as never;
    store.commit();
    toastLocal('Theme accent → ' + a);
  };

  const toggleDemo = () => {
    if (st.settings.demoMode) {
      if (window.confirm('Disable demo mode? This clears local demo data and shows production empty states.')) {
        localStorage.removeItem('mallchain_os_v1_v14');
        window.location.hash = '#/';
        window.location.reload();
      }
      return;
    }
    st.settings.demoMode = true;
    store.commit();
    toastLocal('Demo mode enabled');
  };

  const search = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && q.trim()) {
      navigate('/search?q=' + encodeURIComponent(q.trim()));
    }
  };

  return (
    <header className="topbar">
      {st.admin.flags.maintenance && (
        <span className="chip red">🛠 Maintenance mode — new transactions blocked</span>
      )}
      <div className="tb-search">
        <span>🔍</span>
        <input placeholder="Search campaigns, blocks, txs, validators…  (Ctrl+K)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={search} />
      </div>
      <div className="tb-wallet" onClick={() => navigate('/wallet')} title="Wallet selector">
        <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>MALL</span>
        <span className="bal">{fmtNum(st.balances.MALL)}</span>
      </div>
      <SocketStatus />
      <div className="tb-icon" title="Preferences" onClick={() => setOpen(open === 'prefs' ? null : 'prefs')}>
        ⚙
      </div>
      <div className="tb-icon" title="Notifications" onClick={() => setOpen(open === 'notif' ? null : 'notif')}>
        🔔
        {unread > 0 && <span className="tb-badge">{unread}</span>}
      </div>
      {open === 'prefs' && (
        <div className="panel" style={{ right: 90 }}>
          <div className="panel-head"><span className="grow">Preferences</span></div>
          <div style={{ padding: '12px 14px' }}>
            <div className="field">
              <label>Currency</label>
              <div className="row" style={{ gap: 6 }}>
                {CURRENCIES.map((c) => (
                  <button key={c} className={'btn btn-ghost btn-sm' + (st.prefs.currency === c ? ' gold' : '')} onClick={() => { st.prefs.currency = c as never; store.commit(); toastLocal('Currency → ' + c); }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Language</label>
              <div className="row" style={{ gap: 6 }}>
                {LANGS.map((l) => (
                  <button key={l} className={'btn btn-ghost btn-sm' + (st.prefs.lang === l ? ' gold' : '')} onClick={() => { st.prefs.lang = l as never; store.commit(); toastLocal('Language → ' + l); }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Theme accent</label>
              <div className="row" style={{ gap: 6 }}>
                {ACCENTS.map((a) => (
                  <button key={a} className={'btn btn-ghost btn-sm' + (st.prefs.accent === a ? ' gold' : '')} onClick={() => applyAccent(a)}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Network</label>
              <span className="chip gold">{config.network}</span>
            </div>
          </div>
        </div>
      )}
      {open === 'notif' && (
        <div className="panel">
          <div className="panel-head">
            <span className="grow">Notifications</span>
            <span className="chip" style={{ cursor: 'pointer' }} onClick={() => setNf(nf === 'all' ? 'unread' : 'all')}>{nf === 'all' ? 'All' : 'Unread'}</span>
            <span className="chip gold" style={{ cursor: 'pointer' }} onClick={markAllRead}>Mark all read</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {notifs.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--txt-3)', fontSize: 12.5 }}>No notifications yet</div>}
            {notifs.map((n) => (
              <div key={n._id} className={'panel-item' + (n.read ? '' : ' unread')}>
                <div className="grow">
                  <div className="pt">{n.title}</div>
                  {n.body && <div className="pm">{n.body}</div>}
                </div>
                <span className="pts">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ cursor: 'pointer', color: 'var(--txt-3)' }} onClick={() => dismiss(n._id)}>✕</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <span className="demo-chip" onClick={toggleDemo} title="Toggle demo mode">
        {st.settings.demoMode ? 'Demo data · click to disable' : 'Production mode'}
      </span>
      <div className="tb-user" onClick={() => navigate('/profile')}>
        <div className="avatar">{st.user.avatarInitial || 'C'}</div>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>{st.user.name}</div>
          <div style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>{st.user.frozen ? '❄ Frozen' : st.settings.network}</div>
        </div>
      </div>
    </header>
  );
}

function toastLocal(text: string) {
  // lightweight: reuse the global toast bus
  toast(text);
}

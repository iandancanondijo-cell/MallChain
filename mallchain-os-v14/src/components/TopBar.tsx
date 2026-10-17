/**
 * TopBar — search, wallet display, network status, admin access,
 * with separate settings and notifications panels.
 * Admin route shows only notifications and network status.
 */
import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Search, Bell, Settings, ShieldAlert, Wrench, Menu, X, ArrowRight, ArrowLeftRight, ShieldCheck, Megaphone, Award, Package, Vote } from 'lucide-react';
import { store } from '../store/store';
import { useStoreVersion, fmtNum, toast, BadgeCheckmark } from './ui';
import { config } from '../services/config';
import { COMMON_CURRENCIES } from '../services/locale';
import { useSupportedCurrencies } from '../services/currency';
import SocketStatus from './SocketStatus';
import { notificationsApi, type AppNotification } from '../services/notificationsApi';
import { socketManager } from '../services/socket';
import { t } from '../services/i18n';
import { useMaintenanceStatus } from '../services/maintenanceApi';
import { openCommandPalette } from './CommandPalette';
const LANGS = ['EN', 'FR', 'ES', 'SW'];
const ACCENTS = ['gold', 'cyan', 'purple', 'emerald'];

const KIND_ICONS: Record<string, typeof Bell> = {
  transaction: ArrowLeftRight,
  transactions: ArrowLeftRight,
  security: ShieldCheck,
  governance: Vote,
  campaigns: Megaphone,
  marketing: Megaphone,
  badgeAlerts: Award,
  badge: Award,
  system: Package,
};

function kindIcon(kind: string) {
  const Icon = KIND_ICONS[kind] || Bell;
  return <Icon size={14} aria-hidden="true" />;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return t('just now');
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function TopBar({ navigate, isAdminRoute, onToggleMobileNav }: { navigate: (p: string) => void; isAdminRoute?: boolean; onToggleMobileNav?: () => void }) {
  const [q, setQ] = useState('');
  const [openPanel, setOpenPanel] = useState<'settings' | 'notifications' | null>(null);
  const [nf, setNf] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  useStoreVersion();
  const st = store.state;
  const allCurrencies = useSupportedCurrencies();
  const maintenance = useMaintenanceStatus();
  const maintenanceActive = maintenance.global || Object.values(maintenance.scopes).some(Boolean);

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

  useEffect(() => {
    if (!openPanel) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpenPanel(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPanel(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [openPanel]);

  const unread = notifications.filter((n) => !n.read).length;

  const currencyButtons = useMemo(() => COMMON_CURRENCIES, []);
  const languageButtons = useMemo(() => LANGS, []);
  const accentButtons = useMemo(() => ACCENTS, []);

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

  const search = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && q.trim()) {
      navigate('/search?q=' + encodeURIComponent(q.trim()));
    }
  };

  const toggle = (panel: 'settings' | 'notifications') => {
    setOpenPanel((cur) => (cur === panel ? null : panel));
  };

  const goNotifications = () => {
    setOpenPanel(null);
    navigate('/notifications');
  };

  const filtered = notifications.filter((n) => (nf === 'all' ? true : !n.read));

  return (
    <header className="topbar">
      {onToggleMobileNav && (
        <button type="button" className="tb-icon tb-hamburger" aria-label={t('Open navigation menu')} onClick={onToggleMobileNav}>
          <Menu size={18} />
        </button>
      )}
      {isAdminRoute && (
        <span className="chip red" style={{ fontWeight: 800, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldAlert size={13} aria-hidden="true" /> {t('ADMIN MODE')}
        </span>
      )}
      {maintenanceActive && (
        <span className="chip red" role="status" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Wrench size={13} aria-hidden="true" /> {t('Maintenance mode — new transactions blocked')}
        </span>
      )}
      {!isAdminRoute && (
        <div className="tb-search">
          <Search size={15} aria-hidden="true" />
          <input aria-label={t('Search campaigns, blocks, txs, validators')} placeholder={t('Search campaigns, blocks, txs, validators…  (Ctrl+K)')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={search} />
        </div>
      )}
      {!isAdminRoute && (
        <button type="button" className="tb-icon tb-search-trigger" aria-label={t('Search')} onClick={() => openCommandPalette()}>
          <Search size={16} aria-hidden="true" />
        </button>
      )}
      {!isAdminRoute && (
        <a className="tb-wallet" href="#/wallet" title="Wallet selector">
          <span className="lbl" style={{ fontSize: 11, color: 'var(--txt-3)' }}>MALL</span>
          <span className="bal">{fmtNum(st.balances.MALL)}</span>
        </a>
      )}
      {!isAdminRoute && (st.user.role === 'admin' || st.user.role === 'superadmin') && (
        <a className="chip red" style={{ display: 'flex', alignItems: 'center', gap: 6 }} href="#/admin" title="Go to the admin control center">
          <ShieldAlert size={13} aria-hidden="true" /> {t('Admin panel')}
        </a>
      )}
      <SocketStatus />

      {/* Settings button — regular routes only */}
      {!isAdminRoute && (
        <button
          type="button"
          className="tb-icon"
          title={t('Settings')}
          aria-label={t('Settings')}
          aria-haspopup="true"
          aria-expanded={openPanel === 'settings'}
          onClick={() => toggle('settings')}
        >
          <Settings size={16} aria-hidden="true" />
        </button>
      )}

      {/* Notifications button — always visible */}
      <button
        type="button"
        className="tb-icon"
        title={t('Notifications')}
        aria-label={unread > 0 ? `${t('Notifications')} (${unread} ${t('unread')})` : t('Notifications')}
        aria-haspopup="true"
        aria-expanded={openPanel === 'notifications'}
        onClick={() => toggle('notifications')}
      >
        <Bell size={16} aria-hidden="true" />
        {unread > 0 && <span className="tb-badge" aria-hidden="true">{unread}</span>}
      </button>

      {/* Panels container — click-outside closes whichever is open */}
      <div ref={panelRef} style={{ position: 'relative' }}>
        {/* ── Settings panel ── */}
        {openPanel === 'settings' && (
          <div className="panel tb-settings-panel" style={{ right: 0 }}>
            <div className="panel-head">
              <Settings size={14} aria-hidden="true" style={{ color: 'var(--txt-3)' }} />
              <span className="grow">{t('Settings')}</span>
              <button type="button" className="panel-close" aria-label={t('Close')} onClick={() => setOpenPanel(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="tb-settings-body">
              <div className="field">
                <label>{t('Currency')}</label>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {currencyButtons.map((c) => (
                    <button key={c} className={'btn btn-ghost btn-sm' + (st.prefs.currency === c ? ' gold' : '')} onClick={() => { st.prefs.currency = c as never; store.commit(); toastLocal('Currency → ' + c); }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>{t('Language')}</label>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  {languageButtons.map((l) => (
                    <button key={l} className={'btn btn-ghost btn-sm' + (st.prefs.lang === l ? ' gold' : '')} onClick={() => { st.prefs.lang = l as never; document.documentElement.lang = l.toLowerCase(); store.commit(); toastLocal('Language → ' + l); }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>{t('Theme')}</label>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  {accentButtons.map((a) => (
                    <button key={a} className={'btn btn-ghost btn-sm' + (st.prefs.accent === a ? ' gold' : '')} onClick={() => applyAccent(a)}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="tb-settings-footer">
              {t('Network')}: <span className="chip" style={{ marginLeft: 4 }}>{config.network}</span>
            </div>
          </div>
        )}

        {/* ── Notifications panel ── */}
        {openPanel === 'notifications' && (
          <div className="panel tb-notifications-panel" style={{ right: 0 }}>
            <div className="panel-head">
              <Bell size={14} aria-hidden="true" style={{ color: 'var(--txt-3)' }} />
              <span className="grow">{t('Notifications')}</span>
              {unread > 0 && (
                <button type="button" className="chip gold" onClick={markAllRead}>{t('Mark all read')}</button>
              )}
              <button type="button" className="panel-close" aria-label={t('Close')} onClick={() => setOpenPanel(null)}>
                <X size={14} />
              </button>
            </div>

            {/* Filter tabs */}
            <div className="tb-nf-tabs">
              <button type="button" className={'tb-nf-tab' + (nf === 'all' ? ' active' : '')} onClick={() => setNf('all')}>
                {t('All')}
                <span className="tb-nf-count">{notifications.length}</span>
              </button>
              <button type="button" className={'tb-nf-tab' + (nf === 'unread' ? ' active' : '')} onClick={() => setNf('unread')}>
                {t('Unread')}
                {unread > 0 && <span className="tb-nf-count unread">{unread}</span>}
              </button>
            </div>

            {/* Notifications list */}
            <div className="tb-nf-list">
              {filtered.length === 0 && (
                <div className="tb-nf-empty">
                  <Bell size={28} strokeWidth={1.2} />
                  <span>{nf === 'unread' ? t('All caught up') : t('No notifications yet')}</span>
                </div>
              )}
              {filtered.map((n) => (
                <div key={n._id} className={'tb-nf-item' + (n.read ? '' : ' unread')}>
                  <div className={'tb-nf-icon kind-' + (n.kind || 'system')}>
                    {kindIcon(n.kind)}
                  </div>
                  <div className="tb-nf-content">
                    <div className="tb-nf-title">{n.title}</div>
                    {n.body && <div className="tb-nf-body">{n.body}</div>}
                    <div className="tb-nf-meta">
                      <span className="tb-nf-time">{relativeTime(n.createdAt)}</span>
                      <span className="tb-nf-kind">{n.kind}</span>
                    </div>
                  </div>
                  {!n.read && <span className="tb-nf-dot" aria-label={t('Unread')} />}
                  <button type="button" className="tb-nf-dismiss" aria-label={t('Dismiss')} onClick={() => dismiss(n._id)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            {/* View all link */}
            <button type="button" className="tb-nf-view-all" onClick={goNotifications}>
              {t('View all notifications')}
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      {isAdminRoute ? (
        <div className="tb-user" style={{ cursor: 'default' }}>
          <div className="avatar" aria-hidden="true">{st.user.avatarInitial || 'C'}</div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{st.user.name || st.user.email?.split('@')[0] || t('Guest')}{st.user.hasBadge && <BadgeCheckmark />}</div>
            <div style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>{st.user.frozen ? `❄ ${t('Frozen')}` : st.settings.network}</div>
          </div>
        </div>
      ) : (
        <a className="tb-user" href="#/settings">
          <div className="avatar" aria-hidden="true">{st.user.avatarInitial || 'C'}</div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{st.user.name || st.user.email?.split('@')[0] || t('Guest')}{st.user.hasBadge && <BadgeCheckmark />}</div>
            <div style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>{st.user.frozen ? `❄ ${t('Frozen')}` : st.settings.network}</div>
          </div>
        </a>
      )}
    </header>
  );
}

function toastLocal(text: string) {
  toast(text);
}

/**
 * TopBar — unified settings & notifications panel with search, wallet display,
 * network status, admin access, and preferences (currency, language, theme).
 * Admin route shows only notifications and network status.
 */
import { useCallback, useEffect, useState, useMemo } from 'react';
import { Search, Bell, SlidersHorizontal, ShieldAlert, Wrench, Menu } from 'lucide-react';
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
import NotificationSetupWizard from './NotificationSetupWizard';
import { settingsApi, type ContactInfo } from '../services/settingsApi';
const LANGS = ['EN', 'FR', 'ES', 'SW'];
const ACCENTS = ['gold', 'cyan', 'purple', 'emerald'];

export default function TopBar({ navigate, isAdminRoute, onToggleMobileNav }: { navigate: (p: string) => void; isAdminRoute?: boolean; onToggleMobileNav?: () => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<'unified' | null>(null);
  const [nf, setNf] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [showWizard, setShowWizard] = useState(false);
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

  // Load contact info so we know whether to show the setup wizard.
  useEffect(() => {
    if (!st.user.authed) return;
    settingsApi.getContact().then((r) => {
      if (r.ok && r.data) setContact(r.data);
    });
  }, [st.user.authed]);

  const unread = notifications.filter((n) => !n.read).length;
  const notifs = notifications.filter((n) => (nf === 'all' ? true : !n.read));
  
  // Memoize currency and language options for performance
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
      {/* The only way back into the admin panel once an admin has left it —
          the sidebar deliberately has no admin entry (see Sidebar.tsx), so
          without this an admin account can get stranded on the regular
          user shell with no route back short of hand-editing the URL. */}
      {!isAdminRoute && (st.user.role === 'admin' || st.user.role === 'superadmin') && (
        <a className="chip red" style={{ display: 'flex', alignItems: 'center', gap: 6 }} href="#/admin" title="Go to the admin control center">
          <ShieldAlert size={13} aria-hidden="true" /> {t('Admin panel')}
        </a>
      )}
      <SocketStatus />
      {!isAdminRoute && (
        <button
          type="button"
          className="tb-icon"
          title={t('Settings & Notifications')}
          aria-label={unread > 0 ? `${t('Settings & Notifications')} (${unread} ${t('unread')})` : t('Settings & Notifications')}
          aria-haspopup="true"
          aria-expanded={open === 'unified'}
          onClick={() => setOpen(open === 'unified' ? null : 'unified')}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {unread > 0 && <span className="tb-badge" aria-hidden="true">{unread}</span>}
        </button>
      )}
      {isAdminRoute && (
        <button
          type="button"
          className="tb-icon"
          title={t('Notifications')}
          aria-label={unread > 0 ? `${t('Notifications')} (${unread} ${t('unread')})` : t('Notifications')}
          aria-haspopup="true"
          aria-expanded={open === 'unified'}
          onClick={() => setOpen(open === 'unified' ? null : 'unified')}
        >
          <Bell size={16} aria-hidden="true" />
          {unread > 0 && <span className="tb-badge" aria-hidden="true">{unread}</span>}
        </button>
      )}
      {open === 'unified' && (
        <div className="panel" style={{ right: 20, maxWidth: 420 }}>
          <div className="panel-head" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="grow">{isAdminRoute ? t('Notifications') : t('Settings & Notifications')}</span>
            {!isAdminRoute && <button type="button" className="chip" onClick={() => setNf(nf === 'all' ? 'unread' : 'all')}>{nf === 'all' ? t('All') : t('Unread')}</button>}
            <button type="button" className="chip gold" onClick={markAllRead}>{t('Mark all read')}</button>
          </div>

          {!isAdminRoute && (
            <>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-1)' }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600 }}>{t('Currency')}</label>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {currencyButtons.map((c) => (
                      <button key={c} className={'btn btn-ghost btn-sm' + (st.prefs.currency === c ? ' gold' : '')} onClick={() => { st.prefs.currency = c as never; store.commit(); toastLocal('Currency → ' + c); }}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>{t('Language')}</label>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    {languageButtons.map((l) => (
                      <button key={l} className={'btn btn-ghost btn-sm' + (st.prefs.lang === l ? ' gold' : '')} onClick={() => { st.prefs.lang = l as never; document.documentElement.lang = l.toLowerCase(); store.commit(); toastLocal('Language → ' + l); }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>{t('Theme')}</label>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    {accentButtons.map((a) => (
                      <button key={a} className={'btn btn-ghost btn-sm' + (st.prefs.accent === a ? ' gold' : '')} onClick={() => applyAccent(a)}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--line-1)', fontSize: 11, color: 'var(--txt-3)' }}>
                🌐 {t('Network')}: <span className="chip" style={{ marginLeft: 4 }}>{config.network}</span>
              </div>
            </>
          )}

          {/* Setup prompt banner */}
          {!showWizard && st.user.authed && contact && !contact.phoneVerified && !contact.emailVerified && (
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--line-1)',
              background: 'linear-gradient(135deg, rgba(243,186,47,0.06), rgba(243,186,47,0.02))',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Bell size={15} style={{ color: 'var(--accent, #f3ba2f)', flex: 'none' }} />
              <div style={{ flex: 1, fontSize: 11.5, color: 'var(--txt-2)', lineHeight: 1.4 }}>
                {t('Enable notifications for real-time updates')}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, flex: 'none' }}
                onClick={() => setShowWizard(true)}
              >
                {t('Set up')}
              </button>
            </div>
          )}

          {showWizard && st.user.authed && (
            <div style={{ padding: '12px 14px' }}>
              <NotificationSetupWizard
                contact={contact}
                userEmail={st.user.email}
                onComplete={() => {
                  setShowWizard(false);
                  settingsApi.getContact().then((r) => { if (r.ok && r.data) setContact(r.data); });
                }}
                onDismiss={() => setShowWizard(false)}
              />
            </div>
          )}

          {/* Notifications list */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {notifications.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--txt-3)', fontSize: 12.5 }}>{t('No notifications yet')}</div>}
            {notifications.filter((n) => (nf === 'all' ? true : !n.read)).map((n) => (
              <div key={n._id} className={'panel-item' + (n.read ? '' : ' unread')}>
                <div className="grow">
                  <div className="pt">{n.title}</div>
                  {n.body && <div className="pm">{n.body}</div>}
                </div>
                <span className="pts">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <button type="button" aria-label={t('Dismiss notification')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)' }} onClick={() => dismiss(n._id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
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
  // lightweight: reuse the global toast bus
  toast(text);
}

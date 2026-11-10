/**
 * TopBar — search, wallet display, network status, admin access,
 * with separate settings and notifications panels.
 * Admin route shows only notifications and network status.
 */
import { useEffect, useState, useMemo, useRef } from 'react';
import { Search, Bell, Settings, ShieldAlert, Wrench, Menu, X, ArrowRight, ArrowLeftRight, ShieldCheck, Megaphone, Award, Package, Vote } from 'lucide-react';
import { store } from '../store/store';
import { useStoreVersion, fmtNum, toast, BadgeCheckmark } from './ui';
import { config } from '../services/config';
import { savePreference } from '../services/preferences';
import { AccountPicture } from './WalletIdentity';
import { COMMON_CURRENCIES } from '../services/locale';
import { useSupportedCurrencies } from '../services/currency';
import SocketStatus from './SocketStatus';
import { groupByDay, timeAgo, useNotificationFeed, type FeedEntry } from '../services/notificationFeed';
import { t } from '../services/i18n';
import { useMaintenanceStatus } from '../services/maintenanceApi';
import { openCommandPalette } from './CommandPalette';
const LANGS = ['EN', 'FR', 'ES', 'SW'];
const ACCENTS = ['gold', 'cyan', 'purple', 'emerald'];

/** Keyed by `models/Notification.js`'s `type` enum — the only values that can arrive. */
const KIND_ICONS: Record<string, typeof Bell> = {
  transaction: ArrowLeftRight,
  security: ShieldCheck,
  governance: Vote,
  campaign: Megaphone,
  marketing: Megaphone,
  badge: Award,
  system: Package,
};

function kindIcon(kind: string) {
  const Icon = KIND_ICONS[kind] || Bell;
  return <Icon size={14} aria-hidden="true" />;
}

export default function TopBar({ navigate, isAdminRoute, onToggleMobileNav }: { navigate: (p: string) => void; isAdminRoute?: boolean; onToggleMobileNav?: () => void }) {
  const [q, setQ] = useState('');
  const [openPanel, setOpenPanel] = useState<'settings' | 'notifications' | null>(null);
  const [nf, setNf] = useState<'all' | 'unread'>('all');
  const panelRef = useRef<HTMLDivElement>(null);
  useStoreVersion();
  const st = store.state;
  const allCurrencies = useSupportedCurrencies();
  const maintenance = useMaintenanceStatus();
  const maintenanceActive = maintenance.global || Object.values(maintenance.scopes).some(Boolean);

  // The bell is the app-wide owner of the feed: it is mounted for every
  // session, so it binds the feed to the signed-in account and keeps it
  // ticking. The /notifications page reads the same store without starting a
  // second poll.
  const { state: feedState, entries, unread, hasMore, feed } = useNotificationFeed(st.user.authed ? st.user.id : null);

  // Announce a push that lands while the session is already open. Deliberately
  // keyed on the newest timestamp rather than "the head row changed": the head
  // also changes when something is dismissed or a re-fetch reorders, and
  // treating those as new arrivals is how a notification sound becomes noise.
  const newestSeenRef = useRef(0);
  useEffect(() => {
    const head = feedState.items[0];
    if (!head) return;
    const at = Date.parse(head.createdAt);
    if (newestSeenRef.current && at > newestSeenRef.current && !head.read) toastLocal(head.title);
    newestSeenRef.current = Math.max(newestSeenRef.current, at);
  }, [feedState.items]);

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

  const currencyButtons = useMemo(() => COMMON_CURRENCIES, []);
  const languageButtons = useMemo(() => LANGS, []);
  const accentButtons = useMemo(() => ACCENTS, []);

  const markAllRead = async () => {
    if (await feed.markAllRead()) toastLocal('All notifications marked as read');
    else toast(feed.getSnapshot().error || 'Could not mark your notifications as read', false);
  };

  const dismiss = async (entry: FeedEntry) => {
    if (await feed.dismiss(entry.key)) return;
    toast(feed.getSnapshot().error || 'Could not dismiss that notification', false);
  };

  const openEntry = async (entry: FeedEntry) => {
    if (entry.source === 'device') {
      if (!entry.read) feed.markDeviceRead(entry.key);
      return;
    }
    if (entry.read) return;
    if (await feed.markRead(entry.key)) return;
    toast(feed.getSnapshot().error || 'Could not mark that notification as read', false);
  };

  // The three pickers in this menu mirror the ones on Profile & Settings, so
  // they go through that page's write path. They used to be local-only: the
  // toast said "Currency → USD", the value applied, and the next Settings load
  // replaced st.prefs with the stored document — the choice reverted while the
  // message claiming it was saved was still on screen.
  const pick = async (key: 'accent' | 'currency' | 'lang', value: string) => {
    const label = key === 'accent' ? 'Theme' : key[0].toUpperCase() + key.slice(1);
    const res = await savePreference(key, value, label);
    toast(res.message, res.ok);
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

  const shownEntries = nf === 'unread' ? entries.filter((e) => !e.read) : entries;
  const sections = groupByDay(shownEntries);

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
          <ShieldAlert size={13} aria-hidden="true" /> <span className="tb-admin-label">{t('Admin panel')}</span>
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
                    <button key={c} className={'btn btn-ghost btn-sm' + (st.prefs.currency === c ? ' gold' : '')} onClick={() => { void pick('currency', c); }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>{t('Language')}</label>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  {languageButtons.map((l) => (
                    <button key={l} className={'btn btn-ghost btn-sm' + (st.prefs.lang === l ? ' gold' : '')} onClick={() => { void pick('lang', l); }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>{t('Theme')}</label>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  {accentButtons.map((a) => (
                    <button key={a} className={'btn btn-ghost btn-sm' + (st.prefs.accent === a ? ' gold' : '')} onClick={() => { void pick('accent', a); }}>
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
              {feedState.loading && <span className="tb-nf-spin" role="status" aria-label={t('Refreshing')} />}
              {unread > 0 && (
                <button type="button" className="chip gold" onClick={() => void markAllRead()}>{t('Mark all read')}</button>
              )}
              <button type="button" className="panel-close" aria-label={t('Close')} onClick={() => setOpenPanel(null)}>
                <X size={14} />
              </button>
            </div>

            {/* Filter tabs — `total` is the account's whole feed, not this page */}
            <div className="tb-nf-tabs">
              <button type="button" className={'tb-nf-tab' + (nf === 'all' ? ' active' : '')} onClick={() => setNf('all')}>
                {t('All')}
                <span className="tb-nf-count">{feedState.total}</span>
              </button>
              <button type="button" className={'tb-nf-tab' + (nf === 'unread' ? ' active' : '')} onClick={() => setNf('unread')}>
                {t('Unread')}
                {unread > 0 && <span className="tb-nf-count unread">{unread}</span>}
              </button>
            </div>

            {feedState.error && (
              <div className="tb-nf-error" role="alert">
                <span>{feedState.error}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void feed.refresh()}>{t('Retry')}</button>
              </div>
            )}

            <div className="tb-nf-list">
              {feedState.loading && sections.length === 0 && (
                <div className="tb-nf-skel" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="tb-nf-skel-row"><span className="sk-ico" /><span className="sk-line" /><span className="sk-line short" /></div>
                  ))}
                </div>
              )}
              {!feedState.loading && sections.length === 0 && (
                <div className="tb-nf-empty">
                  <Bell size={28} strokeWidth={1.2} />
                  <span>{nf === 'unread' ? t('All caught up') : t('No notifications yet')}</span>
                  {nf === 'unread' && unread === 0 && feedState.total > 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNf('all')}>{t('Show all')}</button>
                  )}
                </div>
              )}
              {sections.map((section) => (
                <div key={section.label}>
                  <div className="tb-nf-day">{t(section.label)}</div>
                  {section.entries.map((entry) => (
                    <div
                      key={entry.key}
                      role="button"
                      tabIndex={0}
                      className={'tb-nf-item' + (entry.read ? '' : ' unread') + (entry.source === 'device' ? ' device' : '')}
                      onClick={() => void openEntry(entry)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        void openEntry(entry);
                      }}
                    >
                      <div className={'tb-nf-icon kind-' + entry.kind}>
                        {kindIcon(entry.kind)}
                      </div>
                      <div className="tb-nf-content">
                        <div className="tb-nf-title">{entry.title}</div>
                        {entry.body && <div className="tb-nf-body">{entry.body}</div>}
                        <div className="tb-nf-meta">
                          <span className="tb-nf-time">{timeAgo(entry.createdAt)}</span>
                          <span className="tb-nf-kind">{entry.kind}</span>
                          {entry.source === 'device' && (
                            <span
                              className={'tb-nf-sync' + (entry.sync === 'unsynced' ? ' unsynced' : '')}
                              title={entry.sync === 'unsynced' ? `Not saved to your account — ${entry.reason || 'the notification service did not accept it'}` : t('Saving to your account…')}
                            >
                              {entry.sync === 'unsynced' ? t('This device only') : t('Saving…')}
                            </span>
                          )}
                        </div>
                      </div>
                      {!entry.read && <span className="tb-nf-dot" aria-label={t('Unread')} />}
                      <button
                        type="button"
                        className="tb-nf-dismiss"
                        aria-label={t('Dismiss')}
                        onClick={(e) => {
                          e.stopPropagation();
                          void dismiss(entry);
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {feedState.total > shownEntries.length && shownEntries.length > 0 && (
              <div className="tb-nf-foot">
                <span className="tiny">{shownEntries.length} / {feedState.total}</span>
                {hasMore && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={feedState.loadingMore} onClick={() => void feed.loadMore()}>
                    {feedState.loadingMore ? t('Loading…') : t('Load older')}
                  </button>
                )}
              </div>
            )}

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
          <UserAvatar />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{st.user.name || st.user.email?.split('@')[0] || t('Guest')}{st.user.hasBadge && <BadgeCheckmark />}</div>
            <div style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>{st.user.frozen ? `❄ ${t('Frozen')}` : st.settings.network}</div>
          </div>
        </div>
      ) : (
        <a className="tb-user" href="#/settings">
          <UserAvatar />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{st.user.name || st.user.email?.split('@')[0] || t('Guest')}{st.user.hasBadge && <BadgeCheckmark />}</div>
            <div style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>{st.user.frozen ? `❄ ${t('Frozen')}` : st.settings.network}</div>
          </div>
        </a>
      )}
    </header>
  );
}

// The menu bar's own picture. The rule for showing it lives in
// components/WalletIdentity.tsx so the bar, the Profile card and a transaction
// row can never disagree about whether an account has a picture.
function UserAvatar() {
  const st = store.state;
  return (
    <AccountPicture
      avatarUrl={st.user.avatarUrl}
      name={st.user.name}
      initial={st.user.avatarInitial || 'C'}
    />
  );
}

function toastLocal(text: string) {
  toast(text);
}

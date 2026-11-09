/**
 * The notification feed — one account-scoped, server-driven copy of the
 * user's notifications, shared by every surface that shows them.
 *
 * Why this module exists:
 * - The bell badge counted unread rows in whatever the current 50-item page
 *   happened to hold, while the backend already answers an `unreadCount` for
 *   the whole account. A user with 200 unread saw a capped 50.
 * - "Dismiss" called PATCH /:id/read. The list endpoint has no unread filter,
 *   so the row came straight back on the next fetch or reload — dismissing
 *   visibly did nothing. The archive endpoint (DELETE /:id) existed all along.
 * - The bell panel and the /notifications page each kept their own `useState`
 *   copy, so marking read in one left the other stale, and each re-fetched on
 *   mount.
 * - Live socket pushes were merged into the panel copy only; the page never
 *   saw them.
 * - `store.state.notifications` was written by every producer
 *   (pushNotification) and read by no component — events raised by the app's
 *   own actions (order placed, vote cast, unstake, wallet disconnected after 3
 *   failed verifications) went nowhere visible, while the copy that did exist
 *   sat in localStorage instead of being fetched per account.
 *
 * This is the single source of truth. `items` is the server's own page of
 * rows (REST + socket pushes, which are the same persisted rows), `devices`
 * holds events this device raised that the server has not confirmed yet —
 * shown distinctly, never silently dropped, and reconciled into `items` the
 * moment `POST /api/notifications/send` answers with a row id.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  notificationsApi,
  type AppNotification,
  type NotifCategory,
  type NotifKind,
} from './notificationsApi';
import { socketManager } from './socket';

/** Rows fetched per page. The backend caps a request at 100 (routes/notifications.js). */
export const PAGE_LIMIT = 50;

export type DeviceSync = 'pending' | 'unsynced';

/**
 * An event raised by this device. `pending` means the POST is still in
 * flight; `unsynced` means it will never become a server row (notifications
 * switched off, unsubscribed category, or the request failed) and stays on
 * this device only.
 */
export interface DeviceNotification {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  sync: DeviceSync;
  reason?: string;
}

export interface FeedState {
  /** Mongo user id the feed currently belongs to; null when signed out. */
  owner: string | null;
  items: AppNotification[];
  devices: DeviceNotification[];
  /** The server's account-wide unread count — not derived from `items`. */
  unreadCount: number;
  total: number;
  loadedCount: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  lastLoadedAt: number;
}

export interface FeedEntry {
  source: 'server' | 'device';
  key: string;
  notification: AppNotification | DeviceNotification;
  read: boolean;
  createdAt: string;
  kind: NotifKind;
  title: string;
  body: string;
  /** Only set for device entries. */
  sync?: DeviceSync;
  reason?: string;
  /** The server row's structured payload — `data` on models/Notification.js. */
  data?: Record<string, unknown>;
}

const IDLE: FeedState = {
  owner: null,
  items: [],
  devices: [],
  unreadCount: 0,
  total: 0,
  loadedCount: 0,
  loading: false,
  loadingMore: false,
  error: null,
  lastLoadedAt: 0,
};

function byNewest<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function newDeviceId(): string {
  return `device:${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * api.ts names a failed response by its status ("HTTP 502"). Shown bare, that
 * is a diagnosis rather than a sentence — the reader cannot tell whether their
 * notifications are gone or merely unreachable right now. Keep the code, put
 * the plain words around it. `terminal` is false where the text is dropped into
 * the middle of a sentence and the caller supplies the full stop.
 */
function feedError(raw: string | undefined | null, fallback: string, terminal = true): string {
  if (!raw) return fallback;
  if (!/^HTTP \d{3}$/i.test(raw)) return raw;
  return terminal ? `${fallback} (${raw}).` : `${fallback} (${raw})`;
}

function toEntry(notification: AppNotification | DeviceNotification, source: FeedEntry['source']): FeedEntry {
  const base = {
    source,
    key: source === 'server' ? (notification as AppNotification)._id : (notification as DeviceNotification).id,
    notification,
    read: notification.read,
    createdAt: notification.createdAt,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
  };
  if (source === 'server') {
    return { ...base, data: (notification as AppNotification).data };
  }
  const device = notification as DeviceNotification;
  return { ...base, sync: device.sync, reason: device.reason };
}

class NotificationFeed {
  private state: FeedState = IDLE;
  private listeners = new Set<() => void>();
  private socketUnsub: (() => void) | null = null;
  /** Bumped whenever the feed is rebound or torn down, so in-flight responses can't land on the wrong account. */
  private generation = 0;

  getSnapshot = (): FeedState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<FeedState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /**
   * Point the feed at an account. A different owner (login, account switch,
   * the 3-strike wallet disconnect) tears the previous page down before the
   * new one is requested: notifications carry names, amounts and security
   * events, so another account's rows must never be renderable for even one
   * frame after the identity changes.
   */
  bind(owner: string | null): void {
    if (this.state.owner === owner) {
      if (owner) void this.refresh();
      return;
    }
    this.teardown();
    this.generation += 1;
    if (!owner) {
      this.set(IDLE);
      return;
    }
    this.set({ ...IDLE, owner, loading: true });
    // Socket pushes are already the persisted rows, so one listener keeps the
    // panel and the page in step without either of them owning state.
    this.socketUnsub = socketManager.onNotification((n) => this.receivePush(n));
    void this.refresh();
  }

  /** Signed out, or the feed is no longer bound to a live session. */
  reset(): void {
    this.teardown();
    this.generation += 1;
    this.set(IDLE);
  }

  private teardown(): void {
    this.socketUnsub?.();
    this.socketUnsub = null;
  }

  /**
   * Replace the page with the server's current view of it. Device-raised
   * entries are kept: they are this session's own events, and a background
   * refresh must not make them disappear.
   */
  async refresh(): Promise<boolean> {
    const { owner, devices } = this.state;
    if (!owner) return false;
    const generation = this.generation;
    this.set({ loading: true, error: null });
    const res = await notificationsApi.list({ limit: PAGE_LIMIT, offset: 0 });
    // A reset or account switch happened while this was in flight.
    if (generation !== this.generation) return false;
    if (!res.ok || !res.data) {
      this.set({ loading: false, error: feedError(res.error, 'Could not load your notifications.') });
      return false;
    }
    this.set({
      loading: false,
      items: byNewest(res.data.notifications),
      unreadCount: res.data.unreadCount,
      total: res.data.total,
      loadedCount: res.data.notifications.length,
      devices,
      error: null,
      lastLoadedAt: Date.now(),
    });
    return true;
  }

  /**
   * Append the next, older page. The cursor is the number of rows already
   * loaded; `mergeById` removes the overlap a shifting server page can cause.
   */
  async loadMore(): Promise<boolean> {
    const { owner, items, loadedCount, total } = this.state;
    if (!owner || loadedCount >= total) return false;
    const generation = this.generation;
    this.set({ loadingMore: true });
    const res = await notificationsApi.list({ limit: PAGE_LIMIT, offset: loadedCount });
    if (generation !== this.generation) return false;
    if (!res.ok || !res.data) {
      this.set({ loadingMore: false, error: feedError(res.error, 'Could not load older notifications.') });
      return false;
    }
    const merged = mergeById(items, res.data.notifications);
    this.set({
      loadingMore: false,
      items: merged,
      // The count on the response covers the whole account, so a later page
      // can legitimately report a different number than the first did; take
      // the larger rather than trusting one page's arithmetic.
      unreadCount: Math.max(this.state.unreadCount, res.data.unreadCount),
      total: res.data.total,
      // The cursor is the number of distinct rows held, not the sum of the
      // pages asked for: a row created between pages shows up on both, and
      // counting the overlap would skip an item on the next request.
      loadedCount: merged.length,
    });
    return true;
  }

  /**
   * A live push (socket) or a row this device just caused the server to
   * create. Both are the same persisted row, so both land in `items` and both
   * move the account unread count exactly once.
   */
  private receivePush(n: AppNotification): void {
    // Every action on a row — mark read, dismiss, dedupe the next push — is
    // keyed by its id. A row without one could be shown but never cleared.
    if (!n._id) return;
    const { items } = this.state;
    // Drop the device-side mirror of this row now that the real one is here.
    const devices = this.state.devices.filter(
      (d) => !(d.sync === 'pending' && d.title === n.title && d.body === n.body),
    );
    if (items.some((i) => i._id === n._id)) {
      // The REST page already had it. A push always describes the row as it
      // was created — unread, not archived — so taking the push's read state
      // here would resurrect a notification the user read or dismissed in the
      // last few seconds. Nothing to merge; the row on screen is already the
      // freshest copy we have.
      if (devices.length !== this.state.devices.length) this.set({ devices });
      return;
    }
    this.set({
      items: byNewest([n, ...items]),
      total: this.state.total + 1,
      unreadCount: n.read ? this.state.unreadCount : this.state.unreadCount + 1,
      devices,
    });
  }

  async markRead(id: string): Promise<boolean> {
    const item = this.state.items.find((i) => i._id === id);
    if (!item) return false;
    if (item.read) return true;
    this.applyRead([id], true);
    const res = await notificationsApi.markRead(id);
    if (!res.ok) {
      this.applyRead([id], false);
      this.set({ error: feedError(res.error, 'Could not mark that notification as read.') });
      return false;
    }
    return true;
  }

  async markAllRead(): Promise<boolean> {
    const ids = this.state.items.filter((i) => !i.read).map((i) => i._id);
    const prevItems = this.state.items;
    const prevDevices = this.state.devices;
    const prevUnread = this.state.unreadCount;
    this.applyRead(ids, true);
    this.set({
      unreadCount: 0,
      devices: prevDevices.map((d) => ({ ...d, read: true })),
    });
    const res = await notificationsApi.markAllRead();
    if (!res.ok) {
      this.set({ items: prevItems, devices: prevDevices, unreadCount: prevUnread, error: feedError(res.error, 'Could not mark your notifications as read.') });
      return false;
    }
    return true;
  }

  private applyRead(ids: string[], read: boolean): void {
    if (!ids.length) return;
    const set = new Set(ids);
    let delta = 0;
    for (const item of this.state.items) {
      if (!set.has(item._id)) continue;
      if (read && !item.read) delta -= 1;
      if (!read && item.read) delta += 1;
    }
    this.set({
      items: this.state.items.map((i) => (set.has(i._id) ? { ...i, read } : i)),
      unreadCount: Math.max(0, this.state.unreadCount + delta),
    });
  }

  /**
   * Dismiss for good. Server rows are archived (DELETE /:id sets `archived:
   * true`), which is the only thing that actually takes a row out of
   * GET /api/notifications; device entries are dropped locally.
   */
  async dismiss(id: string): Promise<boolean> {
    const device = this.state.devices.find((d) => d.id === id);
    if (device) {
      this.set({ devices: this.state.devices.filter((d) => d.id !== id) });
      return true;
    }
    const index = this.state.items.findIndex((i) => i._id === id);
    if (index < 0) return false;
    const item = this.state.items[index];
    const prevItems = this.state.items;
    const prevUnread = this.state.unreadCount;
    const prevTotal = this.state.total;
    const prevLoaded = this.state.loadedCount;
    this.set({
      items: this.state.items.filter((i) => i._id !== id),
      unreadCount: item.read ? prevUnread : Math.max(0, prevUnread - 1),
      total: Math.max(0, prevTotal - 1),
      loadedCount: Math.max(0, prevLoaded - 1),
    });
    const res = await notificationsApi.archive(id);
    if (!res.ok) {
      // Put it back exactly where it was. The row is still on the server, and
      // reporting a dismissal the server refused is how a UI teaches a user
      // that dismissing does nothing.
      this.set({ items: prevItems, unreadCount: prevUnread, total: prevTotal, loadedCount: prevLoaded, error: feedError(res.error, 'Could not dismiss that notification.') });
      return false;
    }
    return true;
  }

  /**
   * Raise an event this device caused. It shows up immediately as `pending`,
   * then either becomes a real row (the server's row id arrives → folded in by
   * `receivePush`) or is labelled device-only with the server's reason.
   *
   * It is deliberately not persisted. An unread "Wallet disconnected" trail
   * left in localStorage for the next person to unlock this browser is not
   * persistence, it is a leak — the durable copy is the one the server holds
   * for the account.
   */
  pushDevice(input: { kind: NotifKind; title: string; body: string; category?: NotifCategory; metadata?: Record<string, unknown> }): string {
    const id = newDeviceId();
    const entry: DeviceNotification = {
      id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      read: false,
      createdAt: new Date().toISOString(),
      sync: 'pending',
    };
    this.set({ devices: [entry, ...this.state.devices].slice(0, 50) });

    const generation = this.generation;
    void notificationsApi
      .send({ title: input.title, body: input.body, kind: input.kind, category: input.category, metadata: input.metadata })
      .then((res) => {
        if (generation !== this.generation) return;
        if (res.ok && res.data?.ok && res.data.notificationId) {
          this.receivePush({
            _id: String(res.data.notificationId),
            kind: input.kind,
            title: input.title,
            body: input.body,
            read: false,
            createdAt: new Date().toISOString(),
          });
          return;
        }
        this.markUnsynced(
          id,
          res.ok
            ? res.data?.reason || 'the server did not deliver it'
            : feedError(res.error, 'the notification service could not be reached', false),
        );
      })
      .catch(() => {
        if (generation !== this.generation) return;
        this.markUnsynced(id, 'the notification service could not be reached');
      });

    return id;
  }

  private markUnsynced(id: string, reason: string): void {
    if (!this.state.devices.some((d) => d.id === id)) return;
    this.set({
      devices: this.state.devices.map((d) => (d.id === id ? { ...d, sync: 'unsynced', reason } : d)),
    });
  }

  markDeviceRead(id: string): void {
    const device = this.state.devices.find((d) => d.id === id);
    if (!device || device.read) return;
    this.set({ devices: this.state.devices.map((d) => (d.id === id ? { ...d, read: true } : d)) });
  }
}

function mergeById(existing: AppNotification[], incoming: AppNotification[]): AppNotification[] {
  const seen = new Set(existing.map((i) => i._id));
  return byNewest([...existing, ...incoming.filter((i) => !seen.has(i._id))]);
}

export const notificationFeed = new NotificationFeed();

/** Every unread item in the feed, from both sources — this is the bell. */
export function feedUnread(state: FeedState): number {
  return state.unreadCount + state.devices.filter((d) => !d.read).length;
}

/** Server rows and device events, newest first, tagged by origin. */
export function feedEntries(state: FeedState): FeedEntry[] {
  return byNewest([
    ...state.items.map((n) => toEntry(n, 'server')),
    ...state.devices.map((n) => toEntry(n, 'device')),
  ]);
}

/**
 * "4h", "3d", "just now" — and, past a week, the date itself. A timestamp in a
 * notification list has to stay readable for months, which a bare "8d" does not.
 */
export function timeAgo(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface FeedSection {
  label: string;
  entries: FeedEntry[];
}

/**
 * Day headings for a list that spans days. Buckets are calendar days in the
 * browser's own timezone — matching how a person reads "yesterday" — while the
 * rows themselves stay in the server's ordering.
 */
export function groupByDay(entries: FeedEntry[], now = Date.now()): FeedSection[] {
  const sections: FeedSection[] = [];
  const index = new Map<string, FeedSection>();
  for (const entry of entries) {
    const label = dayLabel(entry.createdAt, now);
    let section = index.get(label);
    if (!section) {
      section = { label, entries: [] };
      index.set(label, section);
      sections.push(section);
    }
    section.entries.push(entry);
  }
  return sections;
}

function dayLabel(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'Undated';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date(now)) - startOf(new Date(then))) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const date = new Date(then);
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString([], sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' });
}

export interface FeedSnapshot {
  state: FeedState;
  entries: FeedEntry[];
  unread: number;
  hasMore: boolean;
  feed: NotificationFeed;
}

/**
 * The one hook every notification surface uses. Mounting it binds the feed to
 * the signed-in account and keeps it fresh; it owns no state of its own,
 * which is the point — the bell and the page cannot disagree.
 */
export function useNotificationFeed(owner: string | null, options: { pollMs?: number } = {}): FeedSnapshot {
  const { pollMs = 60_000 } = options;

  useEffect(() => {
    notificationFeed.bind(owner);
  }, [owner]);

  // A feed you only see when you happen to open the bell is a feed that
  // quietly goes stale. Re-sync on an interval and the moment the tab becomes
  // visible again — both silent, and neither leaving a red error behind just
  // because a background poll had a bad moment (a failed explicit action still
  // sets `error`, because that one the user asked for).
  useEffect(() => {
    if (!owner || pollMs <= 0) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void notificationFeed.refresh();
    };
    const timer = setInterval(onVisible, pollMs);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [owner, pollMs]);

  const state = useSyncExternalStore(notificationFeed.subscribe, notificationFeed.getSnapshot);
  const entries = useMemo(() => feedEntries(state), [state]);

  return { state, entries, unread: feedUnread(state), hasMore: state.loadedCount < state.total, feed: notificationFeed };
}

/**
 * The notification feed's own contract.
 *
 * Each test below is a defect the feed replaced, phrased as the promise a
 * user actually experiences:
 *
 *  - The bell showed at most 50 unread because it counted the loaded page; the
 *    backend answers an account-wide `unreadCount` (routes/notifications.js).
 *  - "Dismiss" called PATCH /:id/read, so the row was back on the next fetch —
 *    dismissing visibly did nothing. It now calls DELETE /:id (archive).
 *  - Two surfaces kept two `useState` copies, so marking read in the bell left
 *    the /notifications page stale.
 *  - A refresh, an account switch or a socket push that raced another could
 *    double-count unread, resurrect a dismissed row, or briefly render the
 *    previous account's notifications.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiStub = vi.hoisted(() => ({
  list: vi.fn(),
  getUnreadCount: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  archive: vi.fn(),
  send: vi.fn(),
}));

/** The socket listener the feed registers, so tests can deliver a live push. */
const socketStub = vi.hoisted(() => ({ listeners: new Set<(n: unknown) => void>() }));

vi.mock('./notificationsApi', () => ({ notificationsApi: apiStub }));
vi.mock('./socket', () => ({
  socketManager: {
    onNotification(cb: (n: unknown) => void) {
      socketStub.listeners.add(cb);
      return () => socketStub.listeners.delete(cb);
    },
  },
}));

import {
  feedEntries,
  feedUnread,
  groupByDay,
  notificationFeed,
  timeAgo,
  PAGE_LIMIT,
} from './notificationFeed';
import type { AppNotification } from './notificationsApi';

const OWNER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';

/**
 * One moment for the whole file, not one per row(). The rows a test builds are
 * meant to be indistinguishable in time — the feed sorts newest-first, and equal
 * stamps keep that sort on its input order. Calling Date.now() per row let a
 * millisecond tick between rows reorder the list, which showed up only when the
 * full suite ran slow enough: the assertion failed under load and passed alone.
 */
const NOW = Date.now();

function row(over: Partial<AppNotification> & { _id: string }): AppNotification {
  return {
    kind: 'system',
    title: 'title ' + over._id,
    body: '',
    read: false,
    createdAt: new Date(NOW - 60_000).toISOString(),
    ...over,
  };
}

function page(notifications: AppNotification[], extra: { total?: number; unreadCount?: number } = {}) {
  return {
    ok: true as const,
    data: {
      notifications,
      total: extra.total ?? notifications.length,
      unreadCount: extra.unreadCount ?? notifications.filter((n) => !n.read).length,
      limit: PAGE_LIMIT,
      offset: 0,
    },
  };
}

/** Drain the microtasks a bind/refresh chain needs. */
async function settle(times = 12) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

const snap = () => notificationFeed.getSnapshot();

describe('notificationFeed', () => {
  beforeEach(() => {
    notificationFeed.reset();
    socketStub.listeners.clear();
    apiStub.list.mockReset();
    apiStub.markRead.mockReset();
    apiStub.markAllRead.mockReset();
    apiStub.archive.mockReset();
    apiStub.send.mockReset();
    apiStub.list.mockResolvedValue(page([]));
    apiStub.markRead.mockResolvedValue({ ok: true, data: { ok: true } });
    apiStub.markAllRead.mockResolvedValue({ ok: true, data: { ok: true, modifiedCount: 1 } });
    apiStub.archive.mockResolvedValue({ ok: true, data: { ok: true } });
  });

  afterEach(() => {
    notificationFeed.reset();
    vi.restoreAllMocks();
  });

  describe('binding', () => {
    it('loads the server page and keeps the account-wide unread count separate from it', async () => {
      // 200 unread on the account, 2 rows in this page. Counting the page was
      // the old bug: the bell capped at the page size.
      apiStub.list.mockResolvedValueOnce(
        page([row({ _id: 'a' }), row({ _id: 'b', read: true })], { total: 512, unreadCount: 200 }),
      );

      notificationFeed.bind(OWNER);
      await settle();

      expect(snap().items).toHaveLength(2);
      expect(snap().total).toBe(512);
      expect(snap().loadedCount).toBe(2);
      expect(feedUnread(snap())).toBe(200);
      expect(apiStub.list).toHaveBeenCalledWith({ limit: PAGE_LIMIT, offset: 0 });
    });

    it('drops everything, and the socket listener, when the account signs out', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' })], { unreadCount: 1 }));
      notificationFeed.bind(OWNER);
      await settle();
      expect(socketStub.listeners.size).toBe(1);

      notificationFeed.bind(null);
      await settle();

      expect(snap().items).toEqual([]);
      expect(snap().owner).toBeNull();
      expect(feedUnread(snap())).toBe(0);
      expect(socketStub.listeners.size).toBe(0);
    });

    it('never shows the previous account’s rows when a new one signs in', async () => {
      // The first account's request is still in flight when the second binds.
      let release: (value: ReturnType<typeof page>) => void = () => {};
      apiStub.list.mockImplementationOnce(
        () => new Promise<ReturnType<typeof page>>((resolve) => { release = resolve; }),
      );
      notificationFeed.bind(OWNER);
      await settle();

      notificationFeed.bind(OTHER);
      await settle();
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'mine' })], { unreadCount: 1 }));
      await notificationFeed.refresh();

      // The old account's page finally arrives — it belongs to nobody now.
      release(page([row({ _id: 'theirs' })], { unreadCount: 99 }));
      await settle();

      expect(snap().items.map((i) => i._id)).toEqual(['mine']);
      expect(feedUnread(snap())).toBe(1);
    });
  });

  describe('reading', () => {
    it('marks one row read on the server, and does not re-ask for a row already read', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' })]));
      notificationFeed.bind(OWNER);
      await settle();

      expect(await notificationFeed.markRead('a')).toBe(true);
      expect(snap().items[0].read).toBe(true);
      expect(snap().unreadCount).toBe(0);

      expect(await notificationFeed.markRead('a')).toBe(true);
      expect(apiStub.markRead).toHaveBeenCalledTimes(1);

      expect(await notificationFeed.markRead('absent')).toBe(false);
    });

    it('puts a row back to unread when the server refuses the mark', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'b' })]));
      notificationFeed.bind(OWNER);
      await settle();

      apiStub.markRead.mockResolvedValueOnce({ ok: false, error: 'Could not reach the server' });
      expect(await notificationFeed.markRead('b')).toBe(false);

      expect(snap().items.find((i) => i._id === 'b')?.read).toBe(false);
      expect(snap().unreadCount).toBe(1);
      expect(snap().error).toMatch(/could not reach/i);
    });

    it('marks everything read, device events included', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' }), row({ _id: 'b', read: true })]));
      notificationFeed.bind(OWNER);
      await settle();
      apiStub.send.mockResolvedValue({ ok: true, data: { ok: false, skipped: true, reason: 'nope' } });
      notificationFeed.pushDevice({ kind: 'system', title: 'local', body: '' });

      expect(await notificationFeed.markAllRead()).toBe(true);
      expect(snap().items.every((i) => i.read)).toBe(true);
      expect(snap().unreadCount).toBe(0);
      expect(snap().devices.every((d) => d.read)).toBe(true);
      expect(feedUnread(snap())).toBe(0);
    });

    it('restores the unread state when the server refuses mark-all-read', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' }), row({ _id: 'b' })], { total: 2, unreadCount: 2 }));
      notificationFeed.bind(OWNER);
      await settle();
      apiStub.send.mockResolvedValue({ ok: true, data: { ok: false, skipped: true, reason: 'nope' } });
      notificationFeed.pushDevice({ kind: 'system', title: 'local', body: '' });
      await settle();

      apiStub.markAllRead.mockResolvedValueOnce({ ok: false, error: 'server down' });
      expect(await notificationFeed.markAllRead()).toBe(false);

      expect(snap().items.every((i) => i.read)).toBe(false);
      expect(snap().devices.every((d) => d.read)).toBe(false);
      expect(snap().unreadCount).toBe(2);
      expect(snap().error).toMatch(/server down/i);
    });
  });

  describe('dismissing', () => {
    it('archives the row instead of marking it read, and adjusts the totals it owns', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' }), row({ _id: 'b' })], { total: 40, unreadCount: 2 }));
      notificationFeed.bind(OWNER);
      await settle();

      expect(await notificationFeed.dismiss('a')).toBe(true);

      expect(apiStub.archive).toHaveBeenCalledWith('a');
      expect(apiStub.markRead).not.toHaveBeenCalled();
      expect(snap().items.map((i) => i._id)).toEqual(['b']);
      expect(snap().total).toBe(39);
      expect(snap().loadedCount).toBe(1);
      expect(snap().unreadCount).toBe(1);
    });

    it('puts a refused dismissal back exactly where it was', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' }), row({ _id: 'b' }), row({ _id: 'c' })], { total: 3, unreadCount: 3 }));
      notificationFeed.bind(OWNER);
      await settle();

      apiStub.archive.mockResolvedValueOnce({ ok: false, error: 'forbidden' });
      expect(await notificationFeed.dismiss('b')).toBe(false);

      expect(snap().items.map((i) => i._id)).toEqual(['a', 'b', 'c']);
      expect(snap().total).toBe(3);
      expect(snap().loadedCount).toBe(3);
      expect(snap().unreadCount).toBe(3);
      expect(snap().error).toMatch(/forbidden/i);
    });

    it('drops a device-only event locally, where there is nothing to archive', async () => {
      notificationFeed.bind(OWNER);
      await settle();
      apiStub.send.mockResolvedValue({ ok: true, data: { ok: false, skipped: true, reason: 'nope' } });
      const id = notificationFeed.pushDevice({ kind: 'system', title: 'local', body: '' });

      expect(await notificationFeed.dismiss(id)).toBe(true);
      expect(apiStub.archive).not.toHaveBeenCalled();
      expect(snap().devices).toEqual([]);
    });

    it('refuses a key the feed does not know', async () => {
      notificationFeed.bind(OWNER);
      await settle();
      expect(await notificationFeed.dismiss('nonexistent')).toBe(false);
    });
  });

  describe('paging', () => {
    it('asks for the next offset and does not duplicate rows a shifting server page repeated', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' })], { total: 3 }));
      notificationFeed.bind(OWNER);
      await settle();

      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' }), row({ _id: 'b' }), row({ _id: 'c' })], { total: 3, unreadCount: 2 }));
      expect(await notificationFeed.loadMore()).toBe(true);

      expect(apiStub.list).toHaveBeenLastCalledWith({ limit: PAGE_LIMIT, offset: 1 });
      expect(snap().items.map((i) => i._id)).toEqual(['a', 'b', 'c']);
      expect(snap().loadedCount).toBe(3);
      // The second page reported fewer unread than the first had counted; take
      // the larger rather than trusting one page's arithmetic.
      expect(snap().unreadCount).toBe(2);
    });

    it('stops at the end of the account', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' })], { total: 1 }));
      notificationFeed.bind(OWNER);
      await settle();

      expect(await notificationFeed.loadMore()).toBe(false);
      expect(apiStub.list).toHaveBeenCalledTimes(1);
    });

    it('reports a failed page without emptying the rows already loaded', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' })], { total: 5 }));
      notificationFeed.bind(OWNER);
      await settle();

      apiStub.list.mockResolvedValueOnce({ ok: false, error: 'timeout' });
      expect(await notificationFeed.loadMore()).toBe(false);
      expect(snap().items).toHaveLength(1);
      expect(snap().error).toMatch(/timeout/i);
    });
  });

  describe('live pushes', () => {
    it('folds a socket push in once, and counts its unread exactly once', async () => {
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'a' })], { total: 1, unreadCount: 1 }));
      notificationFeed.bind(OWNER);
      await settle();

      const pushed = row({ _id: 'new', createdAt: new Date().toISOString() });
      for (const listener of socketStub.listeners) listener(pushed);
      await settle();
      for (const listener of socketStub.listeners) listener(pushed);
      await settle();

      expect(snap().items.map((i) => i._id)).toEqual(['new', 'a']);
      expect(snap().unreadCount).toBe(2);
      expect(snap().total).toBe(2);
    });

    it('keeps an already-read row read when the server re-sends it', async () => {
      notificationFeed.bind(OWNER);
      await settle();
      for (const listener of socketStub.listeners) listener(row({ _id: 'x', read: true }));
      await settle();

      expect(snap().unreadCount).toBe(0);
      expect(snap().items[0].read).toBe(true);

      // A re-send that claims it is unread must not resurrect a badge the user
      // already cleared — the REST page is the read-state authority.
      apiStub.list.mockResolvedValueOnce(page([row({ _id: 'x', read: true })]));
      await notificationFeed.refresh();
      for (const listener of socketStub.listeners) listener(row({ _id: 'x', read: false }));
      await settle();

      expect(snap().items[0].read).toBe(true);
      expect(snap().unreadCount).toBe(0);
    });

    it('ignores a push with no id', async () => {
      notificationFeed.bind(OWNER);
      await settle();
      for (const listener of socketStub.listeners) listener({ title: 'anonymous' });
      await settle();
      expect(snap().items).toEqual([]);
    });
  });

  describe('device-raised events', () => {
    it('shows the event immediately, then replaces it with the server row', async () => {
      notificationFeed.bind(OWNER);
      await settle();
      apiStub.send.mockResolvedValue({ ok: true, data: { ok: true, notificationId: 'srv-9' } });

      notificationFeed.pushDevice({ kind: 'security', title: 'Wallet disconnected', body: '3 failed' });

      expect(snap().devices).toHaveLength(1);
      expect(snap().devices[0].sync).toBe('pending');
      // One unread either way: a pending device row and a server row are the
      // same event, and the badge must not show two.
      expect(feedUnread(snap())).toBe(1);
      await settle();

      expect(snap().devices).toEqual([]);
      expect(snap().items.map((i) => i._id)).toEqual(['srv-9']);
      expect(feedUnread(snap())).toBe(1);
      expect(snap().unreadCount).toBe(1);
    });

    it('labels an event the server refused as device-only, with the server’s reason', async () => {
      notificationFeed.bind(OWNER);
      await settle();
      // The strings here are the dispatcher's own (notificationDispatcher.js
      // returns `error: 'Notifications disabled'` etc), passed through by
      // routes/notifications.js POST /send as `reason` — the UI prints them raw.
      apiStub.send.mockResolvedValue({ ok: true, data: { ok: false, skipped: true, reason: 'Notifications disabled' } });

      const id = notificationFeed.pushDevice({ kind: 'marketing', title: 'Campaign', body: '' });
      await settle();

      expect(snap().devices.map((d) => d.id)).toEqual([id]);
      expect(snap().devices[0].sync).toBe('unsynced');
      expect(snap().devices[0].reason).toBe('Notifications disabled');
      expect(snap().items).toEqual([]);
    });

    it('turns a bare status code into a sentence, kept for support', async () => {
      notificationFeed.bind(OWNER);
      await settle();

      apiStub.send.mockResolvedValue({ ok: false, error: 'HTTP 502' });
      notificationFeed.pushDevice({ kind: 'system', title: 'x', body: '' });
      await settle();
      // The reason lands mid-sentence ("Not saved to your account — …"), so it
      // gets the plain words plus the code, and no trailing full stop.
      expect(snap().devices[0].reason).toBe('the notification service could not be reached (HTTP 502)');

      // The failure band is shown on its own line, so it keeps its period.
      apiStub.list.mockResolvedValueOnce({ ok: false, error: 'HTTP 503' });
      expect(await notificationFeed.refresh()).toBe(false);
      expect(snap().error).toBe('Could not load your notifications. (HTTP 503).');
    });

    it('labels it device-only when the request never lands', async () => {
      notificationFeed.bind(OWNER);
      await settle();
      apiStub.send.mockRejectedValue(new Error('network'));

      notificationFeed.pushDevice({ kind: 'system', title: 'x', body: '' });
      await settle();

      expect(snap().devices[0].sync).toBe('unsynced');
      expect(snap().devices[0].reason).toMatch(/could not be reached/i);
    });

    it('does not let a late send confirm onto the next account', async () => {
      let release: (value: { ok: true; data: { ok: true; notificationId: string } }) => void = () => {};
      apiStub.send.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
      notificationFeed.bind(OWNER);
      await settle();

      notificationFeed.pushDevice({ kind: 'system', title: 'held', body: '' });
      notificationFeed.reset();
      notificationFeed.bind(OTHER);
      apiStub.list.mockResolvedValueOnce(page([]));
      await settle();

      release({ ok: true, data: { ok: true, notificationId: 'late' } });
      await settle();

      expect(snap().devices).toEqual([]);
      expect(snap().items).toEqual([]);
    });

    it('marks a device event read locally, which is all it can be', async () => {
      notificationFeed.bind(OWNER);
      await settle();
      apiStub.send.mockResolvedValue({ ok: false, error: 'unreachable' });
      const id = notificationFeed.pushDevice({ kind: 'system', title: 'local', body: '' });

      notificationFeed.markDeviceRead(id);
      expect(snap().devices[0].read).toBe(true);
      expect(feedUnread(snap())).toBe(0);
      expect(apiStub.markRead).not.toHaveBeenCalled();
    });
  });

  describe('entries', () => {
    it('orders both sources newest first and tags their origin', async () => {
      const now = Date.now();
      apiStub.list.mockResolvedValueOnce(page([
        row({ _id: 'old', createdAt: new Date(now - 5_000).toISOString() }),
        row({ _id: 'fresh', createdAt: new Date(now - 1_000).toISOString() }),
      ]));
      notificationFeed.bind(OWNER);
      await settle();
      apiStub.send.mockResolvedValue({ ok: false, error: 'x' });
      notificationFeed.pushDevice({ kind: 'system', title: 'middle', body: '', metadata: { a: 1 } });
      // the device row is stamped "now", so: fresh, device, old
      await settle();

      const keys = feedEntries(snap()).map((e) => [e.source, e.title] as const);
      // The device event is stamped "now", so it is the newest row on screen.
      expect(keys).toEqual([
        ['device', 'middle'],
        ['server', 'title fresh'],
        ['server', 'title old'],
      ]);
      expect(feedEntries(snap()).find((e) => e.source === 'device')?.sync).toBe('unsynced');
    });
  });

  describe('grouping', () => {
    it('labels days the way a person reads them', () => {
      const now = new Date('2026-11-09T15:00:00');
      const at = (daysAgo: number, hours = 12) =>
        new Date(now.getTime() - daysAgo * 86_400_000 - hours * 3_600_000).toISOString();
      const entry = (iso: string) => feedEntries({
        ...snap(),
        items: [row({ _id: 'x', createdAt: iso })],
        devices: [],
      });

      // Only Today/Yesterday are literals. Beyond that the formatter deliberately
      // passes `[]` as the locale (see groupByDay's comment: "matching how a
      // person reads 'yesterday'"), so the *spelling* belongs to the reader's
      // locale — this suite runs under whatever LANG the host has, which is
      // en_US here and en_GB where the '30 September' expectation was written.
      // What this test owns is the option set per bucket: a long weekday under a
      // week, long month + day inside the current year, plus the year only once
      // the row is in a different year.
      const at3 = at(3);
      const at40 = at(40);
      const at400 = at(400);
      const sections = groupByDay([...entry(at(0)), ...entry(at(1)), ...entry(at3), ...entry(at40), ...entry(at400)], now.getTime());
      expect(sections.map((s) => s.label)).toEqual([
        'Today',
        'Yesterday',
        new Date(at3).toLocaleDateString([], { weekday: 'long' }),
        new Date(at40).toLocaleDateString([], { month: 'long', day: 'numeric' }),
        new Date(at400).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }),
      ]);
      // The two ways this regressed: a 40-day row degrading to a relative "8d"
      // style label, and a 400-day row losing the year that disambiguates it.
      expect(sections[3]!.label).not.toMatch(/\d+d$/);
      expect(sections[4]!.label).toContain('2025');
      expect(new Set(sections.map((s) => s.label)).size).toBe(5);
    });

    it('is honest about a timestamp that is not one', () => {
      expect(timeAgo('not a date')).toBe('');
      expect(timeAgo(new Date().toISOString())).toBe('just now');
      expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5m');
      expect(timeAgo(new Date(Date.now() - 5 * 3_600_000).toISOString())).toBe('5h');
      expect(timeAgo(new Date(Date.now() - 5 * 86_400_000).toISOString())).toBe('5d');
    });
  });
});

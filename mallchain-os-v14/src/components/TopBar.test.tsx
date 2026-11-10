import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TopBar from './TopBar';
import { store } from '../store/store';
import { toastBus } from './ui';
import { settingsApi } from '../services/settingsApi';

// The bell's feed, the socket pill and the palette each have their own tests;
// this file is about the settings menu and nothing else.
vi.mock('./SocketStatus', () => ({ default: () => <span data-testid="stub-socket" /> }));
vi.mock('./CommandPalette', () => ({ openCommandPalette: vi.fn() }));
vi.mock('../services/maintenanceApi', () => ({
  useMaintenanceStatus: () => ({ global: false, scopes: {}, reason: '' }),
  isScopePaused: () => false,
}));
vi.mock('../services/notificationFeed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/notificationFeed')>();
  return {
    ...actual,
    useNotificationFeed: () => ({
      state: { items: [], total: 0, loading: false, error: null, loadedCount: 0 },
      entries: [],
      unread: 0,
      hasMore: false,
      feed: {
        markAllRead: vi.fn(async () => true),
        markRead: vi.fn(async () => true),
        markDeviceRead: vi.fn(),
        dismiss: vi.fn(async () => true),
        refresh: vi.fn(async () => {}),
        getSnapshot: () => ({ error: null }),
      },
    }),
  };
});
vi.mock('../services/settingsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/settingsApi')>();
  return { ...actual, settingsApi: { get: vi.fn(), update: vi.fn(), reset: vi.fn() } };
});
vi.mock('../services/api', () => ({
  api: { get: vi.fn(async () => ({ ok: true, data: { base: 'USD', currencies: [] } })), put: vi.fn(), post: vi.fn() },
}));

const update = vi.mocked(settingsApi.update);

const toasts: string[] = [];
const hearToast = (t: { text: string }) => { toasts.push(t.text); };
const accentVars = () => ['--accent', '--accent-2', '--accent-rgb'].map((k) => document.documentElement.style.getPropertyValue(k));

function openSettingsMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
}

describe('TopBar settings menu', () => {
  beforeEach(() => {
    localStorage.clear();
    toasts.length = 0;
    toastBus.listeners.add(hearToast);
    store.state.user.authed = true;
    store.state.user.id = 'u1';
    store.state.prefs.accent = 'gold';
    store.state.prefs.currency = 'USD';
    store.state.prefs.lang = 'EN';
    store.commit();
    for (const k of ['--accent', '--accent-2', '--accent-rgb']) document.documentElement.style.removeProperty(k);
    document.documentElement.style.setProperty('--accent', '#f3ba2f');
    document.documentElement.style.setProperty('--accent-2', '#f59e0b');
    document.documentElement.style.setProperty('--accent-rgb', '243, 186, 47');
    render(<TopBar navigate={() => {}} />);
  });

  afterEach(() => {
    toastBus.listeners.delete(hearToast);
    cleanup();
    vi.clearAllMocks();
  });

  test('a theme pick is written to the account, not just painted', async () => {
    openSettingsMenu();
    update.mockResolvedValue({ ok: true, data: undefined } as never);

    fireEvent.click(screen.getByRole('button', { name: 'emerald' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith({ prefs: { accent: 'emerald' } }));
    await waitFor(() => expect(accentVars()).toEqual(['#34d399', '#10b981', '52, 211, 153']));
    expect(store.state.prefs.accent).toBe('emerald');
  });

  test('a refused pick reverts and reports the refusal', async () => {
    openSettingsMenu();
    update.mockResolvedValue({ ok: false, error: 'Your session expired.' } as never);

    fireEvent.click(screen.getByRole('button', { name: 'purple' }));

    await waitFor(() => expect(store.state.prefs.accent).toBe('gold'));
    expect(accentVars()).toEqual(['#f3ba2f', '#f59e0b', '243, 186, 47']);
    expect(toasts).toContain('Your session expired.');
  });

  test('currency and language picks are saved too', async () => {
    openSettingsMenu();
    update.mockResolvedValue({ ok: true, data: undefined } as never);

    fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
    fireEvent.click(screen.getByRole('button', { name: 'SW' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith({ prefs: { currency: 'EUR' } }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ prefs: { lang: 'SW' } }));
    expect(store.state.prefs.currency).toBe('EUR');
    expect(store.state.prefs.lang).toBe('SW');
    expect(document.documentElement.lang).toBe('sw');
  });
});

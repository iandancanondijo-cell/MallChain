import { act } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Settings from './Settings';
import { STEPS } from './sections/order';
import { store } from '../../store/store';
import { toastBus } from '../../components/ui';
import { settingsApi, type UserSettingsData } from '../../services/settingsApi';
import { minesApi } from '../../services/minesApi';
import { kycApi } from '../../services/kycApi';
import { badgeApi } from '../../services/badgeApi';
import { authService } from '../../services/auth';
import type { ApiResult } from '../../services/api';

// Settings owns the page: the order, the four reads behind every card, and the
// one write path they share. The panels it embeds each have their own suite, so
// they are stubbed here — but the stubs still receive the real props, so a
// page-level wiring mistake cannot hide behind them.
vi.mock('./components/SessionManager', () => ({ SessionManager: () => <div data-testid="stub-session" /> }));
vi.mock('./components/LoginActivity', () => ({ LoginActivityComponent: () => <div data-testid="stub-login" /> }));
vi.mock('./components/EmailManagement', () => ({ EmailManagement: () => <div data-testid="stub-email" /> }));
vi.mock('./components/APIKeyManager', () => ({ APIKeyManager: () => <div data-testid="stub-keys" /> }));
vi.mock('./components/SocialAccounts', () => ({ SocialAccounts: () => <div data-testid="stub-social" /> }));
// One button that fires the real callback: what the grid looks like is that
// panel's business, but the merge and the rollback belong to this page.
vi.mock('./components/NotificationsPanel', () => ({
  NotificationsPanel: ({ onCellChange }: { onCellChange: (c: string, k: string, v: boolean) => void }) => (
    <button type="button" onClick={() => onCellChange('email', 'transactions', false)}>stub-cell</button>
  ),
}));
// The picker's fetch-and-confirm cycle has its own suite (AvatarUpload.test.tsx).
// Here it stands for the contract the page relies on: the path the server
// confirms is handed up, and the page renders from it.
vi.mock('./AvatarUpload', () => ({
  AvatarPicker: ({ storedUrl, name, onStored }: {
    storedUrl: string | null;
    name: string;
    onStored: (stored: string | null) => void;
  }) => (
    <div data-testid="stub-avatar">
      <span data-testid="avatar-stored">{storedUrl ?? 'none'}</span>
      <span data-testid="avatar-name">{name}</span>
      <button type="button" onClick={() => onStored('/uploads/avatars/ada-1-me.png')}>stub-upload</button>
    </div>
  ),
}));
vi.mock('../wallet/walletGate', () => ({
  useWalletGate: () => ({
    gate: { state: 'allowed', allowed: true, blocked: false, message: '', action: null, restoreOnly: false, restoreAddress: null },
    refresh: vi.fn(),
  }),
  reportLinkFailure: vi.fn(),
  linkAttemptGuard: () => null,
}));

vi.mock('../../services/settingsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/settingsApi')>();
  return {
    ...actual,
    settingsApi: {
      get: vi.fn(), update: vi.fn(), reset: vi.fn(),
      setup2fa: vi.fn(), enable2fa: vi.fn(), disable2fa: vi.fn(), changePassword: vi.fn(),
      getContact: vi.fn(), updateContact: vi.fn(), sendPhoneOtp: vi.fn(), verifyPhone: vi.fn(),
      optInWhatsApp: vi.fn(), optOutWhatsApp: vi.fn(),
    },
  };
});
vi.mock('../../services/minesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/minesApi')>();
  return { ...actual, minesApi: { getProfile: vi.fn(), updateProfile: vi.fn() } };
});
vi.mock('../../services/kycApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/kycApi')>();
  return { ...actual, kycApi: { getStatus: vi.fn(), fetchDocumentBlobUrl: vi.fn() } };
});
vi.mock('../../services/badgeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/badgeApi')>();
  return { ...actual, badgeApi: { getConfig: vi.fn(), reserve: vi.fn(), getStatus: vi.fn(), initiateMpesa: vi.fn() } };
});
vi.mock('../../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/auth')>();
  return { ...actual, authService: { linkWallet: vi.fn() } };
});
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn(async (url: string) => ({ ok: true, data: routePayload(url) })),
    put: vi.fn(async () => ({ ok: true, data: {} })),
    post: vi.fn(async () => ({ ok: true, data: {} })),
  },
}));

const update = vi.mocked(settingsApi.update);
const readSettings = vi.mocked(settingsApi.get);
const getContact = vi.mocked(settingsApi.getContact);
const changePassword = vi.mocked(settingsApi.changePassword);
const getProfile = vi.mocked(minesApi.getProfile);
const updateProfile = vi.mocked(minesApi.updateProfile);
const getStatus = vi.mocked(kycApi.getStatus);
const readBadge = vi.mocked(badgeApi.getConfig);
void authService;

function routePayload(url: string) {
  if (url.includes('/api/auth/me')) {
    return { user: { name: 'Ada O.', username: 'ada', email: 'ada@example.com', avatarUrl: store.state.user.avatarUrl } };
  }
  if (url.includes('/api/fx/currencies')) return { base: 'USD', currencies: ['KES', 'NGN'] };
  return {};
}

// Toasts go on a bus outside the rendered tree — nothing in a bare component
// test would show them — so the harness listens instead of asserting on DOM.
const toasts: string[] = [];
const hearToast = (t: { text: string }) => { toasts.push(t.text); };

const accentVars = () => ['--accent', '--accent-2', '--accent-rgb'].map((k) => document.documentElement.style.getPropertyValue(k));

function settingsDoc(over: Partial<UserSettingsData> = {}): UserSettingsData {
  const channel = { transactions: true, campaigns: false, governance: false, marketing: false, security: true, badgeAlerts: false };
  return {
    prefs: { accent: 'gold', currency: 'USD', lang: 'EN', theme: 'dark' },
    notifications: { email: { ...channel }, push: { ...channel }, sms: { ...channel }, whatsapp: { ...channel }, frequency: 'daily' },
    contactInfo: { phoneNumber: '+254712345678', phoneVerified: true, phoneVerifiedAt: null, whatsappOptIn: false, whatsappOptInAt: null, emailVerified: true, emailVerifiedAt: null },
    security: { twoFactorEnabled: false, sessionTimeout: null, loginNotifications: true, deviceManagement: true, trustedDevices: [] },
    privacy: { profileVisibility: 'public', showActivity: true, showBalance: false, allowMessages: true, dataSharing: false },
    display: { compactMode: false, showBalances: true, defaultView: 'dashboard', itemsPerPage: 20 },
    ...over,
  };
}

const PROFILE = {
  id: 'u1', username: 'ada', email: 'ada@example.com', phone: '+254700000000', name: 'Ada O.',
  mlpts_balance: 40, mallcoin_balance: 12, streak_count: 3, tasks_completed: 5, rank_points: 90,
};

const fail = { ok: false, error: 'The service is not reachable.' } as never;

/** Every read answers — the state most of these tests start from. */
function readsOk(doc: UserSettingsData = settingsDoc()) {
  getProfile.mockResolvedValue({ ok: true, data: PROFILE } as never);
  readSettings.mockResolvedValue({ ok: true, data: doc } as never);
  getStatus.mockResolvedValue({ ok: true, data: { status: 'approved', kycId: 'k1' } } as never);
  getContact.mockResolvedValue({ ok: true, data: doc.contactInfo } as never);
  readBadge.mockResolvedValue({ ok: true, data: { priceKes: 17, providerMode: 'stub' } } as never);
}

async function renderOk(doc: UserSettingsData = settingsDoc()) {
  readsOk(doc);
  render(<Settings />);
  await waitFor(() => expect(screen.queryByText('reading your account…')).toBeNull());
}

const stepsRendered = () => Array.from(document.querySelectorAll<HTMLElement>('.ps-step'))
  .map((el) => ({ index: Number(el.dataset.index), id: el.id, label: el.getAttribute('aria-label') }));

const navButtons = () => Array.from(document.querySelectorAll<HTMLElement>('.ps-nav button'));

const navLabel = (button: HTMLElement) => (button.textContent ?? '').replace(/^\d{2}/, '').trim();

describe('Profile & Settings', () => {
  beforeEach(() => {
    localStorage.clear();
    toasts.length = 0;
    toastBus.listeners.add(hearToast);
    const st = store.state;
    st.user.authed = true;
    st.user.id = 'u1';
    st.user.name = 'Ada O.';
    st.user.hasBadge = false;
    st.user.avatarUrl = null;
    st.wallet.address = 'mall1qv9pzxqlyckngw6zf9g9whn9d3eh4qvg6yv336';
    st.prefs.accent = 'gold';
    st.prefs.currency = 'USD';
    st.prefs.lang = 'EN';
    store.commit();
    for (const k of ['--accent', '--accent-2', '--accent-rgb']) document.documentElement.style.removeProperty(k);
  });

  afterEach(() => {
    toastBus.listeners.delete(hearToast);
    cleanup();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------- the order

  test('the cards are the declared steps, in the declared order, each exactly once', async () => {
    await renderOk();
    expect(stepsRendered()).toEqual(STEPS.map((s) => ({ index: s.index, id: s.id, label: `${s.index}. ${s.label}` })));
  });

  test('the step list offers the same fourteen, in the same order', async () => {
    await renderOk();
    expect(navButtons().map(navLabel)).toEqual(STEPS.map((s) => s.label));
  });

  test('the rail marks amber exactly the steps whose read did not arrive', async () => {
    getProfile.mockResolvedValue({ ok: true, data: PROFILE } as never);
    readSettings.mockResolvedValue({ ok: true, data: settingsDoc() } as never);
    getStatus.mockResolvedValue(fail);
    getContact.mockResolvedValue(fail);
    readBadge.mockResolvedValue({ ok: true, data: { priceKes: 17 } } as never);
    render(<Settings />);
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));

    const unread = navButtons()
      .filter((b) => b.querySelector('.dot')?.getAttribute('data-state') === 'unread')
      .map(navLabel);
    // Identity needs the KYC record and Contact needs the contact record. Nothing
    // else on the page depends on either, so nothing else is allowed to go amber.
    expect(unread).toEqual(['Identity details', 'Contact number']);
  });

  // -------------------------------------------------------- what did not load

  test('says which reads are still in flight instead of painting dashes', async () => {
    getProfile.mockReturnValue(new Promise<ApiResult<never>>(() => {}));
    readSettings.mockReturnValue(new Promise<ApiResult<never>>(() => {}));
    getStatus.mockReturnValue(new Promise<ApiResult<never>>(() => {}));
    getContact.mockReturnValue(new Promise<ApiResult<never>>(() => {}));
    readBadge.mockReturnValue(new Promise<ApiResult<never>>(() => {}));
    render(<Settings />);
    // waitFor keeps the settle of the one call that still answers — the
    // currency list — inside act().
    await waitFor(() => expect(screen.getByText('reading your account…')).toBeTruthy());
    expect(screen.queryByText('Some of this page could not be read')).toBeNull();
  });

  test('names every section that could not be read, and one Retry clears them', async () => {
    getProfile.mockRejectedValue(new Error('offline'));
    readSettings.mockResolvedValue(fail);
    getStatus.mockResolvedValue(fail);
    getContact.mockRejectedValue(new Error('offline'));
    render(<Settings />);

    const banner = await screen.findByRole('alert');
    expect(within(banner).getByText(/Your profile/)).toBeTruthy();
    expect(within(banner).getByText(/preferences, notifications, privacy and security/)).toBeTruthy();
    expect(within(banner).getByText(/identity verification record/)).toBeTruthy();
    expect(within(banner).getByText(/verified contact number/)).toBeTruthy();
    // A card with nothing to show says so instead of rendering blanks.
    expect(screen.queryByLabelText('Show my balance to others')).toBeNull();
    expect(screen.getAllByText(/Not loaded:/).length).toBeGreaterThan(0);

    readsOk();
    fireEvent.click(within(banner).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(getProfile.mock.calls.length).toBe(2);
    expect(screen.getByLabelText('Show my balance to others')).toBeTruthy();
  });

  test('a card whose data is missing keeps its own retry and guesses nothing', async () => {
    readsOk();
    getStatus.mockResolvedValue(fail);
    render(<Settings />);
    await waitFor(() => expect(screen.queryByText('reading your account…')).toBeNull());

    const identity = document.getElementById('ps-identity');
    if (!identity) throw new Error('the identity step did not render');
    expect(within(identity).getByText(/identity verification record/)).toBeTruthy();
    // Nothing on that card may claim a verdict the read cannot support.
    expect(within(identity).queryByText(/Verified/)).toBeNull();
  });

  test('a switched account re-reads instead of keeping the previous person on screen', async () => {
    await renderOk();
    expect(screen.getByDisplayValue('ada')).toBeTruthy();

    // The second read is held open on purpose: what is on screen *while* it is
    // in flight is the whole point — u1's handle must already be gone.
    let release!: (v: ApiResult<never>) => void;
    getProfile.mockReturnValue(new Promise<ApiResult<never>>((r) => { release = r; }) as never);

    const st = store.state;
    act(() => {
      st.user.id = 'u2';
      store.commit();
    });

    await waitFor(() => expect(getProfile.mock.calls.length).toBe(2));
    expect(screen.queryByDisplayValue('ada')).toBeNull();
    expect(screen.queryByText('40 MLPTS')).toBeNull();

    release({ ok: true, data: { ...PROFILE, id: 'u2', username: 'ben' } } as never);
    await waitFor(() => expect(screen.getByDisplayValue('ben')).toBeTruthy());
  });

  // ---------------------------------------------------------------- writes

  test('an accepted accent write updates all three theme variables', async () => {
    await renderOk();
    update.mockResolvedValue({ ok: true, data: settingsDoc({ prefs: { accent: 'emerald', currency: 'USD', lang: 'EN', theme: 'dark' } }) } as never);

    fireEvent.click(screen.getByRole('button', { name: 'emerald' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith({ prefs: { accent: 'emerald' } }));
    expect(store.state.prefs.accent).toBe('emerald');
    await waitFor(() => expect(accentVars()).toEqual(['#34d399', '#10b981', '52, 211, 153']));
  });

  test('a refused accent write rolls the theme back and says so', async () => {
    await renderOk();
    update.mockResolvedValue({ ok: false, error: 'Only the account owner can change this.' } as never);

    fireEvent.click(screen.getByRole('button', { name: 'emerald' }));

    await waitFor(() => expect(store.state.prefs.accent).toBe('gold'));
    expect(accentVars()).toEqual(['#f3ba2f', '#f59e0b', '243, 186, 47']);
    expect(screen.getByRole('button', { name: 'gold' }).className).toContain('btn-primary');
    expect(toasts).toContain('Only the account owner can change this.');
  });

  test('what the server stored wins over what was asked for', async () => {
    await renderOk();
    update.mockResolvedValue({ ok: true, data: settingsDoc({ prefs: { accent: 'cyan', currency: 'USD', lang: 'EN', theme: 'dark' } }) } as never);

    fireEvent.click(screen.getByRole('button', { name: 'emerald' }));

    await waitFor(() => expect(store.state.prefs.accent).toBe('cyan'));
    expect(accentVars()[0]).toBe('#22d3ee');
    expect(toasts).toContain('Accent → cyan — the account kept that instead.');
  });

  test('a refused privacy write reverts the switch', async () => {
    await renderOk();
    const balance = screen.getByLabelText('Show my balance to others') as HTMLInputElement;
    expect(balance.checked).toBe(false);

    update.mockResolvedValue({ ok: false, error: 'Settings are locked while 2FA is pending.' } as never);
    fireEvent.click(balance);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ privacy: expect.objectContaining({ showBalance: true }) }));
    await waitFor(() => expect(balance.checked).toBe(false));
    expect(toasts).toContain('Settings are locked while 2FA is pending.');
  });

  test('an accepted privacy write keeps the merged document the server returns', async () => {
    await renderOk();
    const saved = settingsDoc({ privacy: { profileVisibility: 'public', showActivity: false, showBalance: true, allowMessages: true, dataSharing: false } });
    update.mockResolvedValue({ ok: true, data: saved } as never);

    const activity = screen.getByLabelText('Show my activity') as HTMLInputElement;
    fireEvent.click(activity);

    await waitFor(() => expect(activity.checked).toBe(false));
    // showBalance came from the response, not from anything clicked here.
    expect((screen.getByLabelText('Show my balance to others') as HTMLInputElement).checked).toBe(true);
  });

  test('a notification cell writes the whole channel, not just the cell', async () => {
    await renderOk();
    update.mockResolvedValue({ ok: true, data: settingsDoc() } as never);

    fireEvent.click(screen.getByRole('button', { name: 'stub-cell' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const patch = update.mock.calls[0][0];
    expect(patch.notifications?.email).toEqual({
      transactions: false, campaigns: false, governance: false, marketing: false, security: true, badgeAlerts: false,
    });
    // A section the patch never mentions must not be in it at all: the route
    // merges per section, so anything present is a section being written.
    expect(patch.privacy).toBeUndefined();
    expect(toasts).toContain('Email alert saved.');
  });

  test('a refused notification write says so and leaves the document as it was', async () => {
    await renderOk();
    update.mockResolvedValue({ ok: false, error: 'Settings are locked while 2FA is pending.' } as never);

    fireEvent.click(screen.getByRole('button', { name: 'stub-cell' }));

    await waitFor(() => expect(toasts).toContain('Settings are locked while 2FA is pending.'));
    expect((screen.getByLabelText('Show my balance to others') as HTMLInputElement).checked).toBe(false);
  });

  test('a write attempted before the document arrives sends nothing', async () => {
    getProfile.mockResolvedValue({ ok: true, data: PROFILE } as never);
    getStatus.mockResolvedValue({ ok: true, data: { status: 'approved' } } as never);
    getContact.mockResolvedValue({ ok: true, data: settingsDoc().contactInfo } as never);
    readBadge.mockResolvedValue({ ok: true, data: { priceKes: 17 } } as never);
    readSettings.mockReturnValue(new Promise<ApiResult<never>>(() => {}));
    render(<Settings />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'stub-cell' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'stub-cell' }));

    await waitFor(() => expect(toasts).toContain('Your settings are still loading — try again in a second.'));
    expect(update).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------- profile

  test('Save changes waits for an actual edit and refuses an unparsable phone', async () => {
    await renderOk();
    const save = screen.getByRole('button', { name: /Save changes/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/Nothing to save/)).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('ada'), { target: { value: 'ada2' } });
    await waitFor(() => expect(save.disabled).toBe(false));

    fireEvent.change(screen.getByDisplayValue('+254700000000'), { target: { value: '0712 345 678' } });
    fireEvent.click(save);
    await waitFor(() => expect(toasts.some((t) => /international format/.test(t))).toBe(true));
    expect(updateProfile).not.toHaveBeenCalled();
  });

  test('a clean profile edit sends exactly the two edited fields', async () => {
    await renderOk();
    updateProfile.mockResolvedValue({ ok: true, data: PROFILE } as never);

    fireEvent.change(screen.getByDisplayValue('ada'), { target: { value: 'ada-ii' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ username: 'ada-ii', phone: '+254700000000' }));
  });

  test('the two phone fields say which one receives codes', async () => {
    await renderOk();
    // The Profile card's number is decoration; the Contact card's is the one
    // the gateways dial. The old page called both of them "Phone".
    expect(screen.getByLabelText('Display phone number')).toBeTruthy();
    expect(screen.getByLabelText('Contact number for codes')).toBeTruthy();
    expect(screen.getByText(/It does not receive codes/)).toBeTruthy();
    expect(screen.getByText(/number SMS and WhatsApp alerts are delivered to/)).toBeTruthy();
  });

  test('the picture the server confirms is what the account keeps', async () => {
    await renderOk();
    expect(screen.getByTestId('avatar-stored').textContent).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));

    await waitFor(() => expect(screen.getByTestId('avatar-stored').textContent).toBe('/uploads/avatars/ada-1-me.png'));
    // The store copy is what the menu bar and every other surface renders from.
    expect(store.state.user.avatarUrl).toBe('/uploads/avatars/ada-1-me.png');
  });

  test('the change-password modal gates on the rule the server enforces', async () => {
    await renderOk();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Change password' }) as HTMLButtonElement;

    fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: 'oldStr0ng' } });
    const next = within(dialog).getByLabelText('New password');
    const repeat = within(dialog).getByLabelText('Repeat new password');

    fireEvent.change(next, { target: { value: 'short' } });
    expect(submit.disabled).toBe(true);
    expect(within(dialog).getByText('○ a number')).toBeTruthy();

    fireEvent.change(next, { target: { value: 'Abcdefgh' } });
    expect(submit.disabled).toBe(true);
    expect(within(dialog).getByText('○ a number')).toBeTruthy();
    expect(within(dialog).getByText('✓ 8+ characters')).toBeTruthy();

    fireEvent.change(next, { target: { value: 'Abcdefg1' } });
    expect(within(dialog).getByText('✓ a number')).toBeTruthy();
    expect(submit.disabled).toBe(true);
    expect(within(dialog).getByText('The two new-password entries do not match.')).toBeTruthy();

    fireEvent.change(repeat, { target: { value: 'Abcdefg1' } });
    await waitFor(() => expect(submit.disabled).toBe(false));

    changePassword.mockResolvedValue({ ok: true, data: { changed: true } } as never);
    fireEvent.click(submit);
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('oldStr0ng', 'Abcdefg1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { SecuritySettings } from './SecuritySettings';
import { toastBus } from '../components/ui';
import { settingsApi, type UserSettingsData } from '../services/settingsApi';

// Everything on this page except the settings round trips belongs to another
// suite (CipherWall, vault recovery, key export, sessions).
vi.mock('../components/PrivateKeyExport', () => ({ default: () => <div data-testid="stub-export" /> }));
vi.mock('../components/CipherWall', () => ({
  CipherWall: () => <div data-testid="stub-cipher" />,
  CipherSetup: () => <div data-testid="stub-cipher-setup" />,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,x') } }));
vi.mock('../services/security', () => ({ verifyPin: vi.fn(), decryptMnemonic: vi.fn() }));
vi.mock('../features/wallet/credentialSave', () => ({ saveWalletCredential: vi.fn(async () => ({ ok: true })) }));
vi.mock('../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth')>();
  return { ...actual, authService: { signOutEverywhere: vi.fn(), getMe: vi.fn() } };
});
vi.mock('../services/mnemonicAccess', () => ({ requestMnemonic: vi.fn(async () => null) }));
vi.mock('../services/vaultRecovery', () => ({
  getStatus: vi.fn(async () => ({ found: false })),
  setupKeyRecovery: vi.fn(),
  confirmKeyRecovery: vi.fn(),
  testRecovery: vi.fn(),
  disableKeyRecovery: vi.fn(),
}));
vi.mock('../services/settingsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/settingsApi')>();
  return { ...actual, settingsApi: { get: vi.fn(), update: vi.fn(), reset: vi.fn() } };
});

const readSettings = vi.mocked(settingsApi.get);
const update = vi.mocked(settingsApi.update);

function settingsDoc(security: Partial<UserSettingsData['security']> = {}): UserSettingsData {
  const channel = { transactions: true, campaigns: false, governance: false, marketing: false, security: true, badgeAlerts: false };
  return {
    prefs: { accent: 'gold', currency: 'USD', lang: 'EN', theme: 'dark' },
    notifications: { email: { ...channel }, push: { ...channel }, sms: { ...channel }, whatsapp: { ...channel }, frequency: 'daily' },
    contactInfo: { phoneNumber: '+254712345678', phoneVerified: true, phoneVerifiedAt: null, whatsappOptIn: false, whatsappOptInAt: null, emailVerified: true, emailVerifiedAt: null },
    privacy: { publicProfile: false, showBalances: false, allowDiscoverability: false, searchIndexing: false, dataSharing: false, shareActivity: false, publicTransactions: false, personalizedAds: false },
    security: {
      twoFactorEnabled: false, biometricEnabled: false, sessionTimeout: 15, require2faForWithdrawals: false,
      hideBalanceByDefault: false, allowScreenshot: false, loginAlerts: true, withdrawalAlerts: true,
      ...security,
    },
    ui: { compactMode: false, animationsEnabled: true, fontSize: 'medium', sidebarCollapsed: false },
    experimental: { devMode: false, testnet: false, betaFeatures: false },
    createdAt: '', updatedAt: '',
  } as UserSettingsData;
}

const toasts: string[] = [];
const hearToast = (t: { text: string }) => { toasts.push(t.text); };

const timeoutButtons = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button.timeout-btn'))
    .map((b) => `${b.textContent?.trim()}:${b.className.includes('active') ? 'on' : 'off'}`);

beforeEach(() => {
  toasts.length = 0;
  toastBus.listeners.add(hearToast);
  readSettings.mockReset();
  update.mockReset();
  readSettings.mockResolvedValue({ ok: true, data: settingsDoc() } as never);
  update.mockImplementation(async () => ({ ok: true, data: settingsDoc() }) as never);
});

afterEach(() => {
  toastBus.listeners.delete(hearToast);
  cleanup();
});

describe('Security Settings — session timeout', () => {
  test('highlights what the account actually has saved, not a built-in guess', async () => {
    readSettings.mockResolvedValue({ ok: true, data: settingsDoc({ sessionTimeout: 30 }) } as never);
    render(<SecuritySettings />);
    await waitFor(() => expect(timeoutButtons()).toContain('30m:on'));
    expect(timeoutButtons()).toContain('15m:off');
  });

  test('an account with no saved preference has Default highlighted', async () => {
    readSettings.mockResolvedValue({ ok: true, data: settingsDoc({ sessionTimeout: null }) } as never);
    render(<SecuritySettings />);
    await waitFor(() => expect(timeoutButtons()).toContain('Default:on'));
  });

  test('a refused write does not leave the refused choice highlighted', async () => {
    render(<SecuritySettings />);
    await waitFor(() => expect(timeoutButtons()).toContain('15m:on'));

    update.mockResolvedValueOnce({ ok: false, error: 'Only the account owner can change this.' } as never);
    fireEvent.click(Array.from(document.querySelectorAll<HTMLButtonElement>('button.timeout-btn')).find((b) => b.textContent?.trim() === '5m')!);

    await waitFor(() => expect(timeoutButtons()).toContain('15m:on'));
    expect(timeoutButtons()).toContain('5m:off');
    expect(toasts).toContain('Only the account owner can change this.');
  });

  test('the server answer wins over the clicked value', async () => {
    render(<SecuritySettings />);
    await waitFor(() => expect(timeoutButtons()).toContain('15m:on'));

    update.mockResolvedValueOnce({ ok: true, data: settingsDoc({ sessionTimeout: 30 }) } as never);
    fireEvent.click(Array.from(document.querySelectorAll<HTMLButtonElement>('button.timeout-btn')).find((b) => b.textContent?.trim() === '5m')!);

    await waitFor(() => expect(timeoutButtons()).toContain('30m:on'));
    expect(timeoutButtons()).toContain('5m:off');
    expect(toasts[toasts.length - 1]).toContain('30');
  });

  test('clicking before the settings document arrives sends nothing', async () => {
    let release: ((v: unknown) => void) | null = null;
    readSettings.mockReturnValue(new Promise((resolve) => { release = resolve; }) as never);
    render(<SecuritySettings />);

    const five = Array.from(document.querySelectorAll<HTMLButtonElement>('button.timeout-btn')).find((b) => b.textContent?.trim() === '5m');
    if (five) fireEvent.click(five);

    expect(update).not.toHaveBeenCalled();
    release?.({ ok: true, data: settingsDoc() });
    await waitFor(() => expect(timeoutButtons()).toContain('15m:on'));
  });
});

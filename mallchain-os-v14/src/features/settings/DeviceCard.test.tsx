import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceCard } from './sections/DeviceCard';
import { useNetworkSnapshot } from '../../hooks/useNetworkIdentity';
import type { SettingsData, SettingsPatch } from './hooks/useSettingsData';
import type { UserSettingsData } from '../../services/settingsApi';

/**
 * What "Session length" is allowed to claim.
 *
 * The row used to print `settings.security.sessionTimeout` — the account's own
 * stored preference — which for every legacy document in the database is 120,
 * written before the control was narrowed to 5/15/30. The server caps that
 * preference at SESSION_TTL_MIN (utils/sessionPolicy.js), so the page promised
 * a four-hour session while the token expired in thirty minutes. These cases
 * pin the row to the server's answer, and pin the wording for the two times it
 * cannot have one.
 */

vi.mock('../../hooks/useNetworkIdentity', () => ({
  useNetworkSnapshot: vi.fn(),
  networkLabel: () => 'mainnet',
}));

function settingsDoc(sessionTimeout: number | null): UserSettingsData {
  return {
    prefs: { currency: 'USD', accent: 'default', lang: 'en' },
    display: {},
    privacy: {},
    notifications: { email: {}, push: {}, sms: {}, whatsapp: {} },
    security: { twoFactorEnabled: false, sessionTimeout, loginNotifications: true, deviceManagement: true, trustedDevices: [] },
  } as unknown as UserSettingsData;
}

function cardData(overrides: Partial<SettingsData> = {}): SettingsData {
  return {
    loading: false,
    loadedOnce: true,
    gaps: [],
    reload: vi.fn(async () => {}),
    profile: null,
    settings: settingsDoc(120),
    kyc: null,
    contact: null,
    sessionPolicy: null,
    has: () => true,
    setContact: vi.fn(),
    save: vi.fn(async (_patch: SettingsPatch, _label: string) => ({ ok: true, message: '' })),
    ...overrides,
  };
}

function sessionRow(): HTMLElement {
  return screen.getByText('Session length').closest('.flag-row') as HTMLElement;
}

/** The chip is the answer; the note under the label is allowed to discuss the
 *  stored preference, which is exactly what the cap explanation does. */
function sessionValue(): string {
  return (sessionRow().querySelector('.chip') as HTMLElement).textContent ?? '';
}

describe('DeviceCard — Session length', () => {
  it('states the lifetime the server signs with, not the stored preference', () => {
    vi.mocked(useNetworkSnapshot).mockReturnValue({ chainId: 'mallchain-1', isMainnet: true } as never);
    render(
      <DeviceCard
        data={cardData({
          sessionPolicy: { ttlMinutes: 30, renewsOnActivity: false, endsAt: null },
        })}
        onOpenSecurityPage={vi.fn()}
      />
    );

    expect(sessionValue()).toBe('30 minutes');
    // and it says why the two numbers disagree
    expect(sessionRow().textContent).toContain('Your saved preference is 120 minutes, but this service caps every session at 30');
  });

  it('does not print a countdown it cannot support when the session ends in the past', () => {
    vi.mocked(useNetworkSnapshot).mockReturnValue({ chainId: 'mallchain-1', isMainnet: true } as never);
    render(
      <DeviceCard
        data={cardData({
          sessionPolicy: { ttlMinutes: 30, renewsOnActivity: false, endsAt: new Date(Date.now() - 60_000).toISOString() },
        })}
        onOpenSecurityPage={vi.fn()}
      />
    );
    expect(sessionRow().textContent).not.toContain('ends in');
  });

  it('marks the number as unconfirmed when the policy read failed', () => {
    vi.mocked(useNetworkSnapshot).mockReturnValue({ chainId: 'mallchain-1', isMainnet: true } as never);
    render(<DeviceCard data={cardData({ sessionPolicy: null })} onOpenSecurityPage={vi.fn()} />);

    expect(sessionValue()).toBe('120 minutes (unconfirmed)');
    expect(sessionRow().textContent).toContain('could not be reached');
  });

  it('says "Service default" only when the account genuinely set nothing', () => {
    vi.mocked(useNetworkSnapshot).mockReturnValue({ chainId: 'mallchain-1', isMainnet: true } as never);
    render(
      <DeviceCard
        data={cardData({ settings: settingsDoc(null), sessionPolicy: null })}
        onOpenSecurityPage={vi.fn()}
      />
    );
    expect(sessionValue()).toBe('Service default');
  });
});

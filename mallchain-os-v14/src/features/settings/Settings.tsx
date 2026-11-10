import { useCallback, useMemo } from 'react';
import { toast, useStoreVersion } from '../../components/ui';
import { COLUMN_LABEL, type NotificationMatrixColumn } from '../../services/notificationPreferencesApi';
import { SessionManager } from './components/SessionManager';
import { LoginActivityComponent } from './components/LoginActivity';
import { EmailManagement } from './components/EmailManagement';
import { NotificationsPanel } from './components/NotificationsPanel';
import { APIKeyManager } from './components/APIKeyManager';
import { SocialAccounts } from './components/SocialAccounts';
import { useSettingsData, type SettingsPatch } from './hooks/useSettingsData';
import { Step } from './sections/Shell';
import { SettingsNav, type StepState } from './sections/SettingsNav';
import { STEPS } from './sections/order';
import { ProfileCard } from './sections/ProfileCard';
import { StatusCard } from './sections/StatusCard';
import { IdentityCard } from './sections/IdentityCard';
import { ContactCard } from './sections/ContactCard';
import { SecurityCard } from './sections/SecurityCard';
import { PrivacyCard } from './sections/PrivacyCard';
import { PreferencesCard } from './sections/PreferencesCard';
import { DeviceCard } from './sections/DeviceCard';
import '../../styles/profile-settings.css';

/**
 * Profile & Settings.
 *
 * Rebuilt from one 1134-line file whose cards sat in two columns in whatever
 * order they had been written. Same data and same rules — every control answers
 * to the server and shows what got stored rather than what was clicked — but the
 * arrangement is now explicit: fourteen numbered steps in one deliberate order
 * (sections/order.ts), all reading from the same four loads
 * (hooks/useSettingsData.ts), and a step whose data did not arrive says so
 * instead of rendering a dash that looks like an answer.
 */

const SECURITY_PAGE = 'security';

export default function Settings() {
  useStoreVersion();
  const data = useSettingsData();

  const openSecurityPage = useCallback(() => {
    window.location.hash = SECURITY_PAGE;
  }, []);

  // The notification grid is its own panel, but the write — and the rollback if
  // the server refuses it — stays here, so there is one writer per document.
  const onCellChange = useCallback(async (column: NotificationMatrixColumn, category: string, value: boolean) => {
    const current = data.settings;
    if (!current) {
      toast('Your settings are still loading — try again in a second.', false);
      return;
    }
    const cells = { ...current.notifications[column], [category]: value };
    const notifications = { ...current.notifications, [column]: cells };
    const res = await data.save({ notifications }, `${COLUMN_LABEL[column]} alert`);
    toast(res.message, res.ok);
  }, [data]);

  // The rail doubles as the page's health indicator: amber on every step whose
  // data could not be read, so a blind spot is visible from the top of the page.
  const navStates = useMemo<Record<string, StepState>>(() => {
    const out: Record<string, StepState> = {};
    for (const step of STEPS) {
      if (step.needs !== 'none' && !data.has(step.needs)) out[step.id] = 'unread';
    }
    return out;
  }, [data]);

  return (
    <div>
      <div className="view-head">
        <h1 className="text-gradient">Profile &amp; Settings</h1>
        <span className="sub">
          {data.loadedOnce
            ? 'your account, how we reach you, what keeps it safe, and what this device remembers'
            : 'reading your account…'}
        </span>
      </div>

      {/* What did not load, in words, with one retry for all of it. A step that
          could not be read reports itself instead of showing defaults. */}
      {data.gaps.length > 0 && (
        <div className="card mb card-glow" role="alert" style={{ borderColor: 'rgba(245, 158, 11, 0.45)' }}>
          <div className="sec-title">
            <h2>Some of this page could not be read</h2>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => void data.reload()}
              disabled={data.loading}
            >
              {data.loading ? 'Retrying…' : 'Try again'}
            </button>
          </div>
          <ul className="tiny" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {data.gaps.map((g) => <li key={g.id}>{g.sentence}</li>)}
          </ul>
          <div className="tiny" style={{ marginTop: 8, color: 'var(--txt-3)' }}>
            The steps marked in amber on the list are the ones affected. Nothing here is filled in from an assumption.
          </div>
        </div>
      )}

      <div className="ps-page">
        <SettingsNav states={navStates} />

        <div className="ps-body">
          <Step index={1} id="ps-profile" label="Profile">
            <ProfileCard data={data} />
          </Step>

          <Step index={2} id="ps-status" label="Verification status">
            <StatusCard data={data} onOpenSecurityPage={openSecurityPage} />
          </Step>

          <Step index={3} id="ps-identity" label="Identity details">
            <IdentityCard data={data} />
          </Step>

          <Step index={4} id="ps-contact" label="Contact number">
            <ContactCard data={data} />
          </Step>

          <Step index={5} id="ps-email" label="Email address">
            <EmailManagement />
          </Step>

          <Step index={6} id="ps-notifications" label="Notifications">
            <NotificationsPanel onCellChange={onCellChange} />
          </Step>

          <Step index={7} id="ps-security" label="Password and 2FA">
            <SecurityCard data={data} onOpenSecurityPage={openSecurityPage} />
          </Step>

          <Step index={8} id="ps-sessions" label="Active sessions">
            <SessionManager />
          </Step>

          <Step index={9} id="ps-logins" label="Sign-in history">
            <LoginActivityComponent />
          </Step>

          <Step index={10} id="ps-privacy" label="Privacy">
            <PrivacyCard data={data} />
          </Step>

          <Step index={11} id="ps-appearance" label="Appearance and language">
            <PreferencesCard data={data} />
          </Step>

          <Step index={12} id="ps-social" label="Connected accounts">
            <div className="card card-glow bg-gradient-card ps-card">
              <SocialAccounts onUpdate={() => void data.reload()} />
            </div>
          </Step>

          <Step index={13} id="ps-apikeys" label="API keys">
            <APIKeyManager />
          </Step>

          <Step index={14} id="ps-device" label="This device">
            <DeviceCard data={data} onOpenSecurityPage={openSecurityPage} />
          </Step>
        </div>
      </div>
    </div>
  );
}

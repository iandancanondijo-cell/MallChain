/**
 * Security Settings Page
 * Phase 3 Section 11: Security Settings Page - Tasks 11.1-11.10
 * 
 * Features:
 * - Change PIN with old PIN verification
 * - Biometric settings enable/disable
 * - Two-factor authentication placeholder
 * - Session timeout configuration
 * - Recent activity log
 * - Sign out everywhere button
 */

import React, { useState } from 'react';
import QRCode from 'qrcode';
import { store, type Activity } from '../store/store';
import { useStoreVersion, toast } from '../components/ui';
import { verifyPin, hashPin, encryptMnemonic, decryptMnemonic } from '../services/security';
import { authService } from '../services/auth';
import { settingsApi, type UserSettingsData } from '../services/settingsApi';
import { requestMnemonic } from '../services/mnemonicAccess';
import { getStatus, setupKeyRecovery, confirmKeyRecovery, testRecovery, disableKeyRecovery } from '../services/vaultRecovery';
import PrivateKeyExport from '../components/PrivateKeyExport';
import '../styles/security-settings.css';

interface SecuritySettingsState {
  showChangePinModal: boolean;
  showActivityLog: boolean;
  showSignOutModal: boolean;
  showPrivateKeyExport: boolean;

  oldPin: string;
  newPin: string;
  confirmPin: string;
  pinError: string | null;
  pinLoading: boolean;

  sessionTimeout: 5 | 15 | 30;
}

export function SecuritySettings() {
  useStoreVersion();
  const st = store.state;
  const hasPinSet = !!st.wallet.pinHash;
  const [state, setState] = useState<SecuritySettingsState>({
    showChangePinModal: false,
    showActivityLog: false,
    showSignOutModal: false,
    showPrivateKeyExport: false,

    oldPin: '',
    newPin: '',
    confirmPin: '',
    pinError: null,
    pinLoading: false,

    sessionTimeout: 15,
  });

  const [settings, setSettings] = useState<UserSettingsData | null>(null);

  // Load real settings on mount (session timeout lives here — backend/src/routes/settings.js).
  React.useEffect(() => {
    settingsApi.get().then((res) => {
      if (res.ok && res.data) {
        setSettings(res.data);
        const t = res.data.security.sessionTimeout;
        if (t === 5 || t === 15 || t === 30) {
          setState((prev) => ({ ...prev, sessionTimeout: t }));
        }
      }
    });
  }, []);

  // Encrypted Key Backup (x/vault): password+TOTP-gated on-chain recovery
  // of a dedicated ed25519 key, separate from the login 2FA managed on the
  // Profile page. See services/vaultRecovery.ts.
  type VaultStatus = 'loading' | 'none' | 'pending' | 'active';
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>('loading');
  const [vaultModal, setVaultModal] = useState<null | 'setup' | 'confirm' | 'test' | 'disable'>(null);
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultCode, setVaultCode] = useState('');
  const [vaultQr, setVaultQr] = useState<{ secret: string; dataUrl: string } | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultTestResult, setVaultTestResult] = useState<string | null>(null);

  const refreshVaultStatus = React.useCallback(async () => {
    if (!st.wallet.address) {
      setVaultStatus('none');
      return;
    }
    try {
      const blob = await getStatus(st.wallet.address);
      setVaultStatus(!blob.found ? 'none' : blob.ciphertext ? 'active' : 'pending');
    } catch {
      setVaultStatus('none');
    }
  }, [st.wallet.address]);

  React.useEffect(() => {
    refreshVaultStatus();
  }, [refreshVaultStatus]);

  const openVaultModal = (modal: 'setup' | 'confirm' | 'test' | 'disable') => {
    setVaultPassword('');
    setVaultCode('');
    setVaultError(null);
    setVaultTestResult(null);
    if (modal === 'setup') setVaultQr(null);
    setVaultModal(modal);
  };

  const submitVaultSetup = async () => {
    setVaultBusy(true);
    setVaultError(null);
    try {
      const mnemonic = await requestMnemonic();
      if (!mnemonic) {
        setVaultBusy(false);
        return;
      }
      const { uri, secret } = await setupKeyRecovery({
        mnemonic,
        address: st.wallet.address,
        password: vaultPassword,
        accountName: st.wallet.address,
        issuer: 'Mallchain',
      });
      const dataUrl = await QRCode.toDataURL(uri, { width: 220, margin: 1 });
      setVaultQr({ secret, dataUrl });
      toast('Vault registered on-chain — scan the code, then confirm below', true);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setVaultBusy(false);
    }
  };

  const submitVaultConfirm = async () => {
    setVaultBusy(true);
    setVaultError(null);
    try {
      const mnemonic = await requestMnemonic();
      if (!mnemonic) {
        setVaultBusy(false);
        return;
      }
      await confirmKeyRecovery({ mnemonic, address: st.wallet.address, password: vaultPassword, code: vaultCode });
      toast('Encrypted key backup confirmed', true);
      setVaultModal(null);
      refreshVaultStatus();
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Confirmation failed');
    } finally {
      setVaultBusy(false);
    }
  };

  const submitVaultTest = async () => {
    setVaultBusy(true);
    setVaultError(null);
    setVaultTestResult(null);
    try {
      const result = await testRecovery({ address: st.wallet.address, password: vaultPassword, code: vaultCode });
      setVaultTestResult(result.ok ? 'Recovery works — this password and code correctly recover your backed-up key.' : result.reason);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setVaultBusy(false);
    }
  };

  const submitVaultDisable = async () => {
    setVaultBusy(true);
    setVaultError(null);
    try {
      const mnemonic = await requestMnemonic();
      if (!mnemonic) {
        setVaultBusy(false);
        return;
      }
      await disableKeyRecovery({ mnemonic, address: st.wallet.address });
      toast('Encrypted key backup disabled', true);
      setVaultModal(null);
      refreshVaultStatus();
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Disable failed');
    } finally {
      setVaultBusy(false);
    }
  };

  // Task 11.2-11.3: Change PIN — verifies the current PIN against the stored
  // hash (skipped on first-time setup, when no PIN has been set yet), then
  // hashes and persists the new one AND re-encrypts the wallet mnemonic with
  // it (services/security.ts) so PrivateKeyExport has something real to
  // decrypt. Both previously just validated input and threw the result away.
  const handleChangePinSubmit = async () => {
    try {
      setState(prev => ({ ...prev, pinLoading: true, pinError: null }));

      if (hasPinSet && !state.oldPin) {
        setState(prev => ({ ...prev, pinError: 'Please enter your current PIN', pinLoading: false }));
        return;
      }

      if (!state.newPin) {
        setState(prev => ({ ...prev, pinError: 'Please enter a new PIN', pinLoading: false }));
        return;
      }

      if (state.newPin !== state.confirmPin) {
        setState(prev => ({ ...prev, pinError: 'New PINs do not match', pinLoading: false }));
        return;
      }

      if (state.newPin.length < 4 || state.newPin.length > 8) {
        setState(prev => ({ ...prev, pinError: 'PIN must be 4-8 digits', pinLoading: false }));
        return;
      }

      if ((hasPinSet && !/^\d+$/.test(state.oldPin)) || !/^\d+$/.test(state.newPin)) {
        setState(prev => ({ ...prev, pinError: 'PIN must contain only digits', pinLoading: false }));
        return;
      }

      // Recover the plaintext phrase to re-encrypt it under the new PIN —
      // the durable store never holds it in plaintext (see
      // services/mnemonicAccess.ts). st.wallet.mnemonic is only ever
      // non-empty for an account created before PIN-gating existed, mid
      // one-time migration (App.tsx's boot effect routes it here).
      let mnemonic: string | null = null;
      if (hasPinSet) {
        const verifyResult = await verifyPin(state.oldPin, st.wallet.pinHash);
        if (!verifyResult.success || !verifyResult.valid) {
          setState(prev => ({ ...prev, pinError: 'Current PIN is incorrect', pinLoading: false }));
          return;
        }
        const decryptResult = await decryptMnemonic(st.wallet.pinEncryptedMnemonic, state.oldPin);
        if (!decryptResult.success || !decryptResult.decrypted) {
          setState(prev => ({ ...prev, pinError: decryptResult.error || 'Failed to unlock wallet with current PIN', pinLoading: false }));
          return;
        }
        mnemonic = decryptResult.decrypted;
      } else if (st.wallet.mnemonic) {
        mnemonic = st.wallet.mnemonic;
      }

      if (!mnemonic) {
        setState(prev => ({ ...prev, pinError: 'No wallet found to secure with a PIN', pinLoading: false }));
        return;
      }

      const hashResult = await hashPin(state.newPin);
      if (!hashResult.success || !hashResult.hash) {
        setState(prev => ({ ...prev, pinError: hashResult.error || 'Failed to hash PIN', pinLoading: false }));
        return;
      }

      const encryptResult = await encryptMnemonic(mnemonic, state.newPin);
      if (!encryptResult.success || !encryptResult.encrypted) {
        setState(prev => ({ ...prev, pinError: encryptResult.error || 'Failed to secure wallet with new PIN', pinLoading: false }));
        return;
      }

      st.wallet.pinHash = hashResult.hash;
      st.wallet.pinEncryptedMnemonic = encryptResult.encrypted;
      // Clears the legacy plaintext field once it's safely re-encrypted —
      // a no-op for the normal "change PIN" path, where it's already empty.
      st.wallet.mnemonic = '';
      store.commit();

      setState(prev => ({
        ...prev,
        showChangePinModal: false,
        oldPin: '',
        newPin: '',
        confirmPin: '',
        pinLoading: false,
      }));

      toast(hasPinSet ? 'PIN changed successfully' : 'PIN set successfully', true);
    } catch (error) {
      setState(prev => ({
        ...prev,
        pinError: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        pinLoading: false,
      }));
    }
  };

  // Task 11.8: Session timeout — persisted via the real settings API
  // (backend/src/routes/settings.js), same pattern features/settings/Settings.tsx
  // already uses for other preference fields.
  const handleSessionTimeoutChange = async (timeout: 5 | 15 | 30) => {
    setState(prev => ({ ...prev, sessionTimeout: timeout }));
    if (!settings) return;
    const updatedSecurity = { ...settings.security, sessionTimeout: timeout };
    setSettings({ ...settings, security: updatedSecurity });
    const res = await settingsApi.update({ security: updatedSecurity });
    if (res.ok) toast(`Session timeout set to ${timeout} minutes`, true);
    else toast(res.error || 'Failed to save session timeout', false);
  };

  // Task 11.10: Sign out everywhere — revokes every token issued to this
  // account (middleware/tokenDenylist.js), then does the same local logout
  // (token clear + store reset) as a regular sign-out. Previously this only
  // ever did the local half despite its name — any other device holding a
  // token for this account stayed fully signed in.
  const handleSignOutEverywhere = async () => {
    setState(prev => ({ ...prev, showSignOutModal: false }));
    const ok = await authService.logoutEverywhere();
    toast(ok ? 'Signed out from all devices' : 'Signed out here, but revoking other devices failed — try again if you suspect unauthorized access', ok);
  };

  return (
    <div className="security-settings">
      <div className="page-header">
        <h1>Security Settings</h1>
        <p>Manage your account security and authentication methods</p>
      </div>

      {/* Section 1: PIN Management */}
      <section className="settings-section">
        <div className="section-header">
          <h2>PIN Management</h2>
          <span className="section-status">{hasPinSet ? '✓ Active' : 'Not set'}</span>
        </div>

        <div className="settings-card">
          <div className="setting-item">
            <div className="setting-info">
              <h3>{hasPinSet ? 'Current PIN' : 'Set a PIN'}</h3>
              <p>{hasPinSet ? 'Your 4-8 digit security PIN' : 'Set a 4-8 digit PIN to secure private key export'}</p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setState(prev => ({ ...prev, showChangePinModal: true }))}
            >
              {hasPinSet ? 'Change PIN' : 'Set PIN'}
            </button>
          </div>
        </div>
      </section>

      {/* Section 1.5: Private Key Export (Phase 3 Section 12) */}
      <section className="settings-section">
        <div className="section-header">
          <h2>Private Key & Backup</h2>
          <span className="section-status">⚠️ Advanced</span>
        </div>

        <div className="settings-card">
          <div className="setting-item">
            <div className="setting-info">
              <h3>Export Private Key</h3>
              <p>{hasPinSet ? 'View and backup your private key (requires PIN verification)' : 'Set a PIN above first — export is PIN-protected'}</p>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setState(prev => ({ ...prev, showPrivateKeyExport: true }))}
              disabled={!hasPinSet}
              title={hasPinSet ? 'Exports private key with PIN verification' : 'Set a PIN first'}
            >
              Export Key
            </button>
          </div>
        </div>
      </section>

      {/* Section 2: Biometric Authentication */}
      <section className="settings-section">
        <div className="section-header">
          <h2>Biometric Authentication</h2>
          <span className="section-status coming-soon">Not available yet</span>
        </div>

        <div className="settings-card settings-disabled">
          <p className="placeholder-text">
            Biometric authentication isn't available yet — it needs a real WebAuthn
            enrollment/verification flow, which hasn't been built.
          </p>
        </div>
      </section>

      {/* Section 3: Two-Factor Authentication (Placeholder) */}
      <section className="settings-section">
        <div className="section-header">
          <h2>Two-Factor Authentication</h2>
          <span className={`section-status ${settings?.security.twoFactorEnabled ? 'available' : ''}`}>
            {settings?.security.twoFactorEnabled ? '✓ Enabled' : 'Not enabled'}
          </span>
        </div>

        <div className="settings-card">
          <div className="setting-item">
            <div className="setting-info">
              <h3>Manage 2FA</h3>
              <p>Two-factor authentication is managed from your Profile page.</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { window.location.hash = '#/profile'; }}>
              Go to Profile
            </button>
          </div>
        </div>
      </section>

      {/* Section 3b: Encrypted Key Backup — on-chain cross-device recovery (x/vault), separate from login 2FA above */}
      <section className="settings-section">
        <div className="section-header">
          <h2>Encrypted Key Backup</h2>
          <span className={`section-status ${vaultStatus === 'active' ? 'available' : ''}`}>
            {vaultStatus === 'loading' ? 'Checking…' : vaultStatus === 'active' ? '✓ Active' : vaultStatus === 'pending' ? 'Setup started' : 'Not set up'}
          </span>
        </div>

        <div className="settings-card">
          <div className="setting-item">
            <div className="setting-info">
              <h3>Recover your wallet from any device</h3>
              <p>
                Backs up an encrypted recovery key on-chain, protected by a password and an
                authenticator app code you choose here. Neither ever leaves this browser — the
                chain only ever stores ciphertext.
              </p>
            </div>
            {vaultStatus === 'none' && (
              <button className="btn btn-primary btn-sm" onClick={() => openVaultModal('setup')}>Set up</button>
            )}
            {vaultStatus === 'pending' && (
              <button className="btn btn-primary btn-sm" onClick={() => openVaultModal('confirm')}>Finish setup</button>
            )}
            {vaultStatus === 'active' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openVaultModal('test')}>Test recovery</button>
                <button className="btn btn-danger btn-sm" onClick={() => openVaultModal('disable')}>Disable</button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 4: Session Settings */}
      <section className="settings-section">
        <div className="section-header">
          <h2>Session Management</h2>
        </div>

        <div className="settings-card">
          <div className="setting-item">
            <div className="setting-info">
              <h3>Session Timeout</h3>
              <p>Automatically log out after inactivity</p>
            </div>
            <div className="timeout-selector">
              {[5, 15, 30].map(timeout => (
                <button
                  key={timeout}
                  className={`timeout-btn ${state.sessionTimeout === timeout ? 'active' : ''}`}
                  onClick={() => handleSessionTimeoutChange(timeout as 5 | 15 | 30)}
                >
                  {timeout}m
                </button>
              ))}
            </div>
          </div>

          <div className="setting-divider" />

          <div className="setting-item">
            <div className="setting-info">
              <h3>Recent Activity</h3>
              <p>Your recent account activity on this device</p>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setState(prev => ({ ...prev, showActivityLog: true }))}
            >
              View Activity
            </button>
          </div>
        </div>
      </section>

      {/* Section 5: Account Security */}
      <section className="settings-section">
        <div className="section-header">
          <h2>Account Security</h2>
        </div>

        <div className="settings-card">
          <div className="setting-item">
            <div className="setting-info">
              <h3>Sign Out Everywhere</h3>
              <p>End all active sessions on other devices</p>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setState(prev => ({ ...prev, showSignOutModal: true }))}
            >
              Sign Out All
            </button>
          </div>
        </div>
      </section>

      {/* Change PIN Modal */}
      {state.showChangePinModal && (
        <ChangePinModal
          hasPinSet={hasPinSet}
          oldPin={state.oldPin}
          newPin={state.newPin}
          confirmPin={state.confirmPin}
          error={state.pinError}
          loading={state.pinLoading}
          onOldPinChange={pin => setState(prev => ({ ...prev, oldPin: pin, pinError: null }))}
          onNewPinChange={pin => setState(prev => ({ ...prev, newPin: pin, pinError: null }))}
          onConfirmPinChange={pin => setState(prev => ({ ...prev, confirmPin: pin, pinError: null }))}
          onSubmit={handleChangePinSubmit}
          onCancel={() =>
            setState(prev => ({
              ...prev,
              showChangePinModal: false,
              oldPin: '',
              newPin: '',
              confirmPin: '',
              pinError: null,
            }))
          }
        />
      )}

      {/* Activity Log Modal — real activity feed (store.state.activity), not fabricated entries */}
      {state.showActivityLog && (
        <ActivityLogModal
          activity={st.activity}
          onClose={() => setState(prev => ({ ...prev, showActivityLog: false }))}
        />
      )}

      {/* Sign Out Everywhere Modal */}
      {state.showSignOutModal && (
        <SignOutModal
          onConfirm={handleSignOutEverywhere}
          onCancel={() => setState(prev => ({ ...prev, showSignOutModal: false }))}
        />
      )}

      {/* Private Key Export Modal (Phase 3 Section 12) */}
      {state.showPrivateKeyExport && (
        <PrivateKeyExport
          encryptedMnemonic={st.wallet.pinEncryptedMnemonic}
          walletAddress={st.wallet.address || ''}
          onClose={() => setState(prev => ({ ...prev, showPrivateKeyExport: false }))}
        />
      )}

      {/* Encrypted Key Backup modals (x/vault setup/confirm/test/disable) */}
      {vaultModal && (
        <KeyVaultModal
          mode={vaultModal}
          password={vaultPassword}
          code={vaultCode}
          qr={vaultQr}
          busy={vaultBusy}
          error={vaultError}
          testResult={vaultTestResult}
          onPasswordChange={setVaultPassword}
          onCodeChange={setVaultCode}
          onSetupSubmit={submitVaultSetup}
          onConfirmSubmit={submitVaultConfirm}
          onTestSubmit={submitVaultTest}
          onDisableSubmit={submitVaultDisable}
          onProceedToConfirm={() => openVaultModal('confirm')}
          onClose={() => setVaultModal(null)}
        />
      )}
    </div>
  );
}

/**
 * Change PIN Modal (Tasks 11.2-11.3)
 */
interface ChangePinModalProps {
  hasPinSet: boolean;
  oldPin: string;
  newPin: string;
  confirmPin: string;
  error: string | null;
  loading: boolean;
  onOldPinChange: (pin: string) => void;
  onNewPinChange: (pin: string) => void;
  onConfirmPinChange: (pin: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function ChangePinModal({
  hasPinSet,
  oldPin,
  newPin,
  confirmPin,
  error,
  loading,
  onOldPinChange,
  onNewPinChange,
  onConfirmPinChange,
  onSubmit,
  onCancel,
}: ChangePinModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <h3>{hasPinSet ? 'Change PIN' : 'Set PIN'}</h3>

        {error && <div className="error-message">{error}</div>}

        {hasPinSet && (
          <div className="form-group">
            <label>Current PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              placeholder="••••"
              value={oldPin}
              onChange={e => onOldPinChange(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
            />
          </div>
        )}

        <div className="form-group">
          <label>New PIN (4-8 digits)</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder="••••"
            value={newPin}
            onChange={e => onNewPinChange(e.target.value.replace(/\D/g, ''))}
            disabled={loading}
          />
          <small>Requirements: 4-8 digits, no repeating sequences (e.g., 1111)</small>
        </div>

        <div className="form-group">
          <label>Confirm New PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder="••••"
            value={confirmPin}
            onChange={e => onConfirmPinChange(e.target.value.replace(/\D/g, ''))}
            disabled={loading}
          />
        </div>

        <div className="modal-buttons">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={onSubmit}
            disabled={loading || (hasPinSet && !oldPin) || !newPin || !confirmPin}
          >
            {loading ? 'Saving...' : hasPinSet ? 'Change PIN' : 'Set PIN'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Activity Log Modal (Task 11.9) — real activity feed, not a fabricated
 * login-history table (no per-user IP audit log exists on the backend).
 */
interface ActivityLogModalProps {
  activity: Activity[];
  onClose: () => void;
}

function ActivityLogModal({ activity, onClose }: ActivityLogModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <h3>Recent Activity</h3>

        {activity.length === 0 ? (
          <p className="placeholder-text">No recent activity yet.</p>
        ) : (
          <table className="activity-table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {activity.slice(0, 50).map(entry => (
                <tr key={entry.id}>
                  <td>{entry.text}</td>
                  <td>{new Date(entry.ts).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="modal-buttons">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Sign Out Everywhere Modal (Task 11.10)
 */
interface SignOutModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

function SignOutModal({ onConfirm, onCancel }: SignOutModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <h3>Sign Out Everywhere?</h3>

        <p className="warning-text">
          This will end all active sessions on all devices. You will be signed out immediately.
        </p>

        <div className="modal-buttons">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Sign Out All Devices
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Encrypted Key Backup modal — covers all four x/vault actions (setup,
 * confirm, test recovery, disable) as one component since they share the
 * same password/code inputs and only differ in which step is showing.
 */
interface KeyVaultModalProps {
  mode: 'setup' | 'confirm' | 'test' | 'disable';
  password: string;
  code: string;
  qr: { secret: string; dataUrl: string } | null;
  busy: boolean;
  error: string | null;
  testResult: string | null;
  onPasswordChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onSetupSubmit: () => void;
  onConfirmSubmit: () => void;
  onTestSubmit: () => void;
  onDisableSubmit: () => void;
  onProceedToConfirm: () => void;
  onClose: () => void;
}

function KeyVaultModal({
  mode,
  password,
  code,
  qr,
  busy,
  error,
  testResult,
  onPasswordChange,
  onCodeChange,
  onSetupSubmit,
  onConfirmSubmit,
  onTestSubmit,
  onDisableSubmit,
  onProceedToConfirm,
  onClose,
}: KeyVaultModalProps) {
  const titles: Record<KeyVaultModalProps['mode'], string> = {
    setup: 'Set up encrypted key backup',
    confirm: 'Finish setting up key backup',
    test: 'Test key recovery',
    disable: 'Disable encrypted key backup',
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <h3>{titles[mode]}</h3>

        {error && <div className="error-message">{error}</div>}

        {mode === 'setup' && !qr && (
          <>
            <p className="tiny mb">
              Choose a password for this backup. Anyone who has both it and your authenticator
              code can recover your key, so pick something strong and unique — it is never sent
              anywhere in plain text.
            </p>
            <div className="form-group">
              <label>Backup password</label>
              <input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => onPasswordChange(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </div>
            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={onSetupSubmit} disabled={busy || password.length < 8}>
                {busy ? 'Setting up...' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {mode === 'setup' && qr && (
          <>
            <p className="tiny mb">Scan this into an authenticator app (Google Authenticator, Authy, 1Password, etc.):</p>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <img src={qr.dataUrl} alt="Authenticator QR code" width={220} height={220} />
            </div>
            <div className="card" style={{ padding: 12, marginBottom: 12, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>
              {qr.secret}
            </div>
            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
              <button className="btn btn-primary" onClick={onProceedToConfirm}>I've saved it — continue</button>
            </div>
          </>
        )}

        {mode === 'confirm' && (
          <>
            <p className="tiny mb">Enter your backup password and the current code from your authenticator app.</p>
            <div className="form-group">
              <label>Backup password</label>
              <input type="password" value={password} onChange={e => onPasswordChange(e.target.value)} disabled={busy} autoFocus />
            </div>
            <div className="form-group">
              <label>Authenticator code</label>
              <input inputMode="numeric" placeholder="123456" value={code} onChange={e => onCodeChange(e.target.value)} disabled={busy} />
            </div>
            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={onConfirmSubmit} disabled={busy || !password || !code}>
                {busy ? 'Confirming...' : 'Confirm'}
              </button>
            </div>
          </>
        )}

        {mode === 'test' && (
          <>
            <p className="tiny mb">
              Checks that this password and code actually recover your backed-up key — the same
              thing a recovery on a new device would do. Nothing is changed on-chain.
            </p>
            <div className="form-group">
              <label>Backup password</label>
              <input type="password" value={password} onChange={e => onPasswordChange(e.target.value)} disabled={busy} autoFocus />
            </div>
            <div className="form-group">
              <label>Authenticator code</label>
              <input inputMode="numeric" placeholder="123456" value={code} onChange={e => onCodeChange(e.target.value)} disabled={busy} />
            </div>
            {testResult && <div className="tiny mb">{testResult}</div>}
            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Close</button>
              <button className="btn btn-primary" onClick={onTestSubmit} disabled={busy || !password || !code}>
                {busy ? 'Testing...' : 'Test'}
              </button>
            </div>
          </>
        )}

        {mode === 'disable' && (
          <>
            <p className="warning-text">
              This deletes your on-chain encrypted backup. You will no longer be able to recover
              this key from another device.
            </p>
            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-danger" onClick={onDisableSubmit} disabled={busy}>
                {busy ? 'Disabling...' : 'Disable backup'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SecuritySettings;

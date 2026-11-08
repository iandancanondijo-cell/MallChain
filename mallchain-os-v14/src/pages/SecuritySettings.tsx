/**
 * Security Settings Page
 * Phase 3 Section 11: Security Settings Page - Tasks 11.1-11.10
 *
 * Features:
 * - Change wallet cipher (Crypt Cipher Wall; legacy numeric PINs still unlock)
 * - Biometric settings enable/disable
 * - Two-factor authentication placeholder
 * - Session timeout configuration
 * - Recent activity log
 * - Sign out everywhere button
 */

import React, { useState, useRef } from 'react';
import QRCode from 'qrcode';
import { store, type Activity } from '../store/store';
import { useStoreVersion, toast } from '../components/ui';
import { verifyPin, hashPin, encryptMnemonic, decryptMnemonic } from '../services/security';
import { api } from '../services/api';
import { authService } from '../services/auth';
import { settingsApi, type UserSettingsData } from '../services/settingsApi';
import { requestMnemonic } from '../services/mnemonicAccess';
import { getStatus, setupKeyRecovery, confirmKeyRecovery, testRecovery, disableKeyRecovery } from '../services/vaultRecovery';
import PrivateKeyExport from '../components/PrivateKeyExport';
import { CipherWall, CipherSetup } from '../components/CipherWall';
import '../styles/security-settings.css';

interface SecuritySettingsState {
  showChangePinModal: boolean;
  showActivityLog: boolean;
  showSignOutModal: boolean;
  showPrivateKeyExport: boolean;

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

  // Task 11.2-11.3 (cipher edition): persist a freshly enrolled Cipher Wall
  // sequence. The modal already proved knowledge of the old secret and
  // recovered the plaintext mnemonic locally; here we hash the new cipher
  // (bcrypt), re-encrypt the mnemonic under it (PBKDF2+AES-GCM,
  // services/security.ts) so PrivateKeyExport and every signing surface keep
  // working, and mirror the hash to the server so /api/wallet/pin/verify-pin
  // rate-limits brute force on the new secret too. Returns an error string
  // or null on success.
  const saveNewCipher = async (cipher: string, mnemonic: string): Promise<string | null> => {
    try {
      const hashResult = await hashPin(cipher);
      if (!hashResult.success || !hashResult.hash) {
        return hashResult.error || 'Failed to hash cipher';
      }
      const encryptResult = await encryptMnemonic(mnemonic, cipher);
      if (!encryptResult.success || !encryptResult.encrypted) {
        return encryptResult.error || 'Failed to secure wallet with new cipher';
      }

      st.wallet.pinHash = hashResult.hash;
      st.wallet.pinEncryptedMnemonic = encryptResult.encrypted;
      st.wallet.secretMode = 'cipher';
      // Clears the legacy plaintext field once it's safely re-encrypted —
      // a no-op for the normal path, where it's already empty.
      st.wallet.mnemonic = '';
      store.commit();

      // Server sync (same rationale as WalletFlow.handleSetCipher).
      api.post('/api/wallet/pin/set-pin', { pinHash: hashResult.hash }).then((r) => {
        if (!r.ok) console.warn('[SecuritySettings] cipher hash sync to server failed:', r.error);
      });
      return null;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
        <h1 className="text-gradient">Security Settings</h1>
        <p>Manage your account security and authentication methods</p>
      </div>

      {/* Section 1: Wallet Cipher (was PIN Management) */}
      <section className="settings-section">
        <div className="section-header">
          <h2>Wallet Cipher</h2>
          <span className="section-status">{hasPinSet ? '✓ Active' : 'Not set'}</span>
        </div>

        <div className="settings-card card-glow bg-gradient-card">
          <div className="setting-item">
            <div className="setting-info">
              <h3>{hasPinSet ? (st.wallet.secretMode === 'cipher' ? 'Current cipher' : 'Current PIN (legacy)') : 'Set a cipher'}</h3>
              <p>{hasPinSet ? (st.wallet.secretMode === 'cipher' ? 'Your Cipher Wall glyph sequence — the one and only key that unlocks this wallet' : 'This wallet still uses a legacy 4-8 digit PIN; switch to a Cipher Wall sequence for stronger, easier security') : 'Engrave a 4-12 glyph cipher on the wall to secure sends, staking, voting and private key export'}</p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setState(prev => ({ ...prev, showChangePinModal: true }))}
            >
              {hasPinSet ? (st.wallet.secretMode === 'cipher' ? 'Change cipher' : 'Switch to a cipher') : 'Set cipher'}
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

        <div className="settings-card card-glow bg-gradient-card">
          <div className="setting-item">
            <div className="setting-info">
              <h3>Export Private Key</h3>
              <p>{hasPinSet ? 'View and backup your private key (requires cipher unlock)' : 'Set a cipher above first — export is cipher-protected'}</p>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setState(prev => ({ ...prev, showPrivateKeyExport: true }))}
              disabled={!hasPinSet}
              title={hasPinSet ? 'Exports private key after cipher unlock' : 'Set a cipher first'}
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

        <div className="settings-card settings-disabled card-glow bg-gradient-card">
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

        <div className="settings-card card-glow bg-gradient-card">
          <div className="setting-item">
            <div className="setting-info">
              <h3>Manage 2FA</h3>
              <p>Two-factor authentication is managed from your Profile &amp; Settings page.</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { window.location.hash = '#/settings'; }}>
              Go to Profile & Settings
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

        <div className="settings-card card-glow bg-gradient-card">
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

        <div className="settings-card card-glow bg-gradient-card">
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

        <div className="settings-card card-glow bg-gradient-card">
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

      {/* Change cipher Modal (PIN-era name kept on the state flag) */}
      {state.showChangePinModal && (
        <ChangeCipherModal
          hasSecretSet={hasPinSet}
          onClose={() => setState(prev => ({ ...prev, showChangePinModal: false }))}
          onSave={saveNewCipher}
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
 * Change cipher Modal (Tasks 11.2-11.3, Crypt Cipher Wall edition).
 * Step 1 (only when a secret already exists): unlock the wall with the
 * current cipher — or an old numeric PIN, keyed as digits on the same wall,
 * so pre-cipher accounts are never stranded. Step 2: engrave a new cipher
 * and carve it again to confirm; on save the mnemonic is re-encrypted under
 * it and the bcrypt hash is mirrored to the server (saveNewCipher).
 */
function ChangeCipherModal({ hasSecretSet, onClose, onSave }: {
  hasSecretSet: boolean;
  onClose: () => void;
  onSave: (cipher: string, mnemonic: string) => Promise<string | null>;
}) {
  const st = store.state;
  const [phase, setPhase] = useState<'unlock' | 'choose'>(hasSecretSet ? 'unlock' : 'choose');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mnemonicRef = useRef<string | null>(null);

  const unlock = async (secret: string) => {
    setBusy(true);
    setError(null);
    const verifyResult = await verifyPin(secret, st.wallet.pinHash);
    if (!verifyResult.success || !verifyResult.valid) {
      setBusy(false);
      setError('Current cipher (or legacy PIN) does not match this wallet');
      return;
    }
    const decryptResult = await decryptMnemonic(st.wallet.pinEncryptedMnemonic, secret);
    if (!decryptResult.success || !decryptResult.decrypted) {
      setBusy(false);
      setError(decryptResult.error || 'Failed to unlock wallet with current secret');
      return;
    }
    mnemonicRef.current = decryptResult.decrypted;
    setBusy(false);
    setPhase('choose');
  };

  const choose = async (cipher: string) => {
    setBusy(true);
    setError(null);
    const mnemonic = mnemonicRef.current ?? st.wallet.mnemonic;
    if (!mnemonic) {
      setBusy(false);
      setError('No wallet found on this device to secure with a cipher');
      return;
    }
    const err = await onSave(cipher, mnemonic);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    toast('Cipher updated — your wallet now unlocks with the new glyph sequence', true);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 780, width: '95%' }}>
        <h3>{hasSecretSet ? (phase === 'unlock' ? 'Unlock to change your cipher' : 'Choose your new cipher') : 'Set your cipher'}</h3>
        <p style={{ fontSize: 13, color: 'var(--txt-3)', margin: '6px 0 12px' }}>
          {phase === 'unlock'
            ? 'Tap the glyphs of your current cipher in order — or your old 4-8 digit PIN as digits on the wall — to prove ownership before enrolling the new one.'
            : 'Your wallet secret is now an ordered sequence of 4-12 glyphs from the wall (shapes, symbols, numbers, letters — anything). Carve it, then carve the same sequence again to confirm.'}
        </p>

        {phase === 'unlock' ? (
          <CipherWall actionLabel="Unlock" onSubmit={unlock} busy={busy} error={error} />
        ) : (
          <CipherSetup onSubmit={choose} busy={busy} error={null} />
        )}
        {phase === 'choose' && error && <div className="error-message" style={{ marginTop: 10 }}>{error}</div>}

        <div className="modal-buttons">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
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

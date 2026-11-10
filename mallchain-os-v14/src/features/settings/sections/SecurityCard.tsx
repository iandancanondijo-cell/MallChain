import { useState } from 'react';
import { Modal, toast } from '../../../components/ui';
import { settingsApi } from '../../../services/settingsApi';
import { Card, InfoRow } from './Shell';
import type { SettingsData } from '../hooks/useSettingsData';

/**
 * Step 07 — the password and the second factor.
 *
 * Both are enroll/verify handshakes, and neither is active until a code or a
 * password the server accepts has come back. The password modal states the
 * server's own rule (backend/src/routes/settings.js:646) and blocks the submit
 * until it is met, so the failure is learned from the box in front of you
 * rather than from a 400 after a round trip.
 *
 * Wallet cipher, key backup and export live on the Security page — this card
 * links there instead of duplicating key controls.
 */

export function SecurityCard({ data, onOpenSecurityPage }: { data: SettingsData; onOpenSecurityPage: () => void }) {
  const enabled = data.settings?.security.twoFactorEnabled ?? null;

  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [busy, setBusy] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');

  const pwRules = {
    length: pwNew.length >= 8,
    upper: /[A-Z]/.test(pwNew),
    lower: /[a-z]/.test(pwNew),
    digit: /[0-9]/.test(pwNew),
  };
  const pwIssue = pwNew === ''
    ? null
    : !Object.values(pwRules).every(Boolean)
      ? 'The new password needs at least 8 characters, an uppercase letter, a lowercase letter and a number.'
      : pwConfirm !== pwNew
        ? 'The two new-password entries do not match.'
        : null;

  const closePw = () => {
    setPwOpen(false);
    setPwOld('');
    setPwNew('');
    setPwConfirm('');
  };

  const startEnable = async () => {
    setBusy(true);
    const res = await settingsApi.setup2fa();
    setBusy(false);
    if (res.ok && res.data) {
      setSetup(res.data);
      setCode('');
      return;
    }
    toast(res.error || 'Could not start 2FA setup', false);
  };

  const confirmEnable = async () => {
    if (!code) return;
    setBusy(true);
    const res = await settingsApi.enable2fa(code);
    setBusy(false);
    if (!res.ok || !res.data) {
      toast(res.error || 'Invalid code', false);
      return;
    }
    setSetup(null);
    setBackupCodes(res.data.backupCodes);
    // The flag is server state, so the chip comes back from the document rather
    // than being assumed from the POST that just succeeded.
    await data.reload();
    toast('2FA enabled');
  };

  const confirmDisable = async () => {
    if (!disableCode) return;
    setBusy(true);
    const res = await settingsApi.disable2fa(disableCode);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || 'Failed to disable 2FA', false);
      return;
    }
    setDisableOpen(false);
    setDisableCode('');
    await data.reload();
    toast('2FA disabled');
  };

  const changePassword = async () => {
    if (!pwOld || !pwNew || pwIssue) return;
    setBusy(true);
    const res = await settingsApi.changePassword(pwOld, pwNew);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || 'Failed to change password', false);
      return;
    }
    // The old password must not linger in a form field that is about to be
    // wrong, and the new one must not stay in memory after it is saved.
    closePw();
    toast('Password changed');
  };

  return (
    <Card
      title="Password and two-factor sign-in"
      hint="What someone needs, besides your password, to get into this account."
      state={enabled === null
        ? undefined
        : <span className="chip" style={{ marginLeft: 'auto', color: enabled ? 'var(--green)' : 'var(--txt-3)', borderColor: enabled ? 'var(--green)' : 'var(--txt-3)' }}>{enabled ? '✓ 2FA on' : '2FA off'}</span>}
      missing={data.has('settings') ? undefined : 'the security section of your settings'}
      onRetry={data.reload}
      busy={data.loading}
    >
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setPwOpen(true)}>Change password</button>
        {enabled === null ? (
          <button className="btn btn-ghost btn-sm" disabled>Two-factor — not loaded</button>
        ) : enabled ? (
          <button className="btn btn-ghost btn-sm" onClick={() => { setDisableOpen(true); setDisableCode(''); }}>Turn off 2FA</button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={startEnable} disabled={busy}>
            {busy && <span className="spin" />} Set up 2FA
          </button>
        )}
      </div>

      <InfoRow
        label="Wallet cipher, key backup and export"
        note="these unlock the wallet on this device, so they are managed apart from account sign-in"
        value={<button className="link-btn" onClick={onOpenSecurityPage}>Open security settings</button>}
      />

      {setup && (
        <Modal title="Enable two-factor authentication" onClose={() => setSetup(null)}>
          <div className="tiny mb">Add this secret to your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code it generates. Until you do, 2FA is not on.</div>
          <div className="card" style={{ padding: 12, marginBottom: 12, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>{setup.secret}</div>
          <div className="field mb">
            <label htmlFor="2fa-code">6-digit code</label>
            <input id="2fa-code" className="input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy || !code} onClick={confirmEnable}>
            {busy && <span className="spin" />} Verify and enable
          </button>
        </Modal>
      )}

      {backupCodes && (
        <Modal title="Save your backup codes" onClose={() => setBackupCodes(null)}>
          <div className="tiny mb red">These are shown once. Each can replace a code from your authenticator app if you lose it — store them somewhere that is not this device.</div>
          <div className="card" style={{ padding: 12, fontFamily: 'monospace', fontSize: 13, display: 'grid', gap: 4 }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => setBackupCodes(null)}>Done</button>
        </Modal>
      )}

      {disableOpen && (
        <Modal title="Turn off two-factor authentication" onClose={() => setDisableOpen(false)}>
          <div className="tiny mb">Enter a current code from your authenticator app, or one of your backup codes, to prove this is you.</div>
          <div className="field mb">
            <label htmlFor="2fa-off-code">Code</label>
            <input id="2fa-off-code" className="input" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} placeholder="123456 or backup code" autoFocus />
          </div>
          <button className="btn btn-danger btn-block" disabled={busy || !disableCode} onClick={confirmDisable}>
            {busy && <span className="spin" />} Disable 2FA
          </button>
        </Modal>
      )}

      {pwOpen && (
        <Modal title="Change password" onClose={closePw}>
          <div className="field mb">
            <label htmlFor="pw-current">Current password</label>
            <input id="pw-current" className="input" type="password" value={pwOld} onChange={(e) => setPwOld(e.target.value)} autoFocus />
          </div>
          <div className="field mb">
            <label htmlFor="pw-new">New password</label>
            <input id="pw-new" className="input" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
            {pwNew === '' ? (
              <div className="ps-note">At least 8 characters, with uppercase, lowercase, and a number.</div>
            ) : (
              <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {([['8+ characters', pwRules.length], ['uppercase', pwRules.upper], ['lowercase', pwRules.lower], ['a number', pwRules.digit]] as const).map(([label, met]) => (
                  <span key={label} className="tiny" style={{ color: met ? 'var(--green)' : 'var(--txt-3)' }}>{met ? '✓' : '○'} {label}</span>
                ))}
              </div>
            )}
          </div>
          <div className="field mb">
            <label htmlFor="pw-repeat">Repeat new password</label>
            <input id="pw-repeat" className="input" type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
            {pwIssue && <div className="ps-note" data-tone="warn">{pwIssue}</div>}
          </div>
          <button className="btn btn-primary btn-block" disabled={busy || !pwOld || !pwNew || pwIssue !== null} onClick={changePassword}>
            {busy && <span className="spin" />} Change password
          </button>
        </Modal>
      )}
    </Card>
  );
}

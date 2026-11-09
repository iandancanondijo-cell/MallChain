import { useEffect, useState, useCallback } from 'react';
import { emailManagementApi, emailErrorDetails, type EmailStatus } from '../../../services/emailManagementApi';
import { useStoreVersion, toast } from '../../../components/ui';

type Step =
  | 'initial'
  | 'change-email'
  | 'verify-current'
  | 'verify-new'
  | 'set-backup'
  | 'verify-backup'
  | 'verify-primary';

/** Every code in these flows is 6 digits and the server refuses anything else,
 *  so the field enforces the same shape rather than letting a person paste a
 *  token and get a rejection they cannot explain. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

/**
 * EmailManagement Component
 *
 * Every claim here is the server's: whether the primary address is verified,
 * which half of a pending change is done, and whether a code actually left the
 * building. This panel used to toast "codes sent" whenever the request returned
 * 200 — which the backend answered even when the mail provider had refused —
 * and it offered a backup-email button that set up a challenge nobody could
 * ever finish, because no route read the answer.
 */
export function EmailManagement() {
  useStoreVersion();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<Step>('initial');
  const [newEmail, setNewEmail] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [backupEmail, setBackupEmail] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [primaryCode, setPrimaryCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const res = await emailManagementApi.getEmailStatus();
    if (res.ok && res.data) {
      setStatus(res.data);
      if (res.data.pendingChange?.expiresAt) {
        const remaining = Math.floor(
          (new Date(res.data.pendingChange.expiresAt).getTime() - Date.now()) / 1000
        );
        if (remaining > 0) setTimeRemaining(remaining);
      }
    } else {
      setLoadError(res.error || 'Failed to load email settings');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeRemaining]);

  const refuse = (res: { error?: string; details?: unknown }, fallback: string) => {
    const d = emailErrorDetails(res);
    const suffix = d.attemptsRemaining ? ` ${d.attemptsRemaining} attempt(s) left.` : '';
    toast((res.error || fallback) + suffix, false);
  };

  const handleChangeEmail = async () => {
    if (!newEmail.includes('@')) {
      toast('Please enter a valid email address', false);
      return;
    }

    setVerifying(true);
    const res = await emailManagementApi.initiateEmailChange(newEmail);
    setVerifying(false);

    if (res.ok && res.data) {
      toast('A different code was sent to each address');
      setStep('verify-current');
      setCurrentCode('');
      setNewCode('');
      const expiresAt = new Date(res.data.expiresAt).getTime();
      setTimeRemaining(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
      void loadStatus();
    } else {
      refuse(res, 'Could not start the email change');
    }
  };

  const handleResendChangeCodes = async () => {
    const target = status?.pendingChange?.newEmail;
    if (!target) return;
    setVerifying(true);
    const res = await emailManagementApi.initiateEmailChange(target);
    setVerifying(false);
    if (res.ok) {
      toast('New codes sent; the previous ones no longer work');
      setStep('verify-current');
      setCurrentCode('');
      setNewCode('');
      void loadStatus();
    } else {
      refuse(res, 'Could not resend the codes');
    }
  };

  const handleVerifyCurrent = async () => {
    setVerifying(true);
    const res = await emailManagementApi.verifyCurrentEmail(currentCode);
    setVerifying(false);

    if (res.ok) {
      toast('Current email verified');
      setCurrentCode('');
      setStep('verify-new');
      void loadStatus();
    } else {
      refuse(res, 'Could not verify that code');
    }
  };

  const handleVerifyNew = async () => {
    setVerifying(true);
    const res = await emailManagementApi.verifyNewEmail(newCode);
    setVerifying(false);

    if (res.ok) {
      toast('New email verified');
      setNewCode('');
      await completeChange();
    } else {
      refuse(res, 'Could not verify that code');
    }
  };

  const completeChange = async () => {
    const res = await emailManagementApi.completeChange();
    if (res.ok && res.data) {
      toast('Email successfully changed to ' + res.data.newEmail);
      await loadStatus();
      setNewEmail('');
      setStep('initial');
      setTimeRemaining(null);
    } else {
      refuse(res, 'Failed to complete email change');
    }
  };

  const handleCancel = async () => {
    const res = await emailManagementApi.cancelChange();
    if (res.ok) {
      toast('Email change cancelled');
      await loadStatus();
      setStep('initial');
      setNewEmail('');
      setCurrentCode('');
      setNewCode('');
      setTimeRemaining(null);
    } else {
      refuse(res, 'Failed to cancel');
    }
  };

  const handleSetBackup = async () => {
    if (!backupEmail.includes('@')) {
      toast('Please enter a valid email address', false);
      return;
    }

    setVerifying(true);
    const res = await emailManagementApi.setBackupEmail(backupEmail);
    setVerifying(false);

    if (res.ok) {
      if ((res.data as { alreadyVerified?: boolean } | undefined)?.alreadyVerified) {
        toast('That backup email is already confirmed');
        setStep('initial');
      } else {
        toast('Code sent to ' + ((res.data as { sentTo?: string } | undefined)?.sentTo || backupEmail));
        setBackupCode('');
        setStep('verify-backup');
      }
      setBackupEmail('');
      void loadStatus();
    } else {
      refuse(res, 'Failed to set backup email');
    }
  };

  const handleVerifyBackup = async () => {
    setVerifying(true);
    const res = await emailManagementApi.verifyBackupEmail(backupCode);
    setVerifying(false);

    if (res.ok) {
      toast('Backup email confirmed');
      setBackupCode('');
      setStep('initial');
      await loadStatus();
    } else {
      refuse(res, 'Could not verify that code');
    }
  };

  const handleRequestPrimaryCode = async () => {
    setVerifying(true);
    const res = await emailManagementApi.sendSignupCode();
    setVerifying(false);

    if (res.ok) {
      if ((res.data as { alreadyVerified?: boolean } | undefined)?.alreadyVerified) {
        toast('This email is already verified');
        await loadStatus();
        return;
      }
      toast(
        'Code sent to ' +
          ((res.data as { sentTo?: string } | undefined)?.sentTo || status?.currentEmail || 'your email')
      );
      setPrimaryCode('');
      setStep('verify-primary');
    } else {
      refuse(res, 'The code could not be sent right now');
    }
  };

  const handleVerifyPrimary = async () => {
    setVerifying(true);
    const res = await emailManagementApi.verifySignupCode(primaryCode);
    setVerifying(false);

    if (res.ok) {
      toast('Email verified');
      setPrimaryCode('');
      setStep('initial');
      await loadStatus();
    } else {
      refuse(res, 'Could not verify that code');
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const codeInput = (
    id: string,
    value: string,
    setValue: (v: string) => void,
    label: string
  ) => (
    <label htmlFor={id} style={{ display: 'block', marginBottom: 8 }}>
      <div className="tiny" style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <input
        id={id}
        className="input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        onChange={(e) => setValue(onlyDigits(e.target.value))}
        placeholder="000000"
        maxLength={6}
        disabled={verifying}
        style={{ letterSpacing: 4, textAlign: 'center' }}
      />
    </label>
  );

  if (loading) {
    return (
      <div className="card mb">
        <div className="sec-title"><h2>Email Management</h2></div>
        <div className="tiny" style={{ color: 'var(--txt-3)' }}>Loading email settings…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card mb">
        <div className="sec-title"><h2>Email Management</h2></div>
        <div className="tiny" style={{ color: 'var(--red)', marginBottom: 10 }}>{loadError}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => void loadStatus()}>Try again</button>
      </div>
    );
  }

  const pendingChange = status?.pendingChange;

  return (
    <div className="card mb">
      <div className="sec-title"><h2>Email Management</h2></div>
      <div className="tiny" style={{ marginBottom: 14, color: 'var(--txt-3)' }}>
        Your primary email is how you log in and how we reach you. A backup email is
        how you get back in if you lose it.
      </div>

      {/* Current Email */}
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
        <div className="tiny" style={{ fontWeight: 600, marginBottom: 4, color: 'var(--txt-3)' }}>
          PRIMARY EMAIL
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          {status?.currentEmail || 'Not set'}
        </div>
        <div className="tiny" style={{ marginBottom: 8 }}>
          {status?.emailVerified ? (
            <span style={{ color: 'var(--green, #10b981)' }}>
              ✓ Verified{status.emailVerifiedAt ? ` on ${new Date(status.emailVerifiedAt).toLocaleDateString()}` : ''}
            </span>
          ) : (
            <span style={{ color: 'var(--gold)' }}>
              Not verified — no code has been answered for this address.
            </span>
          )}
        </div>
        {!status?.emailVerified && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void handleRequestPrimaryCode()}
            disabled={verifying}
          >
            Verify this email
          </button>
        )}
      </div>

      {/* Backup Email */}
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
        <div className="tiny" style={{ fontWeight: 600, marginBottom: 4, color: 'var(--txt-3)' }}>
          BACKUP EMAIL
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          {status?.backupEmail || 'Not set'}
        </div>
        {status?.backupEmail ? (
          <div className="tiny" style={{ color: 'var(--green, #10b981)' }}>
            ✓ Confirmed{status.backupEmailVerifiedAt ? ` on ${new Date(status.backupEmailVerifiedAt).toLocaleDateString()}` : ''}
          </div>
        ) : (
          <div className="tiny" style={{ color: 'var(--txt-3)' }}>
            {status?.pendingBackupEmail
              ? `Waiting for a code sent to ${status.pendingBackupEmail}.`
              : 'Add a second address you control to recover this account.'}
          </div>
        )}
      </div>

      {/* Pending Change Alert */}
      {status?.hasPendingChange && pendingChange && (
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--surface)', border: '1px solid var(--gold)', borderRadius: 8 }}>
          <div className="tiny" style={{ fontWeight: 600, marginBottom: 4, color: 'var(--gold)' }}>
            Pending email change in progress
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            → {pendingChange.newEmail}
          </div>
          <div className="tiny" style={{ color: 'var(--txt-2)', marginBottom: 4 }}>
            Current address: {pendingChange.currentVerified ? '✓ confirmed' : 'not yet confirmed'}
          </div>
          <div className="tiny" style={{ color: 'var(--txt-2)', marginBottom: 8 }}>
            New address: {pendingChange.newVerified ? '✓ confirmed' : 'not yet confirmed'}
          </div>
          {timeRemaining ? (
            <div className="tiny" style={{ color: 'var(--txt-2)', marginBottom: 8 }}>
              Codes expire in: {formatTimeRemaining(timeRemaining)}
            </div>
          ) : (
            <div className="tiny" style={{ color: 'var(--red)', marginBottom: 8 }}>
              These codes have expired.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!pendingChange.currentVerified && (
              <button className="btn btn-primary btn-sm" onClick={() => { setStep('verify-current'); setCurrentCode(''); }}>
                Continue change
              </button>
            )}
            {pendingChange.currentVerified && !pendingChange.newVerified && (
              <button className="btn btn-primary btn-sm" onClick={() => setStep('verify-new')}>
                Continue change
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => void handleResendChangeCodes()} disabled={verifying}>
              Send new codes
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void handleCancel()} disabled={verifying}>
              Cancel change
            </button>
          </div>
        </div>
      )}

      {/* Steps */}
      {step === 'initial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn btn-primary btn-block"
            onClick={() => { setStep('change-email'); setNewEmail(''); }}
            disabled={status?.hasPendingChange}
          >
            Change Email Address
          </button>
          {!status?.backupEmail && (
            <button
              className="btn btn-ghost btn-block"
              onClick={() => { setStep('set-backup'); setBackupEmail(''); }}
            >
              Set Backup Email
            </button>
          )}
        </div>
      )}

      {step === 'change-email' && (
        <div style={{ padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <div className="tiny" style={{ fontWeight: 600, marginBottom: 4 }}>NEW EMAIL ADDRESS</div>
            <input
              className="input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="newemail@example.com"
              disabled={verifying}
            />
          </label>
          <div className="tiny" style={{ color: 'var(--txt-3)', marginBottom: 12 }}>
            Two different codes are sent — one to each address — and both must be
            answered, current address first.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => void handleChangeEmail()} disabled={verifying || !newEmail}>
              {verifying ? 'Sending…' : 'Send Codes'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setStep('initial'); setNewEmail(''); }} disabled={verifying}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'verify-current' && (
        <div style={{ padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
          <div className="tiny" style={{ fontWeight: 600, marginBottom: 8, color: 'var(--gold)' }}>
            STEP 1 OF 2: CONFIRM YOUR CURRENT ADDRESS
          </div>
          <div className="tiny" style={{ marginBottom: 8, color: 'var(--txt-3)' }}>
            Enter the code sent to {status?.currentEmail}. This step cannot be
            skipped — the new address is only accepted afterwards.
          </div>
          {codeInput('em-current-code', currentCode, setCurrentCode, 'CODE FROM CURRENT EMAIL')}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => void handleVerifyCurrent()} disabled={verifying || currentCode.length !== 6}>
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
            <button className="btn btn-ghost" onClick={() => setStep('initial')} disabled={verifying}>
              Back
            </button>
          </div>
          {timeRemaining ? (
            <div className="tiny" style={{ color: 'var(--txt-3)' }}>Expires in: {formatTimeRemaining(timeRemaining)}</div>
          ) : (
            <div className="tiny" style={{ color: 'var(--txt-3)' }}>
              If these codes have expired, use “Send new codes” on the pending change above.
            </div>
          )}
        </div>
      )}

      {step === 'verify-new' && (
        <div style={{ padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
          <div className="tiny" style={{ fontWeight: 600, marginBottom: 8, color: 'var(--gold)' }}>
            STEP 2 OF 2: CONFIRM THE NEW ADDRESS
          </div>
          <div className="tiny" style={{ marginBottom: 8, color: 'var(--txt-3)' }}>
            Enter the different code sent to {pendingChange?.newEmail || newEmail}.
          </div>
          {codeInput('em-new-code', newCode, setNewCode, 'CODE FROM NEW EMAIL')}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => void handleVerifyNew()} disabled={verifying || newCode.length !== 6}>
              {verifying ? 'Working…' : 'Complete Change'}
            </button>
            <button className="btn btn-ghost" onClick={() => setStep('initial')} disabled={verifying}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 'set-backup' && (
        <div style={{ padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <div className="tiny" style={{ fontWeight: 600, marginBottom: 4 }}>BACKUP EMAIL ADDRESS</div>
            <input
              className="input"
              type="email"
              value={backupEmail}
              onChange={(e) => setBackupEmail(e.target.value)}
              placeholder="backup@example.com"
              disabled={verifying}
            />
          </label>
          <div className="tiny" style={{ color: 'var(--txt-3)', marginBottom: 12 }}>
            We send a code to that address. It only becomes your recovery option
            after you answer it.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => void handleSetBackup()} disabled={verifying || !backupEmail}>
              {verifying ? 'Sending…' : 'Send Code'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setStep('initial'); setBackupEmail(''); }} disabled={verifying}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'verify-backup' && (
        <div style={{ padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
          <div className="tiny" style={{ fontWeight: 600, marginBottom: 8, color: 'var(--gold)' }}>
            CONFIRM THE BACKUP ADDRESS
          </div>
          <div className="tiny" style={{ marginBottom: 8, color: 'var(--txt-3)' }}>
            Enter the code sent to {status?.pendingBackupEmail || 'your backup address'}.
          </div>
          {codeInput('em-backup-code', backupCode, setBackupCode, 'CODE FROM BACKUP EMAIL')}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => void handleVerifyBackup()} disabled={verifying || backupCode.length !== 6}>
              {verifying ? 'Verifying…' : 'Confirm Backup'}
            </button>
            <button className="btn btn-ghost" onClick={() => setStep('initial')} disabled={verifying}>
              Later
            </button>
          </div>
        </div>
      )}

      {step === 'verify-primary' && (
        <div style={{ padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
          <div className="tiny" style={{ fontWeight: 600, marginBottom: 8, color: 'var(--gold)' }}>
            CONFIRM YOUR PRIMARY ADDRESS
          </div>
          <div className="tiny" style={{ marginBottom: 8, color: 'var(--txt-3)' }}>
            Enter the code sent to {status?.currentEmail}.
          </div>
          {codeInput('em-primary-code', primaryCode, setPrimaryCode, 'CODE FROM YOUR EMAIL')}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => void handleVerifyPrimary()} disabled={verifying || primaryCode.length !== 6}>
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setStep('initial'); setPrimaryCode(''); }} disabled={verifying}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="tiny" style={{ marginTop: 14, padding: 10, backgroundColor: 'var(--surface-alt)', borderRadius: 6, color: 'var(--txt-3)' }}>
        <strong>Security note:</strong> every code works once, expires after 24
        hours, and five wrong guesses end it. Changing your email confirms both the
        old and the new address with separate codes.
      </div>
    </div>
  );
}

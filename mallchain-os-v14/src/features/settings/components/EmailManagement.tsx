import { useEffect, useState, useCallback } from 'react';
import { emailManagementApi, type EmailStatus } from '../../../services/emailManagementApi';
import { useStoreVersion, toast } from '../../../components/ui';

type Step = 'initial' | 'change-email' | 'verify-current' | 'verify-new' | 'set-backup';

/**
 * EmailManagement Component
 * Handles email changes, verification, and backup email setup
 */
export function EmailManagement() {
  useStoreVersion();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('initial');
  const [newEmail, setNewEmail] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [backupEmail, setBackupEmail] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  /**
   * Load email status
   */
  const loadStatus = useCallback(async () => {
    setLoading(true);
    const res = await emailManagementApi.getEmailStatus();
    if (res.ok && res.data) {
      setStatus(res.data);
      setStep('initial');
      
      // If there's a pending change, calculate time remaining
      if (res.data.pendingChange?.expiresAt) {
        const expiresAt = new Date(res.data.pendingChange.expiresAt).getTime();
        const now = new Date().getTime();
        const remaining = Math.floor((expiresAt - now) / 1000);
        if (remaining > 0) {
          setTimeRemaining(remaining);
        }
      }
    } else {
      toast(res.error || 'Failed to load email status', false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Timer for remaining time
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  const handleChangeEmail = async () => {
    if (!newEmail.includes('@')) {
      toast('Please enter a valid email address', false);
      return;
    }

    setVerifying(true);
    const res = await emailManagementApi.initiateEmailChange(newEmail);
    setVerifying(false);

    if (res.ok) {
      toast('Verification codes sent to both emails');
      setStep('verify-current');
      setCurrentCode('');
      setNewCode('');
      
      // Set timer
      if (res.data) {
        const expiresAt = new Date(res.data.expiresAt).getTime();
        const now = new Date().getTime();
        setTimeRemaining(Math.floor((expiresAt - now) / 1000));
      }
    } else {
      toast(res.error || 'Failed to initiate email change', false);
    }
  };

  const handleVerifyCurrent = async () => {
    if (!currentCode) {
      toast('Please enter the code from your current email', false);
      return;
    }

    setVerifying(true);
    const res = await emailManagementApi.verifyCurrentEmail(currentCode);
    setVerifying(false);

    if (res.ok) {
      toast('Current email verified');
      setStep('verify-new');
      setCurrentCode('');
    } else {
      toast(
        res.error || 'Invalid code. ' + (res.data?.attemptsRemaining ? `${res.data.attemptsRemaining} attempts remaining` : ''),
        false
      );
    }
  };

  const handleVerifyNew = async () => {
    if (!newCode) {
      toast('Please enter the code from your new email', false);
      return;
    }

    setVerifying(true);
    const res = await emailManagementApi.verifyNewEmail(newCode);
    setVerifying(false);

    if (res.ok) {
      toast('New email verified');
      await completeChange();
    } else {
      toast(
        res.error || 'Invalid code. ' + (res.data?.attemptsRemaining ? `${res.data.attemptsRemaining} attempts remaining` : ''),
        false
      );
    }
  };

  const completeChange = async () => {
    const res = await emailManagementApi.completeChange();
    if (res.ok && res.data) {
      toast('Email successfully changed to ' + res.data.newEmail);
      await loadStatus();
      setNewEmail('');
      setStep('initial');
    } else {
      toast(res.error || 'Failed to complete email change', false);
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
      toast(res.error || 'Failed to cancel', false);
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
      toast('Verification code sent to backup email');
      setBackupEmail('');
      setStep('initial');
    } else {
      toast(res.error || 'Failed to set backup email', false);
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  if (loading) {
    return <div className="tiny">Loading email settings…</div>;
  }

  return (
    <div className="card mb">
      <div className="sec-title"><h2>Email Management</h2></div>
      <div className="tiny" style={{ marginBottom: 14, color: 'var(--txt-3)' }}>
        Manage your primary email address and set up backup email for account recovery.
      </div>

      {/* Current Email */}
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
        <div className="tiny" style={{ fontWeight: 600, marginBottom: 4, color: 'var(--txt-3)' }}>
          PRIMARY EMAIL
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          {status?.currentEmail || 'Not set'}
        </div>
        <div className="tiny" style={{ color: 'var(--txt-3)' }}>
          This is your main account email for login and important notifications.
        </div>
      </div>

      {/* Pending Change Alert */}
      {status?.hasPendingChange && status?.pendingChange && (
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--surface)', border: '1px solid var(--gold)', borderRadius: 8 }}>
          <div className="tiny" style={{ fontWeight: 600, marginBottom: 4, color: 'var(--gold)' }}>
            ⚠️ PENDING EMAIL CHANGE
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            {status.pendingChange.newEmail}
          </div>
          <div className="tiny" style={{ color: 'var(--txt-2)', marginBottom: 8 }}>
            Status: <span style={{ textTransform: 'capitalize' }}>{status.pendingChange.status.replace('-', ' ')}</span>
          </div>
          {timeRemaining && (
            <div className="tiny" style={{ color: 'var(--txt-2)', marginBottom: 8 }}>
              Expires in: {formatTimeRemaining(timeRemaining)}
            </div>
          )}
          {step === 'initial' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleCancel}
              disabled={verifying}
            >
              Cancel Change
            </button>
          )}
        </div>
      )}

      {/* Steps */}
      {step === 'initial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              setStep('change-email');
              setNewEmail('');
            }}
            disabled={status?.hasPendingChange}
          >
            Change Email Address
          </button>
          <button
            className="btn btn-ghost btn-block"
            onClick={() => setStep('set-backup')}
          >
            Set Backup Email
          </button>
        </div>
      )}

      {/* Change Email Step */}
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
            We'll send verification codes to both your current and new email addresses.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleChangeEmail}
              disabled={verifying || !newEmail}
            >
              {verifying ? 'Sending…' : 'Send Codes'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStep('initial');
                setNewEmail('');
              }}
              disabled={verifying}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Verify Current Email */}
      {step === 'verify-current' && (
        <div style={{ padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
          <div className="tiny" style={{ fontWeight: 600, marginBottom: 8, color: 'var(--gold)' }}>
            STEP 1: VERIFY CURRENT EMAIL
          </div>
          <div className="tiny" style={{ marginBottom: 8, color: 'var(--txt-3)' }}>
            Enter the verification code sent to {status?.currentEmail}
          </div>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <input
              className="input"
              type="text"
              value={currentCode}
              onChange={(e) => setCurrentCode(e.target.value)}
              placeholder="Enter verification code"
              disabled={verifying}
              maxLength={64}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              className="btn btn-primary"
              onClick={handleVerifyCurrent}
              disabled={verifying || !currentCode}
            >
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleCancel}
              disabled={verifying}
            >
              Cancel
            </button>
          </div>
          {timeRemaining && (
            <div className="tiny" style={{ color: 'var(--txt-3)' }}>
              Expires in: {formatTimeRemaining(timeRemaining)}
            </div>
          )}
        </div>
      )}

      {/* Verify New Email */}
      {step === 'verify-new' && (
        <div style={{ padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
          <div className="tiny" style={{ fontWeight: 600, marginBottom: 8, color: 'var(--gold)' }}>
            STEP 2: VERIFY NEW EMAIL
          </div>
          <div className="tiny" style={{ marginBottom: 8, color: 'var(--txt-3)' }}>
            Enter the verification code sent to {newEmail}
          </div>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <input
              className="input"
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Enter verification code"
              disabled={verifying}
              maxLength={64}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              className="btn btn-primary"
              onClick={handleVerifyNew}
              disabled={verifying || !newCode}
            >
              {verifying ? 'Verifying…' : 'Complete Change'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleCancel}
              disabled={verifying}
            >
              Cancel
            </button>
          </div>
          {timeRemaining && (
            <div className="tiny" style={{ color: 'var(--txt-3)' }}>
              Expires in: {formatTimeRemaining(timeRemaining)}
            </div>
          )}
        </div>
      )}

      {/* Set Backup Email */}
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
            A backup email helps you recover your account if you lose access to your primary email.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleSetBackup}
              disabled={verifying || !backupEmail}
            >
              {verifying ? 'Sending…' : 'Set Backup Email'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStep('initial');
                setBackupEmail('');
              }}
              disabled={verifying}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Security Tips */}
      <div className="tiny" style={{ marginTop: 14, padding: 10, backgroundColor: 'var(--surface-alt)', borderRadius: 6, color: 'var(--txt-3)' }}>
        <strong>💡 Security Tip:</strong> Use a backup email you have reliable access to. This can help you regain account access if you forget your password.
      </div>
    </div>
  );
}

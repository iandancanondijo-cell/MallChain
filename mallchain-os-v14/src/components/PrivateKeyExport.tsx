/**
 * Private Key Export Modal Component
 * Phase 3 Section 12: Private Key Export & Wallet Backup - Tasks 12.1-12.8
 * 
 * Features:
 * - Warning modal before access
 * - PIN re-entry requirement
 * - Masked private key display
 * - Show/hide toggle
 * - Copy-to-clipboard with warning
 * - Download encrypted file
 * - QR code display (optional)
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { decryptMnemonic, encryptMnemonic } from '../services/security';
import { derivePrivateKeyFromMnemonic } from '../services/wallet';
import { toast } from './ui';
import { getSessionDraft, setSessionDraft } from '../services/sessionDraft';
import '../styles/private-key-export.css';

interface PrivateKeyExportProps {
  encryptedMnemonic: string;
  walletAddress: string;
  onClose: () => void;
}

type ExportStep = 'warning' | 'pin-entry' | 'display';

const PIN_ATTEMPTS_DRAFT_KEY = 'privateKeyExportPinAttempts';

export function PrivateKeyExport({
  encryptedMnemonic,
  walletAddress,
  onClose,
}: PrivateKeyExportProps) {
  // `step` deliberately stays local (never persisted): every mount must start
  // at 'warning' and re-verify the PIN — persisting it into the session tier
  // like a normal wizard would let a reopen skip straight to 'display' and
  // leak the decrypted key without re-authenticating.
  const [step, setStep] = useState<ExportStep>('warning');
  const [pin, setPin] = useState('');
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Failed-attempt count DOES persist (session tier), so closing and
  // reopening this modal can no longer reset the lockout — previously
  // pinAttempts was plain useState and trivially bypassed that way.
  const [pinAttempts, setPinAttemptsState] = useState<number>(
    () => getSessionDraft<{ count: number }>(PIN_ATTEMPTS_DRAFT_KEY)?.data.count ?? 0
  );
  const setPinAttempts = (updater: number | ((n: number) => number)) => {
    setPinAttemptsState((prev) => {
      const next = typeof updater === 'function' ? (updater as (n: number) => number)(prev) : updater;
      setSessionDraft<{ count: number }>(PIN_ATTEMPTS_DRAFT_KEY, { data: { count: next } });
      return next;
    });
  };

  // Task 12.2: Warning modal before access
  const handleProceedToPin = () => {
    setStep('pin-entry');
  };

  // Task 12.3 & 12.4: PIN re-entry and decrypt private key
  const handlePinSubmit = async () => {
    try {
      setLoading(true);
      setPinError(null);

      if (!pin) {
        setPinError('Please enter your PIN');
        return;
      }

      if (pin.length < 4 || pin.length > 8) {
        setPinError('PIN must be 4-8 digits');
        return;
      }

      // Decrypt mnemonic with PIN
      const result = await decryptMnemonic(encryptedMnemonic, pin);

      if (!result.success) {
        setPinAttempts(prev => prev + 1);
        setPinError(result.error || 'Invalid PIN. Try again.');
        setPin('');

        if (pinAttempts >= 2) {
          setTimeout(() => {
            onClose();
            toast('Too many failed attempts. Please try again later.', false);
          }, 1000);
        }
        return;
      }

      // Successful verification clears the persisted failed-attempt count.
      setPinAttempts(0);

      // Derive the actual secp256k1 private key from the decrypted mnemonic
      // — never show the mnemonic itself as if it were the private key.
      const derivedKey = await derivePrivateKeyFromMnemonic(result.decrypted!);
      setPrivateKey(derivedKey);
      setStep('display');
    } catch (error) {
      setPinError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Real QR code for the private key — regenerated whenever the key changes.
  useEffect(() => {
    if (!privateKey) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(privateKey, { width: 220, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => console.error('[PrivateKeyExport] Failed to generate QR code:', err));
    return () => { cancelled = true; };
  }, [privateKey]);

  // Task 12.6: Copy-to-clipboard with warning toast
  const handleCopyPrivateKey = () => {
    if (!privateKey) return;
    navigator.clipboard.writeText(privateKey);
    toast('⚠️ Private key copied. Never share this with anyone!', false);
  };

  // Task 12.5: Show/hide toggle
  const toggleShowPrivateKey = () => {
    setShowPrivateKey(!showPrivateKey);
  };

  // Task 12.7: Download encrypted file — actually encrypted with the same
  // PIN just used to unlock this modal (AES-256, PBKDF2-derived key, via
  // services/security.ts — the same primitive that decrypted the mnemonic
  // above), not the plaintext key wrapped in a warning label.
  const handleDownloadEncrypted = async () => {
    if (!privateKey) return;

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `private_key_${timestamp}.txt.enc`;

    const content = `MALLCHAIN PRIVATE KEY BACKUP
Generated: ${new Date().toLocaleString()}
Wallet: ${walletAddress}

⚠️  WARNING: This file's contents are encrypted with your account PIN.
NEVER share this file or your PIN with anyone.

Private Key:
${privateKey}

Security Notes:
- This key provides full access to your wallet
- Anyone with this key AND your PIN can steal all your funds
- Keep this file in a secure location
- Consider storing on an airgapped device`;

    const result = await encryptMnemonic(content, pin);
    if (!result.success || !result.encrypted) {
      toast(result.error || 'Failed to encrypt backup file', false);
      return;
    }

    const element = document.createElement('a');
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(result.encrypted)}`);
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    toast('Encrypted backup downloaded — you\'ll need your PIN to decrypt it. Keep it secure!', true);
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg private-key-export-modal">
        {step === 'warning' && (
          <>
            <h3>⚠️ Export Private Key - WARNING</h3>

            <div className="warning-container">
              <div className="warning-icon">🚨</div>

              <div className="warning-content">
                <h4>Never Share Your Private Key</h4>
                <p>
                  Your private key gives COMPLETE access to your wallet and all your funds.
                  If you expose it, you will lose everything.
                </p>

                <div className="warning-list">
                  <h5>DO NOT:</h5>
                  <ul>
                    <li>Share your private key with anyone (support, friends, family)</li>
                    <li>Copy it into emails, messages, or chat applications</li>
                    <li>Store it in cloud services or unencrypted files</li>
                    <li>Paste it into unfamiliar websites or applications</li>
                  </ul>

                  <h5>DO:</h5>
                  <ul>
                    <li>Store it in a secure, encrypted location</li>
                    <li>Use it only for wallet recovery in emergencies</li>
                    <li>Keep multiple secure backups offline</li>
                    <li>Consider using a hardware security module</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="warning-confirmation">
              <label className="checkbox-label">
                <input type="checkbox" id="understand" />
                <span>I understand the risks and want to proceed</span>
              </label>
            </div>

            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleProceedToPin}
                disabled={!(document.getElementById('understand') as HTMLInputElement)?.checked}
              >
                I Understand - Continue
              </button>
            </div>
          </>
        )}

        {step === 'pin-entry' && (
          <>
            <h3>Verify PIN to Export Private Key</h3>

            {pinError && (
              <div className="error-message">
                <span>{pinError}</span>
                {pinAttempts >= 1 && (
                  <span style={{ marginLeft: '10px' }}>
                    Attempts remaining: {3 - pinAttempts}
                  </span>
                )}
              </div>
            )}

            <p className="instruction-text">
              Enter your PIN to verify and access your private key.
            </p>

            <div className="form-group">
              <label>PIN (4-8 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                placeholder="••••"
                value={pin}
                onChange={e => {
                  setPin(e.target.value.replace(/\D/g, ''));
                  setPinError(null);
                }}
                disabled={loading}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handlePinSubmit}
                disabled={loading || pin.length < 4}
              >
                {loading ? 'Verifying...' : 'Verify & Export'}
              </button>
            </div>
          </>
        )}

        {step === 'display' && privateKey && (
          <>
            <h3>Your Private Key</h3>

            <div className="private-key-warning">
              <strong>⚠️ CRITICAL SECURITY WARNING</strong>
              <ul>
                <li>This is your ONLY way to recover your wallet if you lose access</li>
                <li>NEVER share this with anyone - not even support staff</li>
                <li>Store it encrypted in multiple secure locations</li>
                <li>Consider printing and storing in a safe deposit box</li>
              </ul>
            </div>

            {/* Task 12.4 & 12.5: Display private key (masked by default) with show/hide */}
            <div className="private-key-display-section">
              <div className="private-key-container">
                <div className="private-key-display">
                  {showPrivateKey ? (
                    <code className="private-key-visible">{privateKey}</code>
                  ) : (
                    <code className="private-key-hidden">
                      {'•'.repeat(Math.min(privateKey.length, 100))}
                    </code>
                  )}
                </div>

                <button
                  className="toggle-visibility-btn"
                  onClick={toggleShowPrivateKey}
                  title={showPrivateKey ? 'Hide private key' : 'Show private key'}
                >
                  {showPrivateKey ? '🙈 Hide' : '👁️ Show'}
                </button>
              </div>

              {/* Task 12.6: Copy-to-clipboard with warning toast */}
              <button
                className="btn btn-secondary btn-sm copy-btn"
                onClick={handleCopyPrivateKey}
                title="Copy to clipboard"
              >
                📋 Copy to Clipboard
              </button>
            </div>

            {/* Task 12.7: Download encrypted file */}
            <div className="download-section">
              <h4>Backup Options</h4>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadEncrypted}
                title="Download encrypted backup file"
              >
                💾 Download Encrypted File
              </button>
              <p className="backup-note">
                The downloaded file contains your private key. Keep it encrypted and secure.
              </p>
            </div>

            {/* Task 12.8: QR code display */}
            <div className="qr-section">
              <h4>QR Code</h4>
              {qrDataUrl ? (
                showPrivateKey ? (
                  <img src={qrDataUrl} alt="Private key QR code" width={220} height={220} />
                ) : (
                  <p style={{ fontSize: '0.85rem', color: 'var(--txt-3, #666)' }}>
                    Click "Show" above to reveal the QR code along with the key.
                  </p>
                )
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--txt-3, #666)' }}>Generating QR code…</p>
              )}
            </div>

            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PrivateKeyExport;

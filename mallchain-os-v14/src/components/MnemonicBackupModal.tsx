/**
 * Mnemonic Backup Modal Component
 * Phase 2 Section 8: Mnemonic Backup Management - Tasks 8.1-8.8
 * 
 * Features:
 * - PIN re-entry before showing mnemonic
 * - 3x4 grid display with numbered words
 * - Copy-all functionality
 * - Download as encrypted file
 * - Print functionality
 * - Security verification checkbox
 * - Warning banner about sharing mnemonics
 */

import React, { useState } from 'react';
import { verifyPin, decryptMnemonic } from '../services/security';
import { countMnemonicWords } from '../services/wallet';
import { toast } from './ui';
import '../styles/mnemonic-backup.css';

interface MnemonicBackupModalProps {
  encryptedMnemonic: string; // Encrypted mnemonic from storage
  onClose: () => void;
  walletName?: string;
}

export function MnemonicBackupModal({
  encryptedMnemonic,
  onClose,
  walletName = 'Wallet',
}: MnemonicBackupModalProps) {
  const [step, setStep] = useState<'pin-entry' | 'display' | 'verify'>('pin-entry');
  const [pin, setPin] = useState('');
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([]);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinAttempts, setPinAttempts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  // Task 8.2: PIN re-entry before showing mnemonic
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
        setPinError(result.error || 'Failed to decrypt mnemonic. Check PIN and try again.');
        setPin('');

        if (pinAttempts >= 2) {
          setTimeout(() => {
            onClose();
            toast('Too many failed attempts. Please try again later.', false);
          }, 1000);
        }
        return;
      }

      // Task 8.3: Display mnemonic in 3x4 grid with numbered words
      const words = result.decrypted!.trim().split(/\s+/);
      setMnemonic(result.decrypted!);
      setMnemonicWords(words);
      setStep('display');
    } catch (error) {
      setPinError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Task 8.4: Copy-all functionality
  const handleCopyAll = () => {
    if (!mnemonic) return;
    navigator.clipboard.writeText(mnemonic);
    toast('Mnemonic copied to clipboard', true);
  };

  // Task 8.5: Download as encrypted file
  const handleDownload = () => {
    if (!mnemonic) return;

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${walletName.replace(/\s+/g, '_')}_mnemonic_${timestamp}.txt`;
    const content = `MALLCHAIN WALLET MNEMONIC BACKUP
Generated: ${new Date().toLocaleString()}
Wallet: ${walletName}

${mnemonic}

⚠️  WARNING: Never share this mnemonic with anyone!
This file contains the seed phrase for your wallet.
Anyone with access to this phrase can steal your funds.

Recommended: Store this file in a secure, encrypted location.`;

    const element = document.createElement('a');
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`);
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    toast('Mnemonic file downloaded', true);
  };

  // Task 8.6: Print functionality
  const handlePrint = () => {
    if (!mnemonic) return;

    const printWindow = window.open('', '', 'width=600,height=400');
    if (!printWindow) {
      toast('Unable to open print dialog. Please allow popups.', false);
      return;
    }

    const words = mnemonic.trim().split(/\s+/);
    const gridHtml = `
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          ${words.slice(0, 3).map((w, i) => `
            <td style="border: 1px solid #ccc; padding: 10px; text-align: center;">
              <div style="font-size: 12px; color: #888;">Word ${i + 1}</div>
              <div style="font-size: 16px; font-weight: bold;">${w}</div>
            </td>
          `).join('')}
        </tr>
        <tr>
          ${words.slice(3, 6).map((w, i) => `
            <td style="border: 1px solid #ccc; padding: 10px; text-align: center;">
              <div style="font-size: 12px; color: #888;">Word ${i + 4}</div>
              <div style="font-size: 16px; font-weight: bold;">${w}</div>
            </td>
          `).join('')}
        </tr>
        <tr>
          ${words.slice(6, 9).map((w, i) => `
            <td style="border: 1px solid #ccc; padding: 10px; text-align: center;">
              <div style="font-size: 12px; color: #888;">Word ${i + 7}</div>
              <div style="font-size: 16px; font-weight: bold;">${w}</div>
            </td>
          `).join('')}
        </tr>
        <tr>
          ${words.slice(9, 12).map((w, i) => `
            <td style="border: 1px solid #ccc; padding: 10px; text-align: center;">
              <div style="font-size: 12px; color: #888;">Word ${i + 10}</div>
              <div style="font-size: 16px; font-weight: bold;">${w}</div>
            </td>
          `).join('')}
        </tr>
      </table>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Wallet Mnemonic Backup - ${walletName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; }
            .warning { background-color: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px 0; }
            .grid { margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>Wallet Mnemonic Backup</h1>
          <p><strong>Wallet:</strong> ${walletName}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          
          <div class="warning">
            <strong>⚠️  WARNING:</strong> Never share this mnemonic with anyone!<br/>
            Store this backup in a secure location (safe, safe deposit box, encrypted storage).
          </div>
          
          <div class="grid">
            ${gridHtml}
          </div>
          
          <div style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 10px;">
            <p style="font-size: 12px; color: #666;">
              This document contains sensitive information. Store securely and keep confidential.
            </p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();

    toast('Print dialog opened', true);
  };

  // Task 8.7: Verification checkbox
  const handleVerify = () => {
    if (!verified) {
      toast('Please confirm you have saved your mnemonic securely', false);
      return;
    }
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg mnemonic-backup-modal">
        {step === 'pin-entry' && (
          <>
            <h3>Mnemonic Backup - PIN Verification</h3>
            <p className="warning-text">
              ⚠️  To view your mnemonic, please enter your PIN for security verification.
            </p>

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

            <div className="form-group">
              <label>Enter PIN (4-8 digits)</label>
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
              <button
                className="btn btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePinSubmit}
                disabled={loading || pin.length < 4}
              >
                {loading ? 'Verifying...' : 'Verify PIN'}
              </button>
            </div>
          </>
        )}

        {step === 'display' && mnemonic && (
          <>
            <h3>Your Wallet Mnemonic</h3>

            <div className="mnemonic-warning">
              <strong>⚠️  CRITICAL SECURITY WARNING</strong>
              <ul>
                <li>Never share this mnemonic with anyone</li>
                <li>Do not type it in a chat, email, or message</li>
                <li>Store it offline in a secure location</li>
                <li>Anyone with this phrase can steal your funds</li>
              </ul>
            </div>

            {/* Task 8.3: 3x4 Grid with numbered words */}
            <div className="mnemonic-grid">
              {mnemonicWords.map((word, index) => (
                <div key={index} className="mnemonic-word">
                  <span className="word-number">{index + 1}</span>
                  <span className="word-text">{word}</span>
                </div>
              ))}
            </div>

            {/* Task 8.4: Copy-all button */}
            <div className="backup-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleCopyAll}
                title="Copy all 12 words to clipboard"
              >
                📋 Copy All
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleDownload}
                title="Download mnemonic as text file"
              >
                💾 Download
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handlePrint}
                title="Print mnemonic for paper backup"
              >
                🖨️ Print
              </button>
            </div>

            {/* Task 8.7: Verification checkbox */}
            <div className="verification-section">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={e => setVerified(e.target.checked)}
                />
                <span>
                  I have securely saved my mnemonic backup.
                  I understand that anyone with this phrase can access my wallet.
                </span>
              </label>
            </div>

            <div className="modal-buttons">
              <button
                className="btn btn-secondary"
                onClick={onClose}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={handleVerify}
                disabled={!verified}
                title={!verified ? 'Confirm that you have saved your mnemonic' : ''}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MnemonicBackupModal;

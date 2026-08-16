/**
 * Wallet Settings Page
 * Phase 2 Section 7: Wallet Settings Page - Tasks 7.1-7.10
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { store } from '../store/store';
import { useStoreVersion, toast } from '../components/ui';
import { formatAddressForDisplay } from '../services/wallet';
import '../styles/wallet-settings.css';

export function WalletSettings() {
  useStoreVersion(); // Re-render on store changes
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const walletAddress = store.state.wallet?.address || '';
  const requests = store.state.wallet?.requests || [];

  useEffect(() => {
    if (!walletAddress) { setQrDataUrl(null); return; }
    let cancelled = false;
    QRCode.toDataURL(walletAddress, { width: 140, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => console.error('[WalletSettings] Failed to generate QR code:', err));
    return () => { cancelled = true; };
  }, [walletAddress]);

  const handleCopyAddress = (address: string) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    toast('Address copied to clipboard', true);
  };

  const goToSecurity = () => { window.location.hash = '#/security'; };

  // Real backup content — same shape as WalletFlow.tsx's handleDownloadBackup,
  // built from the actual stored mnemonic rather than a disabled placeholder.
  const buildBackupContent = () =>
    `Mallchain Wallet Backup\nAddress: ${walletAddress}\nRecovery phrase:\n${store.state.wallet.mnemonic}\n\nKeep this file private. Anyone with this phrase can access your wallet.`;

  const handleDownloadBackup = () => {
    if (!store.state.wallet.mnemonic) { toast('No recovery phrase available for this wallet', false); return; }
    const content = buildBackupContent();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mallchain-wallet-${walletAddress.slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Backup file downloaded');
  };

  const handlePrintBackup = () => {
    if (!store.state.wallet.mnemonic) { toast('No recovery phrase available for this wallet', false); return; }
    const win = window.open('', '_blank', 'width=600,height=600');
    if (!win) { toast('Pop-up blocked — allow pop-ups to print your backup', false); return; }
    win.document.write(`<pre style="font: 14px monospace; white-space: pre-wrap; padding: 24px;">${buildBackupContent().replace(/</g, '&lt;')}</pre>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="wallet-settings">
      <h1>Wallet Settings</h1>

      {/* Task 7.2: Active Wallet Display */}
      {walletAddress && (
        <div className="active-wallet-section">
          <h2>Active Wallet</h2>
          <div className="wallet-card">
            <div className="wallet-header">
              <h3>Primary Wallet</h3>
              <span className="badge-active">Active</span>
            </div>

            {/* Task 7.3: QR Code Display */}
            <div className="qr-section">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Wallet address QR code" width={140} height={140} />
              ) : (
                <div className="qr-placeholder" />
              )}
              <p className="qr-label">Scan to receive funds</p>
            </div>

            {/* Task 7.4: Address Display & Copy Button */}
            <div className="address-section">
              <label>Wallet Address</label>
              <div className="address-display">
                <code>{walletAddress}</code>
                <button
                  className="copy-btn"
                  onClick={() => handleCopyAddress(walletAddress)}
                  title="Copy full address"
                >
                  📋
                </button>
              </div>
              <p className="address-short">
                {formatAddressForDisplay(walletAddress)}
              </p>
            </div>

            {/* Task 7.5: Wallet Balance */}
            <div className="balance-section">
              <label>Balance</label>
              <div className="balance-display">
                <span className="balance-amount">
                  {store.state.balances?.MALL || 0} MALL
                </span>
              </div>
            </div>

            {/* Task 7.6: Mnemonic Backup */}
            <div className="backup-section">
              <h4>Mnemonic Backup</h4>
              <p className="backup-warning">⚠️ Never share your mnemonic with anyone</p>
              <div className="backup-buttons">
                <button className="btn btn-secondary" onClick={goToSecurity} title="PIN-protected, in Security Settings">
                  View Mnemonic
                </button>
                <button className="btn btn-secondary" onClick={handleDownloadBackup}>
                  Download Backup
                </button>
                <button className="btn btn-secondary" onClick={handlePrintBackup}>
                  Print Backup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task 7.7-7.9: Additional Wallets & Import */}
      <div className="additional-wallets-section">
        <div className="section-header">
          <h2>Wallet Management</h2>
          <button className="btn btn-primary btn-sm" disabled title="This account supports one wallet at a time">
            + Import Wallet
          </button>
        </div>

        {requests.length > 0 ? (
          <table className="requests-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Note</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id}>
                  <td>Payment Request</td>
                  <td className="amount">{req.amount} MALL</td>
                  <td>{req.note}</td>
                  <td>
                    <span className={`status status-${req.status}`}>
                      {req.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No additional wallets. Importing a second wallet isn't supported yet — this account manages one wallet at a time.</p>
          </div>
        )}
      </div>

      {/* Task 7.9: Advanced Options — all three are real, PIN-protected flows in Security Settings */}
      <div className="advanced-options-section">
        <h2>Advanced Options</h2>
        <div className="options-list">
          <button className="option-item" onClick={goToSecurity}>
            <span>Export Private Key</span>
            <span className="arrow">→</span>
          </button>
          <button className="option-item" onClick={goToSecurity}>
            <span>Security Settings</span>
            <span className="arrow">→</span>
          </button>
          <button className="option-item" onClick={goToSecurity}>
            <span>View Activity Log</span>
            <span className="arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default WalletSettings;

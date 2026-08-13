/**
 * Wallet Settings Page (Placeholder)
 * Phase 2 Section 7: Wallet Settings Page - Tasks 7.1-7.10
 * Note: Extends existing store structure for full implementation
 */

import React, { useState } from 'react';
import { store } from '../store/store';
import { useStoreVersion, toast } from '../components/ui';
import { formatAddressForDisplay } from '../services/wallet';
import '../styles/wallet-settings.css';

export function WalletSettings() {
  useStoreVersion(); // Re-render on store changes
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const walletAddress = store.state.wallet?.address || '';
  const requests = store.state.wallet?.requests || [];

  const handleCopyAddress = (address: string) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    toast('Address copied to clipboard', true);
  };

  const handleViewMnemonic = () => {
    toast('Mnemonic viewing requires PIN verification (Task 8)', false);
  };

  const handleImportWallet = () => {
    setShowImportModal(true);
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
              <div className="qr-placeholder">
                <svg viewBox="0 0 29 29" className="qr-icon">
                  <rect fill="#fff" width="29" height="29" />
                  <g fill="#000">
                    <rect width="9" height="9" />
                    <rect x="11" y="11" width="7" height="7" />
                    <rect x="20" y="20" width="9" height="9" />
                  </g>
                </svg>
              </div>
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
                <button
                  className="btn btn-secondary"
                  onClick={handleViewMnemonic}
                >
                  View Mnemonic
                </button>
                <button className="btn btn-secondary" disabled title="Coming soon">
                  Download Backup
                </button>
                <button className="btn btn-secondary" disabled title="Coming soon">
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
          <button
            className="btn btn-primary btn-sm"
            onClick={handleImportWallet}
          >
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
            <p>No additional wallets. Create or import one to manage multiple addresses.</p>
          </div>
        )}
      </div>

      {/* Task 7.9: Advanced Options */}
      <div className="advanced-options-section">
        <h2>Advanced Options</h2>
        <div className="options-list">
          <button className="option-item" disabled title="Phase 3 - Private Key Export">
            <span>Export Private Key</span>
            <span className="arrow">→</span>
          </button>
          <button className="option-item" disabled title="Phase 3 - Security Settings">
            <span>Security Settings</span>
            <span className="arrow">→</span>
          </button>
          <button className="option-item" disabled title="Coming soon">
            <span>View Activity Log</span>
            <span className="arrow">→</span>
          </button>
        </div>
      </div>

      {/* Import Wallet Modal */}
      {showImportModal && (
        <ImportWalletModal
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}

/**
 * Import Wallet Modal
 */
function ImportWalletModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [mnemonic, setMnemonic] = useState('');
  const [walletName, setWalletName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!mnemonic.trim()) {
        setError('Please enter a mnemonic');
        return;
      }

      if (!walletName.trim()) {
        setError('Please enter a wallet name');
        return;
      }

      toast('Wallet import feature coming in Phase 2', false);
      onClose();
    } catch (error) {
      setError(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <h3>Import Wallet</h3>

        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label>Wallet Name</label>
          <input
            type="text"
            placeholder="My Imported Wallet"
            value={walletName}
            onChange={e => setWalletName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Mnemonic (12, 15, 18, 21, or 24 words)</label>
          <textarea
            placeholder="Enter your mnemonic phrase..."
            value={mnemonic}
            onChange={e => setMnemonic(e.target.value)}
            rows={4}
          />
        </div>

        <div className="modal-buttons">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={loading}
          >
            {loading ? 'Importing...' : 'Import Wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WalletSettings;

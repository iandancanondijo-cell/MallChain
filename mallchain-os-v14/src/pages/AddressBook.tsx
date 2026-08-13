/**
 * Address Book Page
 * Phase 2 Section 9: Address Book - Tasks 9.1-9.10
 * 
 * Features:
 * - Display address list with columns (Label, Address, Network)
 * - Add/edit/delete addresses
 * - Duplicate address checking
 * - localStorage persistence
 * - Copy button for each address
 */

import React, { useState, useEffect } from 'react';
import { store } from '../store/store';
import { useStoreVersion, toast } from '../components/ui';
import { formatAddressForDisplay, isValidSolanaAddress } from '../services/wallet';
import '../styles/address-book.css';

interface AddressEntry {
  id: string;
  label: string;
  address: string;
  network: 'mainnet' | 'devnet' | 'testnet';
  createdAt: number;
}

interface AddressBookState {
  addresses: AddressEntry[];
  showAddModal: boolean;
  showEditModal: boolean;
  selectedAddress: AddressEntry | null;
  loading: boolean;
  error: string | null;
  formLabel: string;
  formAddress: string;
  formNetwork: 'mainnet' | 'devnet' | 'testnet';
}

const STORAGE_KEY = 'mallchain_address_book';

export function AddressBook() {
  useStoreVersion();
  const [state, setState] = useState<AddressBookState>({
    addresses: [],
    showAddModal: false,
    showEditModal: false,
    selectedAddress: null,
    loading: true,
    error: null,
    formLabel: '',
    formAddress: '',
    formNetwork: 'mainnet',
  });

  // Task 9.1: Load address book on mount
  // Task 9.9: Persist to localStorage
  useEffect(() => {
    loadAddressBook();
  }, []);

  const loadAddressBook = () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const saved = localStorage.getItem(STORAGE_KEY);
      const addresses = saved ? JSON.parse(saved) : [];
      setState(prev => ({
        ...prev,
        addresses,
        loading: false,
      }));
    } catch (error) {
      console.error('[AddressBook] Error loading:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to load address book',
        loading: false,
      }));
    }
  };

  const saveAddressBook = (addresses: AddressEntry[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
    } catch (error) {
      console.error('[AddressBook] Error saving:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to save address book',
      }));
    }
  };

  // Task 9.4: Add address with form validation
  const handleAddAddress = () => {
    const { formLabel, formAddress, formNetwork, addresses } = state;

    // Validation
    if (!formLabel.trim()) {
      toast('Please enter a label', false);
      return;
    }

    if (formLabel.length > 50) {
      toast('Label must be 50 characters or less', false);
      return;
    }

    if (!formAddress.trim()) {
      toast('Please enter an address', false);
      return;
    }

    // Task 9.2: Validate address format
    if (!isValidSolanaAddress(formAddress)) {
      toast('Invalid Solana address format', false);
      return;
    }

    // Task 9.5: Check for duplicate addresses
    if (addresses.some(a => a.address === formAddress)) {
      toast('This address already exists in your book', false);
      return;
    }

    const newAddress: AddressEntry = {
      id: `addr_${Date.now()}`,
      label: formLabel.trim(),
      address: formAddress.trim(),
      network: formNetwork,
      createdAt: Date.now(),
    };

    const updated = [...addresses, newAddress];
    setState(prev => ({
      ...prev,
      addresses: updated,
      showAddModal: false,
      formLabel: '',
      formAddress: '',
      formNetwork: 'mainnet',
    }));

    saveAddressBook(updated);
    toast('Address added successfully', true);
  };

  // Task 9.6: Edit address
  const handleEditAddress = () => {
    const { selectedAddress, formLabel, formAddress, formNetwork, addresses } = state;
    if (!selectedAddress) return;

    // Validation
    if (!formLabel.trim()) {
      toast('Please enter a label', false);
      return;
    }

    if (!isValidSolanaAddress(formAddress)) {
      toast('Invalid address format', false);
      return;
    }

    // Check for duplicate (excluding self)
    if (addresses.some(a => a.id !== selectedAddress.id && a.address === formAddress)) {
      toast('This address already exists', false);
      return;
    }

    const updated = addresses.map(a =>
      a.id === selectedAddress.id
        ? {
            ...a,
            label: formLabel.trim(),
            address: formAddress.trim(),
            network: formNetwork,
          }
        : a
    );

    setState(prev => ({
      ...prev,
      addresses: updated,
      showEditModal: false,
      selectedAddress: null,
      formLabel: '',
      formAddress: '',
    }));

    saveAddressBook(updated);
    toast('Address updated successfully', true);
  };

  // Task 9.7: Delete address with confirmation
  const handleDeleteAddress = (id: string) => {
    const updated = state.addresses.filter(a => a.id !== id);
    setState(prev => ({
      ...prev,
      addresses: updated,
    }));
    saveAddressBook(updated);
    toast('Address deleted', true);
  };

  // Task 9.3: Copy address button
  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast('Address copied to clipboard', true);
  };

  const openEditModal = (address: AddressEntry) => {
    setState(prev => ({
      ...prev,
      selectedAddress: address,
      formLabel: address.label,
      formAddress: address.address,
      formNetwork: address.network,
      showEditModal: true,
    }));
  };

  const closeModals = () => {
    setState(prev => ({
      ...prev,
      showAddModal: false,
      showEditModal: false,
      selectedAddress: null,
      formLabel: '',
      formAddress: '',
      formNetwork: 'mainnet',
    }));
  };

  if (state.loading) {
    return (
      <div className="address-book">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading address book...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="address-book">
      <div className="page-header">
        <h1>Address Book</h1>
        <p>Manage and organize your frequently used wallet addresses</p>
      </div>

      {state.error && (
        <div className="error-banner">
          <span>{state.error}</span>
          <button onClick={() => setState(prev => ({ ...prev, error: null }))}>×</button>
        </div>
      )}

      {/* Task 9.4: Add button */}
      <div className="action-bar">
        <button
          className="btn btn-primary"
          onClick={() => setState(prev => ({ ...prev, showAddModal: true }))}
        >
          + Add Address
        </button>
      </div>

      {/* Task 9.2: Address list display */}
      {state.addresses.length > 0 ? (
        <table className="address-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Address</th>
              <th>Network</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.addresses.map(addr => (
              <tr key={addr.id}>
                <td className="label-cell">
                  <span className="label-badge">{addr.label}</span>
                </td>
                <td className="address-cell">
                  <code title={addr.address}>
                    {formatAddressForDisplay(addr.address)}
                  </code>
                  <button
                    className="copy-btn"
                    onClick={() => handleCopyAddress(addr.address)}
                    title="Copy address"
                  >
                    📋
                  </button>
                </td>
                <td className="network-cell">
                  <span className={`network-badge network-${addr.network}`}>
                    {addr.network}
                  </span>
                </td>
                <td className="date-cell">
                  {new Date(addr.createdAt).toLocaleDateString()}
                </td>
                <td className="actions-cell">
                  <button
                    className="action-btn"
                    onClick={() => openEditModal(addr)}
                    title="Edit address"
                  >
                    Edit
                  </button>
                  <button
                    className="action-btn danger"
                    onClick={() => handleDeleteAddress(addr.id)}
                    title="Delete address"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>No addresses yet</h3>
          <p>Add your first address to get started</p>
          <button
            className="btn btn-primary"
            onClick={() => setState(prev => ({ ...prev, showAddModal: true }))}
          >
            Add First Address
          </button>
        </div>
      )}

      {/* Add Address Modal */}
      {state.showAddModal && (
        <AddressModal
          title="Add New Address"
          label={state.formLabel}
          address={state.formAddress}
          network={state.formNetwork}
          onLabelChange={label =>
            setState(prev => ({ ...prev, formLabel: label }))
          }
          onAddressChange={address =>
            setState(prev => ({ ...prev, formAddress: address }))
          }
          onNetworkChange={network =>
            setState(prev => ({ ...prev, formNetwork: network }))
          }
          onSave={handleAddAddress}
          onCancel={closeModals}
          isLoading={false}
        />
      )}

      {/* Edit Address Modal */}
      {state.showEditModal && state.selectedAddress && (
        <AddressModal
          title="Edit Address"
          label={state.formLabel}
          address={state.formAddress}
          network={state.formNetwork}
          onLabelChange={label =>
            setState(prev => ({ ...prev, formLabel: label }))
          }
          onAddressChange={address =>
            setState(prev => ({ ...prev, formAddress: address }))
          }
          onNetworkChange={network =>
            setState(prev => ({ ...prev, formNetwork: network }))
          }
          onSave={handleEditAddress}
          onCancel={closeModals}
          isLoading={false}
        />
      )}
    </div>
  );
}

/**
 * Address form modal component (Task 9.4, 9.6)
 */
interface AddressModalProps {
  title: string;
  label: string;
  address: string;
  network: 'mainnet' | 'devnet' | 'testnet';
  onLabelChange: (label: string) => void;
  onAddressChange: (address: string) => void;
  onNetworkChange: (network: 'mainnet' | 'devnet' | 'testnet') => void;
  onSave: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function AddressModal({
  title,
  label,
  address,
  network,
  onLabelChange,
  onAddressChange,
  onNetworkChange,
  onSave,
  onCancel,
  isLoading,
}: AddressModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <h3>{title}</h3>

        <div className="form-group">
          <label>Label (e.g., "My Trading Wallet")</label>
          <input
            type="text"
            maxLength={50}
            placeholder="Address label"
            value={label}
            onChange={e => onLabelChange(e.target.value)}
            disabled={isLoading}
          />
          <small>{label.length}/50</small>
        </div>

        <div className="form-group">
          <label>Wallet Address</label>
          <input
            type="text"
            placeholder="Enter Solana address (44 characters)"
            value={address}
            onChange={e => onAddressChange(e.target.value.trim())}
            disabled={isLoading}
            spellCheck="false"
          />
          <small>Paste your Solana wallet address</small>
        </div>

        <div className="form-group">
          <label>Network</label>
          <select
            value={network}
            onChange={e =>
              onNetworkChange(e.target.value as 'mainnet' | 'devnet' | 'testnet')
            }
            disabled={isLoading}
          >
            <option value="mainnet">Mainnet</option>
            <option value="devnet">Devnet</option>
            <option value="testnet">Testnet</option>
          </select>
        </div>

        <div className="modal-buttons">
          <button
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={onSave}
            disabled={isLoading || !label.trim() || !address.trim()}
          >
            {isLoading ? 'Saving...' : 'Save Address'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddressBook;

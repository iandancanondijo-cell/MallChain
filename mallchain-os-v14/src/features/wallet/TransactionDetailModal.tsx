/**
 * Transaction Detail Modal Component
 * 
 * Task 13.10: Implement transaction detail modal with full data
 * Shows complete transaction information when user clicks on a transaction
 */

import { useState, useEffect } from 'react';
import { walletApi, type Transaction } from '../../services/walletApi';
import { fmtNum, StatusChip } from '../../components/ui';
import { AddressIdentity } from '../../components/WalletIdentity';

interface TransactionDetailModalProps {
  transactionId: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * The wallet this row was read from. A chain transfer is a send for its
   * sender and a receive for its recipient, and only the address says which —
   * without it the detail would default to the sender's point of view and
   * show an incoming payment as though this account had paid it.
   */
  address?: string;
}

export function TransactionDetailModal({ transactionId, isOpen, onClose, address }: TransactionDetailModalProps) {
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !transactionId) return;

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);

      const result = await walletApi.getTransactionDetail(transactionId, address);
      if (result.ok && result.data) {
        setTransaction(result.data);
      } else {
        setError(result.error || 'Failed to load transaction details');
      }
      setLoading(false);
    };

    fetchDetail();
  }, [transactionId, isOpen, address]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%', maxHeight: '80vh', overflowY: 'auto', position: 'relative' }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            opacity: 0.7,
          }}
        >
          ✕
        </button>

        <div style={{ paddingRight: '32px' }}>
          <h2 style={{ marginTop: 0 }}>Transaction Details</h2>

          {loading && <div style={{ textAlign: 'center', padding: '32px', opacity: 0.6 }}>Loading...</div>}

          {error && (
            <div style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: '12px', borderRadius: '4px', color: 'var(--red)', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {transaction && (
            <>
              {/* Type and Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                <div>
                  <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</div>
                  {/* The category the server published, with the direction under
                      it: a stake the wallet signed reads "Staked / sent by this
                      wallet", which is two different facts the old single word
                      could not carry. */}
                  <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '4px' }}>{transaction.txTypeLabel}</div>
                  <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>
                    {transaction.type === 'receive' ? 'received by this wallet' : 'sent by this wallet'}
                  </div>
                  {transaction.msgType && (
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', opacity: 0.55, marginTop: '4px' }} title="On-chain message type">
                      {transaction.msgType}
                    </div>
                  )}
                </div>
                <StatusChip status={transaction.status} />
              </div>

              {/* Amount and Asset */}
              <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Amount</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--gold)' }}>
                  {fmtNum(transaction.amount)} <span style={{ fontSize: '16px', opacity: 0.8 }}>{transaction.asset}</span>
                </div>
              </div>

              {/* Transaction ID */}
              <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Transaction ID</div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    wordBreak: 'break-all',
                    padding: '8px',
                    backgroundColor: 'var(--bg-2)',
                    borderRadius: '4px',
                  }}
                >
                  {transaction.id}
                </div>
              </div>

              {/* Transaction hash, only when it is a different string from the
                  id above: for a chain row they are the same value, and
                  printing it twice reads as two identifiers. */}
              {transaction.hash && transaction.hash !== transaction.id && (
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Transaction Hash</div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      wordBreak: 'break-all',
                      padding: '8px',
                      backgroundColor: 'var(--bg-2)',
                      borderRadius: '4px',
                    }}
                  >
                    {transaction.hash}
                  </div>
                </div>
              )}

              {/* From Address */}
              {transaction.from && (
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>From</div>
                  {/* Whose wallet this is, when the account behind the address
                      has a picture and has not hidden its profile. The address
                      itself stays below in full — this adds the face, it does
                      not replace the thing you would copy. */}
                  <div style={{ marginBottom: '8px' }}>
                    <AddressIdentity address={transaction.from} label="From" size={22} showAddress={false} />
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      wordBreak: 'break-all',
                      padding: '8px',
                      backgroundColor: 'var(--bg-2)',
                      borderRadius: '4px',
                    }}
                  >
                    {transaction.from}
                  </div>
                </div>
              )}

              {/* To Address */}
              {transaction.to && (
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>To</div>
                  <div style={{ marginBottom: '8px' }}>
                    <AddressIdentity address={transaction.to} label="To" size={22} showAddress={false} />
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      wordBreak: 'break-all',
                      padding: '8px',
                      backgroundColor: 'var(--bg-2)',
                      borderRadius: '4px',
                    }}
                  >
                    {transaction.to}
                  </div>
                </div>
              )}

              {/* Fee */}
              {transaction.fee !== undefined && (
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Network Fee</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                    {fmtNum(transaction.fee)} {transaction.asset}
                  </div>
                </div>
              )}

              {/* Block Number (if confirmed) */}
              {transaction.blockNumber !== undefined && (
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Block Number</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', fontFamily: 'monospace' }}>{transaction.blockNumber}</div>
                </div>
              )}

              {/* Note */}
              {transaction.note && (
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Note</div>
                  <div style={{ fontSize: '14px', padding: '8px', backgroundColor: 'var(--bg-2)', borderRadius: '4px' }}>{transaction.note}</div>
                </div>
              )}

              {/* Gas used (chain transactions only — a queued record has no
                  gas figure until the chain answers for it) */}
              {transaction.gasUsed !== undefined && (
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--bg-2)' }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Gas Used</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', fontFamily: 'monospace' }}>{transaction.gasUsed.toLocaleString()}</div>
                </div>
              )}

              {/* Timestamp */}
              <div style={{ marginBottom: '24px', paddingBottom: '16px' }}>
                <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Timestamp</div>
                {/* 0 is what the backend publishes for "the node gave no
                    readable time". new Date(0) would render 1 January 1970 —
                    a wrong answer that looks like a real one. */}
                <div style={{ fontSize: '14px' }}>
                  {transaction.ts > 0 ? new Date(transaction.ts).toLocaleString() : 'Not reported by the node'}
                </div>
              </div>

              {/* Close Button */}
              <button onClick={onClose} className="btn btn-primary" style={{ width: '100%' }}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

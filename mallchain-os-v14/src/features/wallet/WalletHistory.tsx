import { useState, useCallback } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, StatusChip, toast } from '../../components/ui';
import { useTransactionData } from '../../hooks/useTransactionData';
import { TransactionDetailModal } from './TransactionDetailModal';

/**
 * Task 13.5-13.12: Real transaction history with pagination, filtering, and real-time updates
 * - Fetches real transactions from API
 * - Implements pagination (20 per page)
 * - Supports type filtering (send, receive, swap, stake, etc.)
 * - Supports status filtering (pending, confirmed, failed)
 * - Real-time auto-updates via Socket.IO
 */
export default function WalletHistory() {
  useStoreVersion();
  const st = store.state;
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  // Task 13.5: Fetch real transactions with filters and pagination
  const { transactions, total, pageSize, hasMore, loading, error } = useTransactionData({
    walletAddress: st.wallet.address,
    page,
    pageSize: 20,
    type: type || undefined,
    status: status || undefined,
  });

  const totalPages = Math.ceil(total / pageSize);

  /**
   * Export transactions as CSV
   */
  const exportCsv = useCallback(() => {
    const rows = [['id', 'type', 'amount', 'asset', 'status', 'to', 'fee', 'note', 'ts'].join(',')];
    transactions.forEach((t) =>
      rows.push(
        [
          t.id,
          t.type,
          t.amount,
          t.asset,
          t.status,
          t.to || '',
          t.fee || '',
          (t.note || '').replace(/,/g, ' '),
          new Date(t.ts).toISOString(),
        ].join(',')
      )
    );
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mallchain-tx-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Transaction history exported as CSV');
  }, [transactions]);

  /**
   * Task 13.13: Loading skeleton for transactions
   */
  const TransactionSkeleton = () => (
    <div className="list-row" style={{ opacity: 0.5 }}>
      <span style={{ fontSize: 15 }}>⋯</span>
      <div className="grow">
        <div style={{ backgroundColor: 'var(--bg-2)', height: '16px', borderRadius: '4px', width: '200px' }} />
        <div
          style={{
            backgroundColor: 'var(--bg-2)',
            height: '12px',
            borderRadius: '4px',
            width: '150px',
            marginTop: '8px',
          }}
        />
      </div>
      <div style={{ backgroundColor: 'var(--bg-2)', height: '20px', borderRadius: '4px', width: '80px' }} />
    </div>
  );

  return (
    <div>
      <div className="view-head">
        <h1>Transaction history</h1>
        <span className="sub">{total} transactions</span>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={transactions.length === 0}>
          ⬇ Export CSV
        </button>
      </div>

      {/* Task 13.13: Error message */}
      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: '16px', marginBottom: '16px' }}>
          <div style={{ color: 'var(--red)', fontSize: '13px' }}>⚠ {error}</div>
        </div>
      )}

      {/* Task 13.8-13.9: Filters */}
      <div className="filter-row">
        <select className="input" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          <option value="send">Send</option>
          <option value="receive">Receive</option>
          <option value="swap">Swap</option>
          <option value="stake">Stake</option>
          <option value="reward">Reward</option>
          <option value="penalty">Penalty</option>
        </select>
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="card">
        {loading && transactions.length === 0 ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <TransactionSkeleton key={i} />
            ))}
          </>
        ) : transactions.length === 0 ? (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 26, textAlign: 'center' }}>
            No transactions yet — send or receive MALL to get started.
          </div>
        ) : (
          <>
            {/* Task 13.6: Display only real transactions */}
            {transactions.map((t) => (
              <div
                key={t.id}
                className="list-row"
                onClick={() => setSelectedTxId(t.id)}
                style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ fontSize: 15 }}>
                  {t.type === 'send' ? '➤' : t.type === 'receive' ? '⬇' : t.type === 'swap' ? '⇄' : t.type === 'stake' ? '📌' : '✦'}
                </span>
                <div className="grow">
                  <div className="t">
                    {t.type} · {fmtNum(t.amount)} {t.asset}
                  </div>
                  <div className="m mono">
                    {t.note || t.to || t.from || t.hash?.slice(0, 8) || ''} · {new Date(t.ts).toLocaleString()}
                  </div>
                </div>
                <StatusChip status={t.status} />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Task 13.7: Pagination controls */}
      {totalPages > 1 && (
        <div className="card" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
          >
            ← Previous
          </button>
          <span style={{ opacity: 0.7, fontSize: '13px' }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
          >
            Next →
          </button>
        </div>
      )}

      {/* Task 13.10: Transaction detail modal */}
      <TransactionDetailModal
        transactionId={selectedTxId || ''}
        isOpen={selectedTxId !== null}
        onClose={() => setSelectedTxId(null)}
      />
    </div>
  );
}
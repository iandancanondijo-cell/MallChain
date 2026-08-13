/**
 * Transaction History Page - Section 14
 * 
 * Complete implementation with 8 tasks:
 * 14.1: Standalone page with full layout
 * 14.2: Sortable columns (Amount, Date, Status)
 * 14.3: Advanced filtering (Type, Status, Date range)
 * 14.4: Transaction detail modal (reuse existing)
 * 14.5: Block explorer links with shortened hash
 * 14.6: CSV export functionality
 * 14.7: Search bar (address, amount)
 * 14.8: Pagination (previous/next with page indicator)
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { store } from '../store/store';
import { useStoreVersion, fmtNum, StatusChip, toast } from '../components/ui';
import { useTransactionData } from '../hooks/useTransactionData';
import { TransactionDetailModal } from '../features/wallet/TransactionDetailModal';
import { type Transaction } from '../services/walletApi';
import '../styles/transaction-history.css';

type SortColumn = 'date' | 'amount' | 'status' | null;
type SortDirection = 'asc' | 'desc';

interface FilterState {
  type: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

/**
 * Task 14.1: TransactionHistory page component
 * Standalone page route with full layout
 */
export default function TransactionHistory() {
  useStoreVersion();
  const st = store.state;

  // Task 14.2: Sortable columns state
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Task 14.3: Advanced filtering state
  const [filters, setFilters] = useState<FilterState>({
    type: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });

  // Task 14.7: Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Task 14.4: Transaction detail modal state
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  // Task 14.8: Pagination state
  const [page, setPage] = useState(1);

  // Fetch transactions with basic filters and pagination
  const { transactions, total, pageSize, loading, error } = useTransactionData({
    walletAddress: st.wallet.address,
    page,
    pageSize: 20,
    type: filters.type || undefined,
    status: filters.status || undefined,
  });

  const totalPages = Math.ceil(total / pageSize);

  /**
   * Task 14.2: Handle sort column click
   * Toggle between asc/desc or change column
   */
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Change column
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  /**
   * Task 14.2: Get sort indicator for column header
   */
  const getSortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  /**
   * Task 14.3: Check if any filters are active
   */
  const hasActiveFilters = useMemo(() => {
    return filters.type !== '' || filters.status !== '' || filters.dateFrom !== '' || filters.dateTo !== '';
  }, [filters]);

  /**
   * Task 14.3: Clear all filters
   */
  const clearAllFilters = () => {
    setFilters({
      type: '',
      status: '',
      dateFrom: '',
      dateTo: '',
    });
    setSearchQuery('');
    setPage(1);
    toast('Filters cleared');
  };

  /**
   * Task 14.7: Filter transactions by search query
   * Search by address (from/to) or amount
   */
  const filteredBySearch = useMemo(() => {
    if (!searchQuery.trim()) return transactions;

    const query = searchQuery.toLowerCase().trim();
    return transactions.filter((tx) => {
      const addressMatch = (tx.from?.toLowerCase().includes(query) || tx.to?.toLowerCase().includes(query)) ?? false;
      const amountMatch = String(tx.amount).includes(query);
      return addressMatch || amountMatch;
    });
  }, [transactions, searchQuery]);

  /**
   * Task 14.3: Filter transactions by date range
   */
  const filteredByDate = useMemo(() => {
    return filteredBySearch.filter((tx) => {
      const txDate = new Date(tx.ts);

      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        if (txDate < fromDate) return false;
      }

      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999); // Include entire end date
        if (txDate > toDate) return false;
      }

      return true;
    });
  }, [filteredBySearch, filters.dateFrom, filters.dateTo]);

  /**
   * Task 14.2: Sort transactions
   */
  const sortedTransactions = useMemo(() => {
    if (!sortColumn) return filteredByDate;

    const sorted = [...filteredByDate].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortColumn === 'amount') {
        aVal = a.amount;
        bVal = b.amount;
      } else if (sortColumn === 'date') {
        aVal = new Date(a.ts).getTime();
        bVal = new Date(b.ts).getTime();
      } else if (sortColumn === 'status') {
        aVal = a.status;
        bVal = b.status;
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return sorted;
  }, [filteredByDate, sortColumn, sortDirection]);

  /**
   * Task 14.6: Export transactions as CSV
   */
  const exportCsv = useCallback(() => {
    const rows = [['id', 'type', 'amount', 'asset', 'status', 'from', 'to', 'fee', 'note', 'timestamp'].join(',')];
    sortedTransactions.forEach((t) =>
      rows.push(
        [
          t.id,
          t.type,
          t.amount,
          t.asset,
          t.status,
          t.from || '',
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
    a.download = `mallchain-tx-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Transaction history exported as CSV');
  }, [sortedTransactions]);

  /**
   * Task 14.5: Format transaction hash for display
   * Show shortened hash with full hash on hover
   */
  const formatHashForDisplay = (hash: string | undefined) => {
    if (!hash) return '';
    if (hash.length <= 8) return hash;
    return hash.slice(0, 8);
  };

  /**
   * Task 14.5: Get block explorer URL
   */
  const getBlockExplorerUrl = (txHash: string | undefined) => {
    if (!txHash) return null;
    return `https://explorer.mallchain.io/tx/${txHash}`;
  };

  /**
   * Loading skeleton component
   */
  const TransactionSkeleton = () => (
    <div className="tx-row" style={{ opacity: 0.5 }}>
      <span style={{ fontSize: 15 }}>⋯</span>
      <div className="tx-info">
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
    <div className="page-transaction-history">
      {/* Task 14.1: Page header with title and subtitle */}
      <div className="view-head">
        <div>
          <h1>Transaction History</h1>
          <span className="sub">
            {sortedTransactions.length} of {total} transactions
            {searchQuery && ` (searching: "${searchQuery}")`}
          </span>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={exportCsv}
          disabled={sortedTransactions.length === 0}
          title="Export visible transactions as CSV"
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Error message display */}
      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: '16px', marginBottom: '16px' }}>
          <div style={{ color: 'var(--red)', fontSize: '13px' }}>⚠ {error}</div>
        </div>
      )}

      {/* Task 14.7: Search bar */}
      <div className="search-row">
        <input
          type="text"
          className="input"
          placeholder="🔍 Search by address or amount..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Task 14.3: Advanced filtering */}
      <div className="filter-section">
        <div className="filter-row">
          <select
            className="input"
            value={filters.type}
            onChange={(e) => {
              setFilters({ ...filters, type: e.target.value });
              setPage(1);
            }}
            title="Filter by transaction type"
          >
            <option value="">All types</option>
            <option value="send">Send</option>
            <option value="receive">Receive</option>
            <option value="swap">Swap</option>
            <option value="stake">Stake</option>
            <option value="unstake">Unstake</option>
            <option value="reward">Reward</option>
            <option value="penalty">Penalty</option>
            <option value="claim">Claim</option>
            <option value="escrow">Escrow</option>
          </select>

          <select
            className="input"
            value={filters.status}
            onChange={(e) => {
              setFilters({ ...filters, status: e.target.value });
              setPage(1);
            }}
            title="Filter by transaction status"
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>

          <input
            type="date"
            className="input"
            value={filters.dateFrom}
            onChange={(e) => {
              setFilters({ ...filters, dateFrom: e.target.value });
              setPage(1);
            }}
            title="From date (inclusive)"
          />

          <input
            type="date"
            className="input"
            value={filters.dateTo}
            onChange={(e) => {
              setFilters({ ...filters, dateTo: e.target.value });
              setPage(1);
            }}
            title="To date (inclusive)"
          />

          {/* Task 14.3: Clear all filters button */}
          {hasActiveFilters && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={clearAllFilters}
              title="Clear all active filters"
            >
              ✕ Clear filters
            </button>
          )}
        </div>

        {/* Task 14.3: Active filter indicator */}
        {hasActiveFilters && (
          <div className="filter-indicator">
            <span className="badge">Filters active: {
              [
                filters.type && `type=${filters.type}`,
                filters.status && `status=${filters.status}`,
                filters.dateFrom && `from=${filters.dateFrom}`,
                filters.dateTo && `to=${filters.dateTo}`,
              ].filter(Boolean).join(', ')
            }</span>
          </div>
        )}
      </div>

      {/* Transaction list card */}
      <div className="card transaction-list-card">
        {loading && sortedTransactions.length === 0 ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <TransactionSkeleton key={i} />
            ))}
          </>
        ) : sortedTransactions.length === 0 ? (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 26, textAlign: 'center' }}>
            {searchQuery ? 'No transactions match your search.' : 'No transactions found. Send or receive MALL to get started.'}
          </div>
        ) : (
          <>
            {/* Task 14.2: Column headers with sort indicators */}
            <div className="tx-header">
              <span style={{ width: '30px' }}></span>
              <span className="grow">Transaction</span>
              <button
                className="tx-col-sort"
                onClick={() => handleSort('amount')}
                title="Sort by amount"
              >
                Amount{getSortIndicator('amount')}
              </button>
              <button
                className="tx-col-sort"
                onClick={() => handleSort('date')}
                title="Sort by date"
              >
                Date{getSortIndicator('date')}
              </button>
              <button
                className="tx-col-sort"
                onClick={() => handleSort('status')}
                title="Sort by status"
              >
                Status{getSortIndicator('status')}
              </button>
              <span style={{ width: '100px' }}>Hash</span>
            </div>

            {/* Task 14.2, 14.4, 14.5: Transaction rows */}
            {sortedTransactions.map((t) => {
              const blockExplorerUrl = getBlockExplorerUrl(t.hash);
              const shortHash = formatHashForDisplay(t.hash);

              return (
                <div
                  key={t.id}
                  className="tx-row"
                  onClick={() => setSelectedTxId(t.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Transaction type icon */}
                  <span className="tx-icon" title={t.type}>
                    {t.type === 'send' ? '➤' : t.type === 'receive' ? '⬇' : t.type === 'swap' ? '⇄' : t.type === 'stake' || t.type === 'unstake' ? '📌' : t.type === 'reward' ? '✦' : t.type === 'penalty' ? '⚠' : '📋'}
                  </span>

                  {/* Transaction info */}
                  <div className="tx-info grow">
                    <div className="tx-title">
                      {t.type.charAt(0).toUpperCase() + t.type.slice(1)} · {fmtNum(t.amount)} {t.asset}
                    </div>
                    <div className="tx-detail mono">
                      {t.note || t.to || t.from || shortHash || ''} · {new Date(t.ts).toLocaleString()}
                    </div>
                  </div>

                  {/* Amount column */}
                  <div className="tx-amount">
                    {fmtNum(t.amount)} {t.asset}
                  </div>

                  {/* Date column */}
                  <div className="tx-date">
                    {new Date(t.ts).toLocaleDateString()}
                  </div>

                  {/* Status chip */}
                  <div className="tx-status">
                    <StatusChip status={t.status} />
                  </div>

                  {/* Task 14.5: Block explorer link with shortened hash */}
                  <div className="tx-hash">
                    {blockExplorerUrl ? (
                      <a
                        href={blockExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hash-link"
                        onClick={(e) => e.stopPropagation()}
                        title={`View on explorer: ${t.hash}`}
                      >
                        {shortHash}
                        <span className="link-icon">↗</span>
                      </a>
                    ) : (
                      <span className="hash-placeholder">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Task 14.8: Pagination controls */}
      {totalPages > 1 && (
        <div className="card pagination-card">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            title="Go to previous page"
          >
            ← Previous
          </button>
          <span className="page-indicator">
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
            title="Go to next page"
          >
            Next →
          </button>
        </div>
      )}

      {/* Task 14.4: Transaction detail modal (reuse existing component) */}
      <TransactionDetailModal
        transactionId={selectedTxId || ''}
        isOpen={selectedTxId !== null}
        onClose={() => setSelectedTxId(null)}
      />
    </div>
  );
}

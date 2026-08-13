/**
 * Blockchain Explorer Page
 * Displays blockchain stats, blocks, and transactions
 * Phase 7: Complete blockchain integration
 */

import { useEffect, useState, useCallback } from 'react';
import { toast } from '../components/ui';
import { getLatestBlock, getBlockchainStats, getRecentTransactions, getBlock, getTransaction } from '../services/explorerApi';
import type { BlockData, BlockStats, TransactionData } from '../services/explorerApi';
import { socketManager, type BlockData as SocketBlockData } from '../services/socket';

const fmtNum = (n: number | string | undefined | null) => {
  if (n === undefined || n === null) return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '—';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
};

const fmtTime = (ts: number) => new Date(ts * 1000).toLocaleString();
const fmtHash = (h: string) => h ? `${h.slice(0, 8)}...${h.slice(-8)}` : '—';

export default function BlockchainExplorer() {
  const [latestBlock, setLatestBlock] = useState<BlockData | null>(null);
  const [stats, setStats] = useState<BlockStats | null>(null);
  const [recentTxs, setRecentTxs] = useState<TransactionData[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);
  const [selectedTx, setSelectedTx] = useState<TransactionData | null>(null);
  const [blockSearch, setBlockSearch] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'blocks' | 'txs'>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setError('');
      const [block, blockStats, txs] = await Promise.all([
        getLatestBlock(),
        getBlockchainStats(),
        getRecentTransactions(20),
      ]);
      setLatestBlock(block);
      setStats(blockStats);
      setRecentTxs(txs);
      setLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load blockchain data';
      setError(msg);
      setLoading(false);
      if (autoRefresh) {
        setTimeout(loadData, 5000);
      }
    }
  }, [autoRefresh]);

  // Initial load + auto-refresh
  useEffect(() => {
    loadData();
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData, autoRefresh]);

  // Socket integration for real-time block updates
  useEffect(() => {
    // Connect to socket if not already connected
    if (!socketManager.isConnected()) {
      socketManager.connect();
    }

    // Subscribe to live blocks
    socketManager.subscribeBlocks();

    // Listen for new block events
    const unsubscribe = socketManager.onBlockUpdate((data: SocketBlockData) => {
      console.log('[BlockchainExplorer] Received new block from socket:', data);
      
      // Update stats height only (socket data is limited)
      setStats(prev => prev ? { ...prev, height: data.height } : null);
      
      // Fetch full block data from API to get all fields
      getLatestBlock()
        .then(block => {
          setLatestBlock(block);
          console.log('[BlockchainExplorer] Fetched full block data from API:', block);
        })
        .catch(err => {
          console.error('[BlockchainExplorer] Failed to fetch full block data:', err);
          // Fallback: update with socket data if API fails
          const timestamp = new Date(data.timestamp).getTime() / 1000;
          setLatestBlock({
            height: data.height,
            hash: data.hash,
            timestamp: timestamp,
            time: data.timestamp,
            numTxs: data.txCount,
            gasUsed: 0,
            gasWanted: 0,
            proposer: '',
          });
        });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Search block by height
  const handleBlockSearch = useCallback(async () => {
    if (!blockSearch.trim()) return;
    try {
      setError('');
      const height = parseInt(blockSearch);
      const block = await getBlock(height);
      setSelectedBlock(block);
      toast(`Block ${height} loaded`, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load block';
      setError(msg);
      toast(msg, false);
    }
  }, [blockSearch]);

  // Search transaction by hash
  const handleTxSearch = useCallback(async () => {
    if (!txSearch.trim()) return;
    try {
      setError('');
      const tx = await getTransaction(txSearch);
      setSelectedTx(tx);
      toast('Transaction loaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load transaction';
      setError(msg);
      toast(msg, false);
    }
  }, [txSearch]);

  // Loading state
  if (loading && !stats) {
    return (
      <div className="page-explorer">
        <div className="view-head">
          <h1>🔗 Blockchain Explorer</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--txt-3)' }}>
          Loading blockchain data...
        </div>
      </div>
    );
  }

  return (
    <div className="page-explorer">
      {/* Header */}
      <div className="view-head">
        <div>
          <h1>🔗 Blockchain Explorer</h1>
          <span className="sub">Real-time blockchain statistics and data</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ color: 'var(--txt-3)', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ marginRight: '6px' }}
            />
            Auto-refresh
          </label>
          <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: '12px', marginBottom: '16px' }}>
          <div style={{ color: 'var(--red)', fontSize: '13px' }}>⚠ {error}</div>
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Current Block Height</div>
            <div className="stat-value">{stats.height ? stats.height.toLocaleString() : '—'}</div>
            <div className="stat-detail">Network: {stats.chainId || '—'}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Transactions in Block</div>
            <div className="stat-value">{stats.numTxs ?? '—'}</div>
            <div className="stat-detail">Total: {fmtNum(stats.totalTxs)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Avg Block Time</div>
            <div className="stat-value">{stats.averageBlockTime?.toFixed(2) || '—'}s</div>
            <div className="stat-detail">Block production rate</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Node Version</div>
            <div className="stat-value" style={{ fontSize: '14px', fontFamily: 'monospace' }}>
              {stats.nodeVersion || '—'}
            </div>
            <div className="stat-detail">Blockchain software</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-row">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`tab ${activeTab === 'blocks' ? 'active' : ''}`}
          onClick={() => setActiveTab('blocks')}
        >
          📦 Blocks
        </button>
        <button
          className={`tab ${activeTab === 'txs' ? 'active' : ''}`}
          onClick={() => setActiveTab('txs')}
        >
          💸 Transactions
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && latestBlock && (
        <div className="card">
          <div className="card-title">Latest Block</div>
          <div className="block-info">
            <div className="info-row">
              <span className="label">Block Height:</span>
              <span className="value mono">{latestBlock.height}</span>
            </div>
            <div className="info-row">
              <span className="label">Block Hash:</span>
              <span className="value mono" title={latestBlock.hash}>
                {fmtHash(latestBlock.hash)}
              </span>
            </div>
            <div className="info-row">
              <span className="label">Timestamp:</span>
              <span className="value">{fmtTime(latestBlock.timestamp)}</span>
            </div>
            <div className="info-row">
              <span className="label">Transactions:</span>
              <span className="value">{latestBlock.numTxs}</span>
            </div>
            <div className="info-row">
              <span className="label">Proposer:</span>
              <span className="value mono" title={latestBlock.proposer}>
                {fmtHash(latestBlock.proposer)}
              </span>
            </div>
            <div className="info-row">
              <span className="label">Gas Used:</span>
              <span className="value">{fmtNum(latestBlock.gasUsed)} / {fmtNum(latestBlock.gasWanted)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Blocks Tab */}
      {activeTab === 'blocks' && (
        <div>
          <div className="search-row" style={{ marginBottom: '16px' }}>
            <input
              type="number"
              className="input"
              placeholder="🔍 Search block height..."
              value={blockSearch}
              onChange={(e) => setBlockSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleBlockSearch()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleBlockSearch} disabled={!blockSearch || loading}>
              Search
            </button>
          </div>

          {selectedBlock && (
            <div className="card">
              <div className="card-title">Block #{selectedBlock.height}</div>
              <div className="block-info">
                <div className="info-row">
                  <span className="label">Hash:</span>
                  <span className="value mono">{selectedBlock.hash}</span>
                </div>
                <div className="info-row">
                  <span className="label">Timestamp:</span>
                  <span className="value">{fmtTime(selectedBlock.timestamp)}</span>
                </div>
                <div className="info-row">
                  <span className="label">Transactions:</span>
                  <span className="value">{selectedBlock.numTxs}</span>
                </div>
                <div className="info-row">
                  <span className="label">Proposer:</span>
                  <span className="value mono">{selectedBlock.proposer}</span>
                </div>
                <div className="info-row">
                  <span className="label">Gas Used/Wanted:</span>
                  <span className="value">{fmtNum(selectedBlock.gasUsed)} / {fmtNum(selectedBlock.gasWanted)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'txs' && (
        <div>
          <div className="search-row" style={{ marginBottom: '16px' }}>
            <input
              type="text"
              className="input"
              placeholder="🔍 Search transaction hash..."
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleTxSearch()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleTxSearch} disabled={!txSearch || loading}>
              Search
            </button>
          </div>

          {selectedTx && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-title">Transaction Details</div>
              <div className="block-info">
                <div className="info-row">
                  <span className="label">Hash:</span>
                  <span className="value mono">{selectedTx.hash}</span>
                </div>
                <div className="info-row">
                  <span className="label">Height:</span>
                  <span className="value">{selectedTx.height}</span>
                </div>
                <div className="info-row">
                  <span className="label">Status:</span>
                  <span className="value" style={{ color: selectedTx.status === 'success' ? 'var(--green)' : 'var(--red)' }}>
                    {selectedTx.status.toUpperCase()}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Timestamp:</span>
                  <span className="value">{new Date(selectedTx.timestamp * 1000).toLocaleString()}</span>
                </div>
                <div className="info-row">
                  <span className="label">Gas Used/Wanted:</span>
                  <span className="value">{fmtNum(selectedTx.gasUsed)} / {fmtNum(selectedTx.gasWanted)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-title">Recent Transactions</div>
            <div className="tx-list">
              {recentTxs.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--txt-3)' }}>
                  No transactions available
                </div>
              ) : (
                recentTxs.map((tx) => (
                  <div
                    key={tx.hash}
                    className="tx-item"
                    onClick={() => setSelectedTx(tx)}
                    style={{ cursor: 'pointer', padding: '12px', borderBottom: '1px solid var(--bg-2)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="mono" style={{ fontSize: '12px' }}>
                          {fmtHash(tx.hash)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--txt-3)' }}>
                          Block {tx.height} · {new Date(tx.timestamp * 1000).toLocaleString()}
                        </div>
                      </div>
                      <div
                        style={{
                          color: tx.status === 'success' ? 'var(--green)' : 'var(--red)',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}
                      >
                        {tx.status.toUpperCase()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

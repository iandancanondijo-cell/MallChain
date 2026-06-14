import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { ChainIconFilled, StatsIcon, SearchIcon, UserIcon } from './Icons'

const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export default function BlockchainTransactions() {
  const [txs, setTxs] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedTab, setSelectedTab] = useState('recent') // 'recent', 'stats', 'search'
  const [searchHash, setSearchHash] = useState('')
  const [searchAddress, setSearchAddress] = useState('')

  // Fetch blockchain stats
  useEffect(() => {
    axios.get(`${base}/api/blockchain/stats`)
      .then(res => setStats(res.data))
      .catch(err => console.error('Failed to fetch stats:', err))
  }, [])

  // Fetch recent blockchain transactions
  useEffect(() => {
    if (selectedTab !== 'recent') return
    setLoading(true)
    
    axios.get(`${base}/api/blockchain/all?page=${page}&limit=50`)
      .then(res => setTxs(res.data.transactions || []))
      .catch(err => {
        console.error('Failed to fetch transactions:', err)
        setTxs([])
      })
      .finally(() => setLoading(false))
  }, [page, selectedTab])

  const handleSearchHash = async () => {
    if (!searchHash.trim()) return
    setLoading(true)
    
    try {
      const res = await axios.get(`${base}/api/blockchain/${searchHash.trim()}`)
      setTxs([res.data])
    } catch (err) {
      console.error('Transaction not found:', err)
      setTxs([])
    } finally {
      setLoading(false)
    }
  }

  const handleSearchAddress = async () => {
    if (!searchAddress.trim()) return
    setLoading(true)
    
    try {
      const res = await axios.get(`${base}/api/blockchain/address/txs?address=${searchAddress.trim()}&limit=50`)
      setTxs(res.data.transactions || [])
    } catch (err) {
      console.error('Failed to fetch address transactions:', err)
      setTxs([])
    } finally {
      setLoading(false)
    }
  }

  const formatAddress = (addr) => {
    if (!addr) return '—'
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`
  }

  const formatHash = (hash) => {
    if (!hash) return '—'
    return `${hash.slice(0, 12)}...${hash.slice(-8)}`
  }

  const getStatusColor = (code) => {
    return code === 0 || code === undefined ? '#22c55e' : '#ef4444'
  }

  const getStatusText = (code) => {
    return code === 0 || code === undefined ? '✓ Success' : `✗ Failed (${code})`
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg,#10151c 60%,#232b38 100%)', padding: '20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: 'Inter, system-ui' }}>
        {/* Header */}
        <div style={{ paddingTop: 20, marginBottom: 32 }}>
          <h2 style={{ marginBottom: 8, fontWeight: 700, fontSize: 32, color: '#a3e635', letterSpacing: -1 }}><ChainIconFilled size={32} color="#a3e635" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} /> Mallchain Explorer</h2>
          <p style={{ color: '#888', fontSize: 15 }}>View all transactions recorded on Mallchain</p>
        </div>

        {/* Stats Box */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: '#181f29', borderRadius: 12, padding: 16, border: '1px solid #232b38' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Chain</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#a3e635' }}>{stats.chain || '—'}</div>
            </div>
            <div style={{ background: '#181f29', borderRadius: 12, padding: 16, border: '1px solid #232b38' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Latest Height</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#a3e635' }}>{stats.latestHeight || '—'}</div>
            </div>
            <div style={{ background: '#181f29', borderRadius: 12, padding: 16, border: '1px solid #232b38' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Tx in Latest Block</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#a3e635' }}>{stats.txCount || '0'}</div>
            </div>
            <div style={{ background: '#181f29', borderRadius: 12, padding: 16, border: '1px solid #232b38' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Node</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#ddd', wordBreak: 'break-all' }}>{stats.moniker || '—'}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #232b38', paddingBottom: 12 }}>
          {[
            { id: 'recent', Icon: StatsIcon, label: 'Recent Transactions' },
            { id: 'search', Icon: SearchIcon, label: 'Search by Hash' },
            { id: 'address', Icon: UserIcon, label: 'Search by Address' },
            { id: 'stats', Icon: StatsIcon, label: 'Mallchain Info' }
          ].map(tab => {
            const isActive = selectedTab === tab.id;
            const iconColor = isActive ? '#181f29' : '#ddd';
            const TabIcon = tab.Icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedTab(tab.id)
                  setPage(1)
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: isActive ? '#a3e635' : '#232b38',
                  color: isActive ? '#181f29' : '#ddd',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  fontSize: 14,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <TabIcon size={16} color={iconColor} style={{ display: 'inline-block' }} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Recent Transactions Tab */}
        {selectedTab === 'recent' && (
          <div>
            <div style={{ marginBottom: 20, padding: 16, background: '#181f29', borderRadius: 12, border: '1px solid #232b38' }}>
            <div style={{ color: '#888', fontSize: 14, marginBottom: 12 }}>Showing transactions from the Mallchain ledger:</div>
              {loading ? (
                <div style={{ color: '#a3e635', fontWeight: 600 }}>⏳ Loading...</div>
              ) : txs.length === 0 ? (
                <div style={{ color: '#ddd', opacity: 0.6 }}>No transactions found</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: '#fff' }}>
                    <thead>
                      <tr style={{ background: '#232b38', color: '#a3e635', fontWeight: 700 }}>
                        <th style={{ padding: '10px 8px', textAlign: 'left' }}>Height</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left' }}>Tx Hash</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Gas Used / Wanted</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left' }}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map((tx, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#16232a' : '#1a2230', borderBottom: '1px solid #232b38' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 600, color: '#a3e635' }}>{tx.height}</td>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: '#a3e635' }} title={tx.txHash}>
                            {formatHash(tx.txHash)}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <span style={{ color: getStatusColor(tx.code), fontWeight: 600 }}>
                              {getStatusText(tx.code)}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', color: '#ddd', fontSize: 11 }}>
                            {tx.gas_used}/{tx.gas_wanted}
                          </td>
                          <td style={{ padding: '10px 8px', fontSize: 11, color: '#888' }}>
                            {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {txs.length > 0 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid #232b38',
                    background: page === 1 ? '#232b38' : '#181f29',
                    color: page === 1 ? '#666' : '#a3e635',
                    cursor: page === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ← Previous
                </button>
                <div style={{ padding: '8px 16px', background: '#181f29', borderRadius: 6, color: '#a3e635', fontWeight: 600 }}>
                  Page {page}
                </div>
                <button
                  onClick={() => setPage(page + 1)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid #232b38',
                    background: '#181f29',
                    color: '#a3e635',
                    cursor: 'pointer'
                  }}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search by Hash Tab */}
        {selectedTab === 'search' && (
          <div style={{ padding: 20, background: '#181f29', borderRadius: 12, border: '1px solid #232b38' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <input
                value={searchHash}
                onChange={e => setSearchHash(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSearchHash()}
                placeholder="Enter transaction hash..."
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #232b38',
                  background: '#16232a',
                  color: '#fff',
                  fontSize: 14
                }}
              />
              <button
                onClick={handleSearchHash}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#a3e635',
                  color: '#181f29',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Search
              </button>
            </div>

            {loading ? (
              <div style={{ color: '#a3e635', fontWeight: 600 }}>⏳ Searching...</div>
            ) : txs.length > 0 && txs[0].txHash ? (
              <div style={{ background: '#16232a', borderRadius: 10, padding: 16, border: '1px solid #232b38' }}>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>Transaction Details:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, color: '#fff', fontSize: 13 }}>
                  <div>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Hash</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#a3e635', wordBreak: 'break-all' }}>
                      {txs[0].txHash}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Height</div>
                    <div style={{ fontWeight: 600, color: '#a3e635' }}>{txs[0].height}</div>
                  </div>
                  <div>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Status</div>
                    <div style={{ color: getStatusColor(txs[0].code), fontWeight: 600 }}>
                      {getStatusText(txs[0].code)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Time</div>
                    <div>{txs[0].timestamp ? new Date(txs[0].timestamp).toLocaleString() : '—'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Gas Used</div>
                    <div>{txs[0].gas_used}</div>
                  </div>
                  <div>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Gas Wanted</div>
                    <div>{txs[0].gas_wanted}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#ddd', opacity: 0.6 }}>Enter a transaction hash to search</div>
            )}
          </div>
        )}

        {/* Search by Address Tab */}
        {selectedTab === 'address' && (
          <div style={{ padding: 20, background: '#181f29', borderRadius: 12, border: '1px solid #232b38' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <input
                value={searchAddress}
                onChange={e => setSearchAddress(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSearchAddress()}
                placeholder="Enter wallet address (mall1...)..."
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #232b38',
                  background: '#16232a',
                  color: '#fff',
                  fontSize: 14
                }}
              />
              <button
                onClick={handleSearchAddress}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#a3e635',
                  color: '#181f29',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Search
              </button>
            </div>

            {loading ? (
              <div style={{ color: '#a3e635', fontWeight: 600 }}>⏳ Loading...</div>
            ) : txs.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: '#fff' }}>
                  <thead>
                    <tr style={{ background: '#232b38', color: '#a3e635' }}>
                      <th style={{ padding: '10px 8px', textAlign: 'left' }}>Height</th>
                      <th style={{ padding: '10px 8px', textAlign: 'left' }}>Tx Hash</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '10px 8px', textAlign: 'left' }}>From/To</th>
                      <th style={{ padding: '10px 8px', textAlign: 'left' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? '#16232a' : '#1a2230' }}>
                        <td style={{ padding: '10px 8px', color: '#a3e635', fontWeight: 600 }}>{tx.height}</td>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: '#a3e635', fontSize: 10 }}>
                          {formatHash(tx.txHash)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span style={{ color: getStatusColor(tx.code), fontWeight: 600 }}>
                            {getStatusText(tx.code)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', fontSize: 11 }}>
                          {tx.transfers && tx.transfers.length > 0 ? (
                            <div>
                              {tx.transfers.map((t, i) => (
                                <div key={i} style={{ margin: '2px 0', color: '#ddd' }}>
                                  {formatAddress(t.from)} → {formatAddress(t.to)}
                                </div>
                              ))}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', fontSize: 11, color: '#888' }}>
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: '#ddd', opacity: 0.6 }}>Enter a wallet address to search</div>
            )}
          </div>
        )}

        {/* Stats Tab */}
        {selectedTab === 'stats' && stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div style={{ background: '#181f29', borderRadius: 12, padding: 20, border: '1px solid #232b38' }}>
              <h3 style={{ color: '#a3e635', marginBottom: 12, fontWeight: 700 }}>Mallchain Info</h3>
              <div style={{ fontSize: 13, color: '#ddd', lineHeight: 2 }}>
                <div><strong>Chain ID:</strong> {stats.chain}</div>
                <div><strong>Version:</strong> {stats.version}</div>
                <div><strong>Latest Height:</strong> {stats.latestHeight}</div>
                <div><strong>Node:</strong> {stats.moniker}</div>
              </div>
            </div>

            <div style={{ background: '#181f29', borderRadius: 12, padding: 20, border: '1px solid #232b38' }}>
              <h3 style={{ color: '#a3e635', marginBottom: 12, fontWeight: 700 }}>Latest Block</h3>
              <div style={{ fontSize: 13, color: '#ddd', lineHeight: 2 }}>
                <div><strong>Block Time:</strong> {stats.latestTime ? new Date(stats.latestTime).toLocaleString() : '—'}</div>
                <div><strong>Transactions:</strong> {stats.txCount}</div>
                <div><strong>Status:</strong> <span style={{ color: '#22c55e', fontWeight: 600 }}>● Synced</span></div>
              </div>
            </div>

            <div style={{ background: '#181f29', borderRadius: 12, padding: 20, border: '1px solid #232b38', gridColumn: '1 / -1' }}>
              <h3 style={{ color: '#a3e635', marginBottom: 12, fontWeight: 700 }}>Resources</h3>
              <div style={{ fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <a
                  href="http://localhost:1317/cosmos/gov/v1beta1/proposals"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#a3e635', textDecoration: 'none', fontWeight: 600 }}
                >
                  📋 Governance Proposals →
                </a>
                <a
                  href="http://localhost:1317/cosmos/staking/v1beta1/validators"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#a3e635', textDecoration: 'none', fontWeight: 600 }}
                >
                  🏆 Validators →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

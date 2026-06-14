import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function TxHistory({ address }) {
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('any') // 'sender', 'receiver', 'any'
  const [statusFilter, setStatusFilter] = useState('any') // 'pending', 'confirmed', 'failed', 'any'
  const [search, setSearch] = useState('')
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  useEffect(() => {
    if (!address) return
    setLoading(true)
    
    // Call the new transaction history API endpoint
    const params = new URLSearchParams({
      address,
      role: filter === 'any' ? 'any' : filter,
      status: statusFilter === 'any' ? undefined : statusFilter,
      limit: 100
    })
    
    axios.get(`${base}/api/tx/history/wallet?${params.toString()}`)
      .then(res => {
        setTxs(res.data.transactions || [])
      })
      .catch(err => {
        console.error('Failed to fetch transaction history:', err)
        setTxs([])
      })
      .finally(() => setLoading(false))
  }, [address, filter, statusFilter])

  if (!address) return null

  // Filtering and search
  const filteredTxs = txs.filter(tx => {
    // Search in txId, txHash, sender, receiver
    if (search && !(
      (tx.txId && tx.txId.toLowerCase().includes(search.toLowerCase())) ||
      (tx.txHash && tx.txHash.toLowerCase().includes(search.toLowerCase())) ||
      (tx.to && tx.to.toLowerCase().includes(search.toLowerCase())) ||
      (tx.from && tx.from.toLowerCase().includes(search.toLowerCase()))
    )) return false
    return true
  })

  const formatAddress = (addr) => {
    if (!addr) return '—'
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`
  }

  const formatAmount = (amount) => {
    return typeof amount === 'number' ? amount.toFixed(6) : amount
  }

  const formatDate = (obj) => {
    if (obj && obj.createdAt) {
      return new Date(obj.createdAt).toLocaleString()
    }
    return '—'
  }

  const getStatusColor = (status) => {
    switch(status) {
      case 'pending': return '#facc15'
      case 'confirmed': return '#22c55e'
      case 'failed': return '#ef4444'
      default: return '#a3e635'
    }
  }

  const getTransactionType = (tx) => {
    if (tx.from === address) return '📤 Sent'
    if (tx.to === address) return '📥 Received'
    return '•'
  }

  return (
    <div style={{ marginTop: 32, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002', padding: 32, maxWidth: 1000, marginLeft: 'auto', marginRight: 'auto' }}>
      <h3 style={{ marginBottom: 18, fontWeight: 700, fontSize: 22, color: '#a3e635', letterSpacing: -1 }}>📊 Transaction History</h3>
      
      {/* Your Address Info */}
      <div style={{marginBottom: 20, padding: 12, background: '#181f29', borderRadius: 10, border: '1px solid #232b38', fontSize: 13, color: '#888'}}>
        <strong style={{color: '#a3e635'}}>Your Address:</strong> <code style={{color: '#ddd'}}>{formatAddress(address)}</code>
      </div>
      
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        {/* Role Filter */}
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #232b38', background: '#181f29', color: '#fff', fontSize: 15 }}>
          <option value="any">All Transactions</option>
          <option value="sender">Sent Only</option>
          <option value="receiver">Received Only</option>
        </select>
        
        {/* Status Filter */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #232b38', background: '#181f29', color: '#fff', fontSize: 15 }}>
          <option value="any">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="failed">Failed</option>
        </select>
        
        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ID, hash, or address..." style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #232b38', background: '#181f29', color: '#fff', fontSize: 15 }} />
      </div>
      
      {loading ? (
        <div style={{ color: '#a3e635', fontWeight: 600, fontSize: 18, textAlign: 'center', padding: 40 }}>⏳ Loading...</div>
      ) : filteredTxs.length === 0 ? (
        <div style={{ color: '#fff', opacity: 0.6, fontSize: 16, textAlign: 'center', padding: 40 }}>No transactions found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', background: '#181f29', borderRadius: 12 }}>
            <thead>
              <tr style={{ background: '#232b38', color: '#a3e635' }}>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'left' }}>Type</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'left' }}>From</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'left' }}>To</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'right' }}>Fee</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'left' }}>TX ID</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'left' }}>Chain Hash</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'left' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredTxs.map((tx, idx) => (
                <tr key={tx._id || idx} style={{ background: idx % 2 === 0 ? '#16232a' : '#1a2230', color: '#fff', borderBottom: '1px solid #232b38' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{getTransactionType(tx)}</td>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 12, color: tx.from === address ? '#a3e635' : '#ddd' }}>
                    {formatAddress(tx.from)}
                  </td>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 12, color: tx.to === address ? '#a3e635' : '#ddd' }}>
                    {formatAddress(tx.to)}
                  </td>
                  <td style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>{formatAmount(tx.amount)} MLCNS</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: '#888' }}>{tx.fee || 0.0002} MLCNS</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <span style={{ 
                      color: getStatusColor(tx.status), 
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: getStatusColor(tx.status) + '20',
                      display: 'inline-block'
                    }}>
                      {tx.status === 'pending' && '⏳ Pending'}
                      {tx.status === 'confirmed' && '✓ Confirmed'}
                      {tx.status === 'failed' && '✗ Failed'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 11, color: '#a3e635', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.txId}>
                    {tx.txId ? tx.txId.slice(0, 12) + '...' : '—'}
                  </td>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 11, color: '#a3e635', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.txHash}>
                    {tx.txHash ? tx.txHash.slice(0, 12) + '...' : '—'}
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 12, color: '#888' }}>
                    {formatDate(tx)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <div style={{marginTop: 16, fontSize: 12, color: '#888'}}>
        Total: <strong style={{color: '#a3e635'}}>{filteredTxs.length}</strong> transaction{filteredTxs.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

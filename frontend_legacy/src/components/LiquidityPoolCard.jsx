import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LiquidityPoolCard() {
  const [pool, setPool] = useState(null)
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  useEffect(() => {
    const fetchPoolData = async () => {
      try {
        const base = import.meta.env.VITE_API_BASE || ''
        const response = await fetch(`${base}/api/liquidity/pools`)
        if (response.ok) {
          const data = await response.json()
          // Get the KES pool
          const kesPool = data.pools?.find(p => p.name.includes('KES'))
          if (kesPool) {
            setPool(kesPool)
          }
        }
      } catch (e) {
        console.error('Failed to fetch pool data:', e)
      }
      setLoading(false)
    }

    fetchPoolData()
    // Refresh every 30 seconds
    const interval = setInterval(fetchPoolData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div style={{
        background: 'linear-gradient(120deg,#232b38 80%,#a3e63522 100%)',
        borderRadius: 14,
        padding: 22,
        boxShadow: '0 2px 12px #0003',
        minHeight: 180,
        display: 'flex',
        flexDirection: 'column',
        color: '#a3e635',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 22, marginRight: 10 }}>💧</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Liquidity Pool</span>
        </div>
        <div>Loading pool data…</div>
      </div>
    )
  }

  if (!pool) {
    return (
      <div style={{
        background: 'linear-gradient(120deg,#232b38 80%,#a3e63522 100%)',
        borderRadius: 14,
        padding: 22,
        boxShadow: '0 2px 12px #0003',
        minHeight: 180,
        display: 'flex',
        flexDirection: 'column',
        color: '#a3e635',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 22, marginRight: 10 }}>💧</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Liquidity Pool</span>
        </div>
        <div>No pool data available</div>
      </div>
    )
  }

  const tvlFormatted = pool.tvl ? (pool.tvl / 1000000).toFixed(1) : '0'
  const volumeFormatted = pool.volume24h ? (pool.volume24h / 1000000).toFixed(2) : '0'

  return (
    <div style={{
      background: 'linear-gradient(120deg,#232b38 80%,#a3e63522 100%)',
      borderRadius: 14,
      padding: 22,
      boxShadow: '0 2px 12px #0003',
      minHeight: 180,
      display: 'flex',
      flexDirection: 'column',
      cursor: 'pointer',
      transition: 'transform 0.2s, box-shadow 0.2s',
      _hover: {
        transform: 'translateY(-2px)',
        boxShadow: '0 4px 16px #a3e63544',
      }
    }}
    onClick={() => nav('/liquidity')}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)'
      e.currentTarget.style.boxShadow = '0 4px 16px #a3e63544'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.boxShadow = '0 2px 12px #0003'
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 22, marginRight: 10 }}>💧</span>
        <span style={{ color: '#a3e635', fontWeight: 700, fontSize: 18 }}>Liquidity Pool</span>
      </div>

      {/* Pool Name */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#fff', opacity: 0.6, marginBottom: 4 }}>Pool</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{pool.name}</div>
      </div>

      {/* Key Metrics */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: 12, 
        marginBottom: 14,
        flex: 1 
      }}>
        <div style={{ background: '#1a222e', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: '#a3e635', opacity: 0.8, marginBottom: 4 }}>TVL</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#a3e635' }}>${tvlFormatted}M</div>
        </div>
        <div style={{ background: '#1a222e', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: '#a3e635', opacity: 0.8, marginBottom: 4 }}>APY</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#4ade80' }}>{pool.apy}%</div>
        </div>
        <div style={{ background: '#1a222e', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: '#a3e635', opacity: 0.8, marginBottom: 4 }}>24h Volume</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#a3e635' }}>${volumeFormatted}M</div>
        </div>
        <div style={{ background: '#1a222e', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: '#a3e635', opacity: 0.8, marginBottom: 4 }}>Fee</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{pool.fee}%</div>
        </div>
      </div>

      {/* Manage Button */}
      <button
        onClick={() => nav('/liquidity')}
        style={{
          width: '100%',
          padding: '10px 0',
          borderRadius: 8,
          border: 'none',
          background: 'linear-gradient(90deg,#a3e635,#65a30d)',
          color: '#181f29',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          boxShadow: '0 2px 8px #a3e63544',
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.9'}
        onMouseLeave={(e) => e.target.style.opacity = '1'}
      >
        Manage Liquidity →
      </button>
    </div>
  )
}

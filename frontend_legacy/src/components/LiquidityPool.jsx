import React, { useEffect, useState } from 'react'

export default function LiquidityPool() {
  const [pools, setPools] = useState([])
  const [selectedPool, setSelectedPool] = useState(null)
  const [activeTab, setActiveTab] = useState('add') // 'add' or 'remove'
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [lpTokens, setLpTokens] = useState('')
  const [slippage, setSlippage] = useState(0.5)
  const [walletAddress, setWalletAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [position, setPosition] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [balances, setBalances] = useState({ token0: null })

  // Fetch pools from backend on mount
  useEffect(() => {
    const addr = localStorage.getItem('mall_bech32') || localStorage.getItem('mall_address') || ''
    if (addr) setWalletAddress(addr)

    const fetchPools = async () => {
      try {
        const base = import.meta.env.VITE_API_BASE || ''
        const response = await fetch(`${base}/api/liquidity/pools`)
        if (response.ok) {
          const data = await response.json()
          // Filter to only KES pool
          const kesPools = data.pools.filter(p => p.name.includes('KES'))
          setPools(kesPools)
          if (kesPools.length > 0) {
            setSelectedPool(kesPools[0])
          }
        } else {
          setError('Failed to load pools from API')
          setPools([])
          setSelectedPool(null)
        }
      } catch (e) {
        console.error('Failed to fetch pools:', e)
        setError('Failed to load pools from API')
        setPools([])
        setSelectedPool(null)
      }
      setDataLoading(false)
    }
    fetchPools()
  }, [])

  // Fetch user position and balances when pool or wallet changes
  useEffect(() => {
    const fetchPosition = async () => {
      if (!selectedPool || !walletAddress) {
        setPosition(null)
        return
      }
      try {
        const base = import.meta.env.VITE_API_BASE || ''
        const url = `${base}/api/liquidity/position?poolId=${selectedPool.id}&userAddress=${encodeURIComponent(walletAddress)}`
        const r = await fetch(url)
        if (r.ok) {
          const data = await r.json()
          setPosition(data)
        } else {
          setPosition(null)
        }
      } catch (e) {
        console.error('position fetch failed', e)
        setPosition(null)
      }
    }

    const fetchBalances = async () => {
      if (!walletAddress) return
      try {
        const base = import.meta.env.VITE_API_BASE || ''
        const r = await fetch(`${base}/api/mallwallet/balance/${encodeURIComponent(walletAddress)}`)
        if (r.ok) {
          const data = await r.json()
          setBalances({ token0: data.balance })
        }
      } catch (e) {
        console.error('balance fetch failed', e)
      }
    }

    fetchPosition()
    fetchBalances()
  }, [selectedPool, walletAddress])

  // Calculate amount1 based on amount0 input (constant product formula)
  useEffect(() => {
    if (amount0 && selectedPool && selectedPool.reserve0 > 0) {
      const ratio = selectedPool.reserve1 / selectedPool.reserve0
      const calculated = (parseFloat(amount0) * ratio).toFixed(6)
      setAmount1(calculated)
    }
  }, [amount0, selectedPool])

  // Calculate LP tokens based on amounts
  useEffect(() => {
    if (amount0 && amount1 && selectedPool) {
      const liquidity = Math.sqrt(parseFloat(amount0) * parseFloat(amount1))
      setLpTokens(liquidity.toFixed(6))
    }
  }, [amount0, amount1])

  useEffect(() => {
    setStatus('')
    setError('')
  }, [selectedPool])

  const handleAddLiquidity = async () => {
    if (!amount0 || !amount1) {
      setError('Please enter both amounts')
      return
    }
    if (!walletAddress) {
      setError('Please connect or enter a wallet address first')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const base = import.meta.env.VITE_API_BASE || ''
      const response = await fetch(`${base}/api/liquidity/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: selectedPool.id,
          amount0: parseFloat(amount0),
          amount1: parseFloat(amount1),
          slippage,
          userAddress: walletAddress
        })
      })

      if (!response.ok) {
        const errResp = await response.json().catch(() => ({}))
        throw new Error(errResp.error || 'Failed to add liquidity')
      }

      const payload = await response.json()
      setStatus(`Added ${payload.lpTokens} LP to ${selectedPool.name} · tx ${payload.txHash}`)
      setAmount0('')
      setAmount1('')
      setLpTokens('')
      setPosition({
        lpTokens: payload.userPosition || payload.lpTokens,
        shareOfPool: payload.shareOfPool || '0.00',
        estimatedValue: ((parseFloat(payload.userPosition || payload.lpTokens || 0) || 0) * 0.6).toFixed(2)
      })
    } catch (e) {
      console.error('Add liquidity error:', e)
      setError(e.message || 'Failed to add liquidity')
    }
    setLoading(false)
  }

  const handleRemoveLiquidity = async () => {
    if (!lpTokens) {
      setError('Please enter LP token amount')
      return
    }
    if (!walletAddress) {
      setError('Please connect or enter a wallet address first')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const base = import.meta.env.VITE_API_BASE || ''
      const response = await fetch(`${base}/api/liquidity/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: selectedPool.id,
          lpTokens: parseFloat(lpTokens),
          slippage,
          userAddress: walletAddress
        })
      })

      if (!response.ok) {
        const errResp = await response.json().catch(() => ({}))
        throw new Error(errResp.error || 'Failed to remove liquidity')
      }

      const payload = await response.json()
      setStatus(`Removed ${lpTokens} LP from ${selectedPool.name} · tx ${payload.txHash}`)
      setAmount0('')
      setAmount1('')
      setLpTokens('')
      setPosition({
        lpTokens: payload.remainingPosition || '0',
        shareOfPool: payload.shareOfPool || '0.00',
        estimatedValue: ((parseFloat(payload.remainingPosition || 0) || 0) * 0.6).toFixed(2)
      })
    } catch (e) {
      console.error('Remove liquidity error:', e)
      setError(e.message || 'Failed to remove liquidity')
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, background: 'linear-gradient(135deg, #34d399, #00ff88)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>💧 Liquidity Pools (KES)</h2>

      {/* Pool Selection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {dataLoading ? (
          <div style={{ padding: 24, textAlign: 'center', opacity: 0.7 }}>Loading pool data...</div>
        ) : pools.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', opacity: 0.7 }}>
            {error || 'No KES pools available'}
          </div>
        ) : (
          pools.map(pool => (
          <div 
            key={pool.id}
            onClick={() => setSelectedPool(pool)}
            style={{
              background: selectedPool && selectedPool.id === pool.id ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255,255,255,0.03)',
              border: `2px solid ${selectedPool && selectedPool.id === pool.id ? '#34d399' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 14,
              padding: 16,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              transform: selectedPool && selectedPool.id === pool.id ? 'scale(1.02)' : 'scale(1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{pool.name}</h3>
              <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#10b981', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>+{pool.apy}% APY</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginBottom: 12 }}>
              <div>
                <div style={{ opacity: 0.7, marginBottom: 4 }}>TVL</div>
                <div style={{ fontWeight: 600, color: '#34d399' }}>${(pool.tvl / 1000000).toFixed(1)}M</div>
              </div>
              <div>
                <div style={{ opacity: 0.7, marginBottom: 4 }}>Volume 24h</div>
                <div style={{ fontWeight: 600, color: '#3b82f6' }}>${(pool.volume24h / 1000000).toFixed(1)}M</div>
              </div>
            </div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              Reserve: {(pool.reserve0 / 1000000).toFixed(0)}M {pool.token0} / {(pool.reserve1 / 1000000).toFixed(0)}M {pool.token1}
            </div>
          </div>
        ))
        )}
      </div>

      {/* Wallet input and status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Wallet Address</label>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value.trim())}
              placeholder="mall1..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: 13
              }}
            />
            {balances.token0 && (
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Available MLCN: {balances.token0}</div>
            )}
          </div>
        </div>
        {position && (
          <div style={{ background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: 10, padding: 12, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ opacity: 0.75 }}>Your LP</span>
              <span style={{ fontWeight: 700, color: '#34d399' }}>{position.lpTokens}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ opacity: 0.75 }}>Pool Share</span>
              <span>{position.shareOfPool}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.75 }}>Est. Value</span>
              <span>~${position.estimatedValue}</span>
            </div>
          </div>
        )}
        {status && (
          <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#34d399', padding: 12, borderRadius: 10, fontSize: 13 }}>{status}</div>
        )}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: 12, borderRadius: 10, fontSize: 13 }}>{error}</div>
        )}
      </div>

      {/* Add/Remove Liquidity Form */}
      {selectedPool && (
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24 }}>
        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
          <button
            onClick={() => setActiveTab('add')}
            style={{
              background: activeTab === 'add' ? 'rgba(52, 211, 153, 0.2)' : 'transparent',
              color: activeTab === 'add' ? '#34d399' : '#888',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              transition: 'all 0.3s'
            }}
          >
            ➕ Add Liquidity
          </button>
          <button
            onClick={() => setActiveTab('remove')}
            style={{
              background: activeTab === 'remove' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              color: activeTab === 'remove' ? '#ef4444' : '#888',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              transition: 'all 0.3s'
            }}
          >
            ➖ Remove Liquidity
          </button>
        </div>

        {/* Pool Info */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 14, borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ opacity: 0.7 }}>Selected Pool</span>
            <span style={{ fontWeight: 600, color: '#34d399' }}>{selectedPool.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ opacity: 0.7 }}>Trading Fee</span>
            <span>{selectedPool.fee}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: 0.7 }}>Slippage Tolerance</span>
            <input
              type="number"
              value={slippage}
              onChange={(e) => setSlippage(Math.min(5, Math.max(0, parseFloat(e.target.value) || 0)))}
              style={{ width: 50, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12 }}
            />
            <span>%</span>
          </div>
        </div>

        {/* Add/Remove Form */}
        {activeTab === 'add' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>
                Amount of {selectedPool.token0}
              </label>
              <input
                type="number"
                value={amount0}
                onChange={(e) => setAmount0(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 14
                }}
              />
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                Available: {balances.token0 || '—'} {selectedPool.token0}
              </div>
            </div>

            <div style={{ textAlign: 'center', opacity: 0.5 }}>⬇️</div>

            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>
                Amount of {selectedPool.token1}
              </label>
              <input
                type="number"
                value={amount1}
                onChange={(e) => setAmount1(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 14
                }}
              />
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                Reserve guidance: {(selectedPool.reserve1 / 1_000_000).toFixed(0)}M {selectedPool.token1}
              </div>
            </div>

            {lpTokens && (
              <div style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: 8, padding: 12, fontSize: 13 }}>
                <div style={{ opacity: 0.8, marginBottom: 4 }}>You will receive</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399' }}>
                  {lpTokens} LP {selectedPool.name}
                </div>
              </div>
            )}

            <button
              onClick={handleAddLiquidity}
              disabled={!amount0 || !amount1 || loading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 8,
                border: 'none',
                background: (amount0 && amount1 && !loading) ? 'linear-gradient(135deg, #34d399, #10b981)' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: (amount0 && amount1 && !loading) ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s',
                opacity: (amount0 && amount1 && !loading) ? 1 : 0.5
              }}
            >
              {loading ? 'Processing...' : 'Add Liquidity'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>
                Amount of LP Tokens to Burn
              </label>
              <input
                type="number"
                value={lpTokens}
                onChange={(e) => setLpTokens(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 14
                }}
              />
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                Your LP Balance: {position ? position.lpTokens : '0'} LP {selectedPool.name}
              </div>
            </div>

            {lpTokens && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: 12, fontSize: 13 }}>
                <div style={{ opacity: 0.8, marginBottom: 8 }}>You will receive</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#ef4444', fontSize: 14 }}>
                      {(parseFloat(lpTokens) * 3).toFixed(2)} {selectedPool.token0}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>~${(parseFloat(lpTokens) * 3 * 0.6).toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#ef4444', fontSize: 14 }}>
                      {(parseFloat(lpTokens) * 1.8).toFixed(2)} {selectedPool.token1}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>~${(parseFloat(lpTokens) * 1.8 * 0.36).toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleRemoveLiquidity}
              disabled={!lpTokens || loading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 8,
                border: 'none',
                background: (lpTokens && !loading) ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: (lpTokens && !loading) ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s',
                opacity: (lpTokens && !loading) ? 1 : 0.5
              }}
            >
              {loading ? 'Processing...' : 'Remove Liquidity'}
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  )
}

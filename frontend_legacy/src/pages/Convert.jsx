import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function SwapMallAssets() {
  const [address, setAddress] = useState('')
  const [mpBalance, setMpBalance] = useState(0)
  const [mlcPrice, setMlcPrice] = useState(null)
  const [mpPrice, setMpPrice] = useState(null)
  const [fiatAmount, setFiatAmount] = useState('')
  const [mlcNeeded, setMlcNeeded] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('wallet')
    if (raw) {
      const w = JSON.parse(raw)
      const acct = w?.accounts?.[0]?.address || ''
      if (acct) setAddress(acct)
    } else {
      const a = localStorage.getItem('mall_address') || ''
      if (a) setAddress(a)
    }
  }, [])

  useEffect(() => {
    if (!address) return
    async function load() {
      try {
        setLoading(true)
          const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
          const [mpRes, priceRes] = await Promise.all([
            axios.get(`${base}/api/mallpoints/${address}`).catch(() => ({ data: { balance: 0 } })),
            axios.get(`${base}/api/market/price`).catch(() => ({ data: { market_price: { mid: 1 } } }))
          ])
        setMpBalance(Number(mpRes.data.balance || 0))
        setMpPrice(typeof mpRes.data.pointPrice !== 'undefined' ? Number(mpRes.data.pointPrice) : null)
        setMlcPrice(priceRes.data?.market_price?.mid || 1)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [address])

  useEffect(() => {
    const a = parseFloat(fiatAmount)
    const p = Number(mlcPrice)
    if (isNaN(a) || !p || p <= 0) { setMlcNeeded(''); return }
    if (a === 0) { setMlcNeeded('0'); return }
    const needed = a / p
    setMlcNeeded(Number.isFinite(needed) ? needed.toFixed(6) : '')
  }, [fiatAmount, mlcPrice])

  const doSwap = async () => {
    setStatus('Swapping...')
    try {
      const r = await axios.post('/api/mallpoints/convert', { address })
      if (r.data?.ok) {
        setStatus(`Swapped ${r.data.convertedPoints} MP → ${r.data.mallcoins} MLCNS`)
      } else {
        setStatus('Swap failed: ' + (r.data.error || JSON.stringify(r.data)))
      }
    } catch (e) {
      setStatus('Swap error: ' + (e.response?.data?.error || e.message))
    }
  }

  // Enhanced UI
  const isFiatValid = fiatAmount && !isNaN(Number(fiatAmount)) && Number(fiatAmount) > 0;
  const canSwap = isFiatValid && mlcNeeded && Number(mlcNeeded) > 0 && !loading;
  return (
    <div style={{ maxWidth: 440, margin: '48px auto', fontFamily: 'Inter, system-ui', padding: 28, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002' }}>
      <h2 style={{ marginBottom: 18, fontWeight: 700, fontSize: 26, color: '#a3e635', letterSpacing: -1 }}>Swap Tokens</h2>

      {/* You Pay */}
      <div style={{ background: '#181f29', padding: 18, borderRadius: 14, marginBottom: 14, boxShadow: '0 1px 6px #0001' }}>
        <div style={{ fontSize: 13, color: '#a3e635', fontWeight: 600 }}>You Pay</div>
        <input
          value={fiatAmount}
          onChange={e => setFiatAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          style={{ width: '100%', fontSize: 22, fontWeight: 700, marginTop: 8, border: 'none', background: 'transparent', color: '#fff', outline: 'none' }}
          inputMode="decimal"
        />
        <div style={{ fontSize: 14, color: '#a3e635', marginTop: 6 }}>{mpBalance} MP available</div>
      </div>

      {/* You Receive */}
      <div style={{ background: '#181f29', padding: 18, borderRadius: 14, marginBottom: 14, boxShadow: '0 1px 6px #0001' }}>
        <div style={{ fontSize: 13, color: '#a3e635', fontWeight: 600 }}>You Receive</div>
        <input
          readOnly
          value={mlcNeeded}
          placeholder="calculated"
          style={{ width: '100%', fontSize: 22, fontWeight: 700, marginTop: 8, border: 'none', background: 'transparent', color: '#fff', outline: 'none' }}
        />
        <div style={{ fontSize: 14, color: '#a3e635', marginTop: 6 }}>MLCNS</div>
      </div>

      {/* Details */}
      <div style={{ fontSize: 14, color: '#fff', marginBottom: 14, background: '#232b38', borderRadius: 10, padding: 12 }}>
        <div>Mallcoin price: <span style={{ color: '#a3e635' }}>{mlcPrice ? `KES ${mlcPrice.toFixed(2)}` : '—'}</span></div>
        <div>Mallpoint price: <span style={{ color: '#a3e635' }}>{mpPrice ? `KES ${mpPrice.toFixed(2)}` : '—'}</span></div>
        <div>Derived rate: <span style={{ color: '#a3e635' }}>{mpPrice && mlcPrice ? `1 MP ≈ ${(mpPrice / mlcPrice).toFixed(6)} MLCNS` : '—'}</span></div>
        <div style={{marginTop:6}}>Mallcoins needed (from fiat): <span style={{ color: '#a3e635' }}>{mlcNeeded || '—'}</span></div>
        <div>Mallpoints needed (from fiat): <span style={{ color: '#a3e635' }}>{mpPrice ? (fiatAmount ? (Number(fiatAmount) / mpPrice).toFixed(6) : '—') : '—'}</span></div>
        <div style={{marginTop:8}}>Fees: <span style={{ color: '#a3e635' }}>network fees may apply</span></div>
      </div>

      {/* Action */}
      <button
        onClick={doSwap}
        disabled={!canSwap}
        style={{
          width: '100%',
          padding: '16px 0',
          borderRadius: 14,
          border: 'none',
          background: canSwap ? 'linear-gradient(90deg,#a3e635,#65a30d)' : '#232b38',
          color: canSwap ? '#181f29' : '#888',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: 0.5,
          cursor: canSwap ? 'pointer' : 'not-allowed',
          boxShadow: canSwap ? '0 2px 8px #a3e63544' : 'none',
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        {loading ? 'Swapping…' : 'Swap Now'}
      </button>

      {/* Status */}
      <div style={{ marginTop: 14, fontSize: 14, color: status && status.toLowerCase().includes('fail') ? '#e53e3e' : '#a3e635', minHeight: 20 }}>{status}</div>
    </div>
  )
}

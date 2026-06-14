import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { loadWallet } from '../mallwallet'
import axios from 'axios'

export default function PayConfirm() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { to, amount, fiat, price } = state || {}
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  // Transaction state
  const [sender, setSender] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const gasFee = 0.0002
  const total = amount && !isNaN(Number(amount)) ? (Number(amount) + gasFee).toFixed(6) : ''

  // Load sender wallet on mount
  useEffect(() => {
    async function initWallet() {
      try {
        const w = await loadWallet()
        if (w && w.address) setSender(w.address)
      } catch (e) {
        console.error('Failed to load wallet:', e)
      }
    }
    initWallet()
  }, [])

  if (!to || !amount) {
    return (
      <div style={{ maxWidth: 440, margin: '48px auto', fontFamily: 'Inter, system-ui', padding: 28, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002', minHeight: 180 }}>
        <div style={{ color: '#e53e3e', fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Missing payment details.</div>
        <button onClick={()=>navigate(-1)} style={{ padding:'10px 18px', borderRadius:8, border:'none', background:'#232b38', color:'#fff', fontWeight:600, fontSize:16, cursor:'pointer' }}>Go Back</button>
      </div>
    )
  }

  async function handleConfirm() {
    if (!sender) {
      setError('Wallet not loaded')
      return
    }

    setPending(true)
    setError('')
    setConfirmed(false)
    setTxHash('')

    try {
      // Construct transaction
      const nonce = Math.floor(Date.now() / 1000)
      const tx = {
        from: sender,
        to: to,
        amount: parseFloat(amount),
        fee: gasFee,
        nonce,
        timestamp: Date.now()
      }

      // Sign transaction
      const w = await loadWallet()
      if (!w) throw new Error('Unable to load wallet for signing')

      const txHashRaw = JSON.stringify(tx)
      const signature = w.signMessage(txHashRaw)
      const signedTx = { tx, signature }

      // Broadcast transaction
      const res = await axios.post(`${base}/api/tx/relay`, signedTx)
      const chainResp = res.data && res.data.resp ? res.data.resp : res.data
      
      setTxHash(chainResp.txHash || chainResp.tx_hash || chainResp.txhash || 'payment-confirmed')
      setConfirmed(true)
      setPending(false)
    } catch (e) {
      setError('Payment failed: ' + (e.response?.data?.error || e.message))
      setPending(false)
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: '48px auto', fontFamily: 'Inter, system-ui', padding: 28, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002', minHeight: 320 }}>
      <h2 style={{ marginBottom: 10, fontWeight: 700, fontSize: 26, color: '#a3e635', letterSpacing: -1 }}>Confirm Payment</h2>
      
      <div style={{marginBottom:16, background:'#181f29', borderRadius:12, padding:14, color:'#fff', fontSize:15}}>
        <div>Sender: <span style={{ color: '#a3e635', fontWeight: 600 }}>{sender || '—'}</span></div>
        <div>Fee: <span style={{ color: '#a3e635', fontWeight: 600 }}>{gasFee}</span></div>
      </div>

      <div style={{margin:'22px 0', fontSize:17, color:'#fff', background:'#181f29', borderRadius:12, padding:18}}>
        <div style={{marginBottom:8}}><b>Recipient:</b> <span style={{fontFamily:'monospace', color:'#a3e635'}}>{to}</span></div>
        <div><b>Amount:</b> <span style={{color:'#a3e635'}}>{amount}</span> Mallcoin</div>
        <div><b>Fiat:</b> <span style={{color:'#a3e635'}}>{fiat || '—'}</span></div>
        <div><b>Price:</b> <span style={{color:'#a3e635'}}>{price ? `1 Mallcoin ≈ ${price}` : '—'}</span></div>
        <div><b>Gas Fee:</b> <span style={{color:'#a3e635'}}>{gasFee}</span> Mallcoin</div>
        <div style={{marginTop:10, fontWeight:600}}><b>Total:</b> <span style={{color:'#a3e635'}}>{total}</span> Mallcoin</div>
      </div>

      {error && <div style={{color:'#e53e3e', marginTop:8, fontSize:15, fontWeight:500, padding:10, background:'#1a0c0c', borderRadius:8}}>{error}</div>}
      {pending && <div style={{color:'#eab308', marginTop:8, fontSize:15, fontWeight:600, padding:10, background:'#1a1800', borderRadius:8}}>Processing payment…</div>}
      {confirmed && <div style={{color:'#a3e635', marginTop:8, fontSize:15, fontWeight:600, padding:10, background:'#0a1a0c', borderRadius:8}}>Payment confirmed!<br/>Tx: {txHash}</div>}

      <div style={{display:'flex', gap:16, marginTop:18}}>
        <button onClick={()=>navigate(-1)} disabled={pending} style={{ padding:'12px 0', flex:1, borderRadius:10, border:'none', background:pending?'#232b38':'#232b38', color:'#fff', fontWeight:700, fontSize:17, cursor:pending?'not-allowed':'pointer', opacity:pending?0.5:1 }}>Cancel</button>
        <button style={{ padding:'12px 0', flex:1, borderRadius:10, border:'none', background:pending?'#232b38':'linear-gradient(90deg,#a3e635,#65a30d)', color:pending?'#888':'#181f29', fontWeight:700, fontSize:17, cursor:pending?'not-allowed':'pointer', boxShadow:pending?'none':'0 2px 8px #a3e63544' }} onClick={handleConfirm} disabled={pending}>{pending ? 'Processing…' : 'Confirm & Pay'}</button>
      </div>
    </div>
  )
}

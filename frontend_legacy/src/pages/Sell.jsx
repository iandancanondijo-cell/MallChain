import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { sellMallcoinOnChain, getMarketPrice } from '../utils/onchain-transactions.js'

export default function Sell(){
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
  const navigate = useNavigate()

  // States
  const [amount, setAmount] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [walletBalance, setWalletBalance] = useState(0)
  const [currency, setCurrency] = useState('KES')
  const [sellPrice, setSellPrice] = useState(null)
  const [kesReceived, setKesReceived] = useState(0)
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [priceSource, setPriceSource] = useState('loading')

  // Load wallet address and balance
  useEffect(() => {
    async function initWallet() {
      try {
        const raw = sessionStorage.getItem('wallet')
        if (raw) {
          const w = JSON.parse(raw)
          const addr = (w.accounts && w.accounts[0] && w.accounts[0].address) || ''
          if (addr) {
            setWalletAddress(addr)

            // Fetch balance from blockchain
            try {
              const balRes = await axios.get(`${base}/api/onchain/wallet/${addr}/balance`)
              if (balRes.data.balance !== undefined) {
                setWalletBalance(Number(balRes.data.balance))
              }
            } catch (e) {
              console.warn('balance fetch error:', e)
            }
            return
          }
        }
      } catch (e) {
        console.error('session wallet read', e)
      }

      const addr = localStorage.getItem('mall_address') || localStorage.getItem('mall_cosmos_address') || ''
      if (addr) {
        setWalletAddress(addr)

        // Fetch balance
        try {
          const balRes = await axios.get(`${base}/api/onchain/wallet/${addr}/balance`)
          if (balRes.data.balance !== undefined) {
            setWalletBalance(Number(balRes.data.balance))
          }
        } catch (e) {
          console.warn('balance fetch error:', e)
        }
      }
    }

    initWallet()
  }, [])

  // Fetch market price
  useEffect(() => {
    let mounted = true
    const CHAIN_REST = import.meta.env.VITE_CHAIN_REST || 'http://localhost:1317'
    
    const load = async () => {
      try {
        // Try backend first
        const res = await axios.get(`${base}/api/market/price`)
        const j = res.data || {}
        const mp = j.market_price || {}
        const sPrice = Number(mp.sell_price || 0.38)
        if (!mounted) return
        setSellPrice(sPrice)
        setCurrency(j.currency || 'KES')
        setPriceSource(j.source || 'fallback')
        return
      } catch (e) {
        // Try on-chain directly
      }

      try {
        const url = `${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/market/price`
        const r2 = await axios.get(url, { timeout: 3000 })
        const data = r2.data || {}
        const mp2 = data.market_price || {}
        const sell = Number(mp2.sell_price || 0) / 100
        if (!mounted) return
        setSellPrice(sell)
        setCurrency(mp2.currency || 'KES')
        setPriceSource('blockchain')
      } catch (e) {
        if (!mounted) return
        setSellPrice(0.38)
        setCurrency('KES')
        setPriceSource('fallback')
      }
    }

    load()
    const iv = setInterval(load, 15000)
    return () => { mounted = false; clearInterval(iv) }
  }, [])

  // Calculate KES received
  useEffect(() => {
    const a = Number(amount) || 0
    if (sellPrice == null) {
      setKesReceived(0)
      return
    }
    const val = a * Number(sellPrice)
    setKesReceived(val)
  }, [amount, sellPrice])

  async function handleSell() {
    if (!walletAddress) return setStatus('❌ Please load a wallet')
    if (!amount || Number(amount) <= 0) return setStatus('❌ Please enter a valid amount')
    if (sellPrice == null) return setStatus('❌ Price not loaded. Try again.')
    if (Number(amount) > walletBalance) return setStatus(`❌ Insufficient balance. You have ${walletBalance} MLCNS`)

    setStatus('⏳ Signing transaction...')
    setPending(true)
    setSuccess(false)

    try {
      // Broadcast transaction on-chain
      const result = await sellMallcoinOnChain(walletAddress, Number(amount), {
        fee: { amount: [{ denom: 'umal', amount: '5000' }], gas: '300000' },
        memo: `Sell ${Number(amount).toFixed(2)} MLCNS`
      })

      if (!result.success) throw new Error(result.error || 'Transaction failed')

      setStatus(`✓ Transaction confirmed! Hash: ${result.txHash.substring(0, 16)}...`)
      setSuccess(true)
      setPending(false)
      setTimeout(() => navigate('/wallet'), 2500)
    } catch (e) {
      console.error('On-chain sell error:', e)
      setStatus('❌ ' + (e.message || 'Transaction failed'))
      setPending(false)
    }
  }

  const isAmountValid = amount && !isNaN(Number(amount)) && Number(amount) > 0 && Number(amount) <= walletBalance
  const canSell = walletAddress && isAmountValid && sellPrice != null && !pending

  return (
    <div style={{display:'flex', alignItems:'center', justifyContent:'center', minHeight:'80vh', padding:20}}>
      <div style={{padding:32, maxWidth:480, width:'100%', borderRadius:18, background:'#10151c', boxShadow:'0 2px 16px #0002'}}>
        <h2 style={{textAlign:'center', marginBottom:10, fontWeight:700, fontSize:26, color:'#a3e635', letterSpacing:-1}}>Sell Mallcoins</h2>
        <p style={{textAlign:'center', fontSize:15, color:'#fff', opacity:0.8, marginBottom:22}}>Sell your Mallcoins directly on the blockchain and receive KES to your wallet.</p>

        <div style={{display:'flex', flexDirection:'column', gap:18}}>
          {/* Wallet Address */}
          <div>
            <label style={{fontSize:13, fontWeight:600, color:'#a3e635'}}>Wallet Address</label>
            <input 
              aria-label="wallet-address" 
              value={walletAddress} 
              placeholder="Your wallet (auto-filled)" 
              style={{width:'100%', padding:'12px 14px', marginTop:6, borderRadius:10, border:'1px solid #232b38', background:'#181f29', color:'#fff', fontSize:15, outline:'none'}} 
              readOnly
            />
          </div>

          {/* Wallet Balance */}
          <div>
            <label style={{fontSize:13, fontWeight:600, color:'#a3e635'}}>Available Balance</label>
            <div style={{padding:'12px 14px', marginTop:6, borderRadius:10, border:'1px solid #232b38', background:'#232b38', color:'#a3e635', fontSize:15, fontWeight:600}}>
              {walletBalance.toLocaleString()} MLCNS
            </div>
          </div>

          {/* Amount */}
          <div>
            <label style={{fontSize:13, fontWeight:600, color:'#a3e635'}}>Amount to Sell (MLCNS)</label>
            <div style={{display:'flex', gap:8, marginTop:6}}>
              <input 
                aria-label="mallcoin-amount"
                value={amount} 
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} 
                placeholder="e.g. 10" 
                style={{flex:1, padding:'12px 14px', borderRadius:10, border:'1px solid #232b38', background:'#181f29', color:'#fff', fontSize:15, outline:'none'}}
              />
              {walletBalance > 0 && (
                <button 
                  onClick={() => setAmount(String(walletBalance))}
                  style={{
                    padding:'12px 16px',
                    borderRadius:10,
                    border:'1px solid #a3e635',
                    background:'transparent',
                    color:'#a3e635',
                    fontWeight:600,
                    fontSize:13,
                    cursor:'pointer',
                    transition:'all 0.2s'
                  }}
                  onMouseOver={e => {
                    e.target.style.background = '#a3e635'
                    e.target.style.color = '#181f29'
                  }}
                  onMouseOut={e => {
                    e.target.style.background = 'transparent'
                    e.target.style.color = '#a3e635'
                  }}
                >
                  Max
                </button>
              )}
            </div>
          </div>

          {/* KES Received */}
          <div>
            <label style={{fontSize:13, fontWeight:600, color:'#a3e635'}}>KES Received</label>
            <div style={{padding:'12px 14px', marginTop:6, borderRadius:10, border:'1px solid #232b38', background:'#232b38', color:'#fff', fontSize:15}}>
              {kesReceived.toFixed(2)} {currency}
            </div>
          </div>

          {/* Price Info */}
          <div style={{fontSize:12, color:'#fff', padding:10, borderRadius:10, background:'#232b38'}}>
            <strong style={{color:'#a3e635'}}>Current sell price:</strong> {sellPrice != null ? sellPrice.toFixed(4) : 'loading...'} {currency} per MLCNS
            <div style={{fontSize:11, marginTop:4, color: priceSource === 'blockchain' ? '#65a30d' : '#c084fc'}}>
              {priceSource === 'blockchain' ? '⛓️ Live Blockchain Price' : (priceSource === 'fallback' || priceSource === 'fallback_error' || priceSource === 'error') ? '📊 Market Price (Cached)' : '⏳ Loading...'}
            </div>
          </div>

          {/* Status/Error Message */}
          {status && (
            <div style={{
              padding:14,
              borderRadius:10,
              fontSize:14,
              background: status.includes('❌') ? 'rgba(239,68,68,0.12)' : status.includes('✓') ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)',
              color: status.includes('❌') ? '#ef4444' : status.includes('✓') ? '#a3e635' : '#3b82f6',
              borderLeft: '3px solid ' + (status.includes('❌') ? '#ef4444' : status.includes('✓') ? '#a3e635' : '#3b82f6'),
              marginBottom: 4
            }}>
              {status}
            </div>
          )}

          {/* Sell Button */}
          <button 
            onClick={handleSell} 
            disabled={!canSell}
            style={{
              padding:'16px 0',
              borderRadius:12,
              border:'none',
              background: canSell ? 'linear-gradient(90deg,#a3e635,#65a30d)' : '#232b38',
              color: canSell ? '#181f29' : '#888',
              fontWeight:700,
              fontSize:18,
              letterSpacing:0.5,
              cursor: canSell ? 'pointer' : 'not-allowed',
              boxShadow: canSell ? '0 2px 8px #a3e63544' : 'none',
              transition: 'background 0.2s, color 0.2s',
              marginTop: 2
            }}
          >
            {pending ? '⏳ Processing...' : `Sell Mallcoins (Get ${kesReceived.toFixed(2)} KES)`}
          </button>

          {/* Info Text */}
          <div style={{fontSize:12, color:'#fff', opacity:0.7, textAlign:'center', marginTop:2}}>
            ⛓️ Your transaction will be signed and broadcast to the blockchain.
          </div>
        </div>
      </div>
    </div>
  )
}

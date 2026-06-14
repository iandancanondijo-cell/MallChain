import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { buyMallcoinOnChain, getMarketPrice } from '../utils/onchain-transactions.js'

export default function Buy(){
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
  const navigate = useNavigate()

  // Purchase method toggle: 'mpesa' or 'onchain'
  const [method, setMethod] = useState('onchain')

  // Common states
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState(null)
  const [currency, setCurrency] = useState('')
  const [currencyLocale, setCurrencyLocale] = useState(undefined)
  const [fiat, setFiat] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [tick, setTick] = useState(0)

  // M-Pesa specific states
  const [phone, setPhone] = useState('')
  const [prefix, setPrefix] = useState('+254')
  const [mpesaRef, setMpesaRef] = useState('')
  const [quoteReserved, setQuoteReserved] = useState(false)
  const [quoteId, setQuoteId] = useState(null)
  const [quoteExpiry, setQuoteExpiry] = useState(null)

  // On-chain specific states
  const [buyPrice, setBuyPrice] = useState(null)
  const [kesRequired, setKesRequired] = useState(0)

  // Load wallet address from sessionStorage or localStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('wallet')
      if (raw) {
        const w = JSON.parse(raw)
        const addr = (w.accounts && w.accounts[0] && w.accounts[0].address) || ''
        if (addr) {
          setWalletAddress(addr)
          return
        }
      }
    } catch (e) {
      console.error('session wallet read', e)
    }
    const addr = localStorage.getItem('mall_address') || ''
    if (addr) setWalletAddress(addr)
    
    // Also check for Cosmos address
    if (!walletAddress) {
      const cosmosAddr = localStorage.getItem('mall_cosmos_address') || ''
      if (cosmosAddr) setWalletAddress(cosmosAddr)
    }
  }, [])

  useEffect(() => {
    if (!quoteReserved) return
    const iv = setInterval(() => {
      setTick(t => t + 1)
      if (quoteExpiry && Date.now() > quoteExpiry) {
        setQuoteReserved(false)
        setQuoteId(null)
        setQuoteExpiry(null)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [quoteReserved, quoteExpiry])

  useEffect(() => {
    let mounted = true
    const CHAIN_REST = import.meta.env.VITE_CHAIN_REST || 'http://localhost:1317'
    const load = async () => {
      try {
        // primary: backend market API
        const res = await axios.get(`${base}/api/market/price`)
        const j = res.data || {}
        const mp = j.market_price || {}
        const mid = Number(mp.mid || ((Number(mp.buy_price || 0) + Number(mp.sell_price || 0)) / 2) || 0)
        const bPrice = Number(mp.buy_price || 0.40)
        if (!mounted) return
        setPrice(mid)
        setBuyPrice(bPrice)
        setCurrency(j.currency || (mp.currency || 'Ksh'))
        return
      } catch (e) {
        // fallback: try on-chain directly
      }

      try {
        const url = `${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/market/price`
        const r2 = await axios.get(url, { timeout: 3000 })
        const data = r2.data || {}
        const mp2 = data.market_price || data.marketPrice || null
        if (!mp2) return
        // on-chain buy/sell are scaled by 100 in chain proto; convert to decimal
        const buy = Number(mp2.buy_price) / 100
        const sell = Number(mp2.sell_price) / 100
        const mid2 = ((buy || 0) + (sell || 0)) / 2
        if (!mounted) return
        setPrice(mid2)
        setBuyPrice(buy)
        setCurrency(mp2.currency || 'Ksh')
      } catch (e) {
        // Use fallback
        if (!mounted) return
        setPrice(0.40)
        setBuyPrice(0.40)
        setCurrency('Ksh')
      }
    }

    load()
    const iv = setInterval(load, 15000)
    return () => { mounted = false; clearInterval(iv) }
  }, [])

  // detect user region and the currency in that region
  useEffect(() => {
    try {
      const detected = (() => {
        // prefer timeZone if available
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
        const lang = (navigator && (navigator.language || navigator.languages && navigator.languages[0])) || ''
        const tzLower = String(tz).toLowerCase()
        const langLower = String(lang).toLowerCase()

        // mapping heuristics
        if (tzLower.includes('shanghai') || tzLower.includes('beijing') || langLower.includes('zh')) return { code: 'CNY', locale: 'zh-CN' }
        if (tzLower.includes('nairobi') || langLower.includes('sw') || langLower.includes('ke')) return { code: 'KES', locale: 'en-KE' }
        if (tzLower.includes('moscow') || langLower.includes('ru')) return { code: 'RUB', locale: 'ru-RU' }
        if (tzLower.includes('kampala') || langLower.includes('en')) return{ code: 'UGX', locale: 'en-UG'}
        if (tzLower.includes('dodoma')  || langLower.includes('sw')) return{ code: 'TZS', locale: 'sw-TZ'}
        if (tzLower.includes('kigali') || langLower.includes('rw')) return { code: 'RWF', locale: 'rw-RW'}
        if (tzLower.includes('gitega') || langLower.includes('rn')) return { code: 'BIF', locale: 'rn-BI'}
        if (tzLower.includes('juba')  || langLower.includes('en')) return { code: 'SSP', locale: 'en-SS'}
        if (tzLower.includes('mogadishu')  || langLower.includes('SO')) return { code: 'SOS', locale: 'so-SO'}
        if (tzLower.includes('addis ababa')  || langLower.includes('am')) return { code: 'ETB', locale: 'am-ET'}
        if (tzLower.includes('djibouti')  || langLower.includes('ar')) return { code: 'DJF', locale: 'ar-DJ'}
        if (tzLower.includes('asmara')  || langLower.includes('ti')) return { code: 'ERN', locale: 'ti-ER'}

        // fallback: check country subtags in language (en-KE, zh-CN, ru-RU)
        const regionMatch = langLower.match(/[-_]([a-z]{2})$/)
        if (regionMatch) {
          const region = regionMatch[1].toUpperCase()
          if (region === 'CN') return { code: 'CNY', locale: 'zh-CN' }
          if (region === 'KE') return { code: 'KES', locale: 'en-KE' }
          if (region === 'RU') return { code: 'RUB', locale: 'ru-RU' }
          if (region === 'UG') return { code: 'UGX', locale: 'en-UG'}
          if (region === 'TZ') return { code: 'TZS', locale: 'sw-TZ'}
          if (region === 'RW') return { code: 'RWF', locale: 'rw-RW'}
          if (region === 'BI') return { code: 'BIF', locale: 'rn-BI'}
          if (region === 'SS') return { code: 'SSP', locale: 'en-SS'}
          if (region === 'SO') return { code: 'SOS', locale: 'so-SO'}
          if (region === 'ET') return { code: 'ETB', locale: 'am-ET'}
          if (region === 'DJ') return { code: 'DJF', locale: 'ar-DJ'}
          if (region === 'ER') return { code: 'ERN', locale: 'ti-ER'}
         


          
        }
        // default to USD
        return { code: 'USD', locale: undefined }
      })()

      setCurrency(detected.code)
      setCurrencyLocale(detected.locale)
      // set phone prefix based on detected locale/currency
      try {
        if (detected && detected.code === 'KES') setPrefix('+254')
        else if (detected && detected.code === 'CNY') setPrefix('+86')
        else if (detected && detected.code === 'RUB') setPrefix('+7')
        else setPrefix('+254')
      } catch (e) { setPrefix('+254') }
    } catch (e) {
      setCurrency('USD')
      setCurrencyLocale(undefined)
    }
  }, [])

  useEffect(() => {
    const a = Number(amount) || 0
    if (method === 'onchain') {
      // For on-chain: calculate KES required at buy price
      if (buyPrice == null) { setFiat('—'); setKesRequired(0); return }
      const val = a * Number(buyPrice)
      if (isNaN(val)) { setFiat('—'); setKesRequired(val); return }
      setKesRequired(val)
      try {
        const formatted = val.toLocaleString(currencyLocale || undefined, { style: 'currency', currency: currency || 'KES', minimumFractionDigits: 2, maximumFractionDigits: 2 })
        setFiat(formatted)
      } catch (e) {
        setFiat((currency || 'KES') + ' ' + val.toFixed(2))
      }
    } else {
      // For M-Pesa: use mid price
      if (price == null) { setFiat('—'); return }
      const val = a * Number(price)
      if (isNaN(val)) { setFiat('—'); return }
      try {
        const formatted = val.toLocaleString(currencyLocale || undefined, { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
        setFiat(formatted)
      } catch (e) {
        setFiat((currency || 'USD') + ' ' + val.toFixed(2))
      }
    }
  }, [amount, price, buyPrice, method])

  

  async function handleOnChainBuy() {
    if (!walletAddress) return setStatus('❌ Please load a wallet')
    if (!amount || Number(amount) <= 0) return setStatus('❌ Please enter a valid amount')
    if (buyPrice == null) return setStatus('❌ Price not loaded. Try again.')

    setStatus('⏳ Signing transaction...')
    setPending(true)
    setSuccess(false)

    try {
      // Broadcast transaction on-chain
      const result = await buyMallcoinOnChain(walletAddress, Number(amount), {
        fee: { amount: [{ denom: 'umal', amount: '5000' }], gas: '300000' },
        memo: `Buy ${Number(amount).toFixed(2)} MLCNS`
      })

      if (!result.success) throw new Error(result.error || 'Transaction failed')

      setStatus(`✓ Transaction confirmed! Hash: ${result.txHash.substring(0, 16)}...`)
      setSuccess(true)
      setPending(false)
      setTimeout(() => navigate('/wallet'), 2500)
    } catch (e) {
      console.error('On-chain buy error:', e)
      setStatus('❌ ' + (e.message || 'Transaction failed'))
      setPending(false)
    }
  }

  async function handleBuy() {
    if (method === 'onchain') {
      return handleOnChainBuy()
    }
    // M-Pesa flow (existing code)
    if (!walletAddress) return setStatus('Please enter a wallet address')
    if (!phone) return setStatus('Please enter a phone number')
    if (!amount || Number(amount) <= 0) return setStatus('Please enter a valid amount')
    if (price == null) return setStatus('Price not loaded. Try again.')

    setStatus('Reserving quote...')
    setPending(true)
    setSuccess(false)
    try {
      // 1. Reserve quote and create pending purchase
      const res = await axios.post(`${base}/api/buy/reserve`, {
        amount: Number(amount),
        fiat,
        currency: currency || 'KES',
        walletAddress,
        phone: prefix + phone.replace(/^0+|\D/g, '')
      })
      if (!res.data || !res.data.quoteId) throw new Error('Failed to reserve quote')
      setQuoteId(res.data.quoteId)
      setQuoteReserved(true)
      setQuoteExpiry(Date.now() + 600000) // 10 min expiry
      setMpesaRef(res.data.mpesaRef || '')
      
      setStatus('Initiating M-Pesa payment...')
      // 2. Initiate M-Pesa payment (STK push via Safaricom API)
      const payRes = await axios.post(`${base}/api/buy/mpesa`, {
        quoteId: res.data.quoteId,
        phone: prefix + phone.replace(/^0+|\D/g, ''),
        amount: res.data.fiatAmount,
        description: `Buy ${Number(amount).toFixed(2)} MLCNS`
      })
      if (!payRes.data || !payRes.data.paymentId) throw new Error('Failed to initiate M-Pesa payment')
      
      setStatus('Check your phone for M-Pesa prompt. Waiting for confirmation...')
      // 3. Poll for payment confirmation (up to 2 min)
      let confirmed = false
      for (let i = 0; i < 40; ++i) {
        await new Promise(r => setTimeout(r, 3000))
        const poll = await axios.get(`${base}/api/buy/status/${payRes.data.paymentId}`)
        if (poll.data && poll.data.status === 'confirmed') {
          confirmed = true
          break
        }
        if (poll.data && poll.data.status === 'failed') {
          throw new Error('M-Pesa payment failed: ' + (poll.data.reason || 'Unknown error'))
        }
      }
      if (!confirmed) throw new Error('Payment timeout. Please check your M-Pesa and try again.')
      
      setStatus('Crediting Mallcoins to your wallet...')
      // 4. Credit Mallcoins on-chain
      const creditRes = await axios.post(`${base}/api/buy/credit`, {
        quoteId: res.data.quoteId,
        walletAddress
      })
      if (!creditRes.data || !creditRes.data.success) throw new Error('Failed to credit Mallcoins. Support has been notified.')
      
      setStatus('✓ Mallcoins credited to your wallet!')
      setSuccess(true)
      setQuoteReserved(false)
      setPending(false)
      setTimeout(() => navigate('/wallet'), 3000)
    } catch (e) {
      console.error('Buy error:', e)
      setStatus('❌ ' + (e.message || 'An error occurred'))
      setPending(false)
    }
  }

  // Enhanced UI
  const isAmountValid = amount && !isNaN(Number(amount)) && Number(amount) > 0;
  
  // On-chain buy validation
  const canBuyOnChain = walletAddress && isAmountValid && buyPrice != null && !pending;
  
  // M-Pesa buy validation
  const canBuyMpesa = walletAddress && phone && isAmountValid && price != null && !pending;
  
  const canBuy = method === 'onchain' ? canBuyOnChain : canBuyMpesa;

  return (
    <div style={{display:'flex', alignItems:'center', justifyContent:'center', minHeight:'80vh', padding:20}}>
      <div style={{padding:32, maxWidth:480, width:'100%', borderRadius:18, background:'#10151c', boxShadow:'0 2px 16px #0002'}}>
        <h2 style={{textAlign:'center', marginBottom:10, fontWeight:700, fontSize:26, color:'#a3e635', letterSpacing:-1}}>Buy Mallcoins</h2>
        
        {/* Method Toggle */}
        <div style={{display:'flex', gap:10, marginBottom:22, background:'#232b38', borderRadius:12, padding:4}}>
          <button 
            onClick={() => { setMethod('onchain'); setStatus(''); setSuccess(false) }}
            style={{
              flex:1,
              padding:'10px 16px',
              borderRadius:10,
              border:'none',
              background: method === 'onchain' ? '#a3e635' : 'transparent',
              color: method === 'onchain' ? '#181f29' : '#a3e635',
              fontWeight:600,
              fontSize:14,
              cursor:'pointer',
              transition:'all 0.2s'
            }}
          >
            ⛓️ On-Chain
          </button>
          <button 
            onClick={() => { setMethod('mpesa'); setStatus(''); setSuccess(false) }}
            style={{
              flex:1,
              padding:'10px 16px',
              borderRadius:10,
              border:'none',
              background: method === 'mpesa' ? '#a3e635' : 'transparent',
              color: method === 'mpesa' ? '#181f29' : '#a3e635',
              fontWeight:600,
              fontSize:14,
              cursor:'pointer',
              transition:'all 0.2s'
            }}
          >
            📱 M-Pesa
          </button>
        </div>

        <p style={{textAlign:'center', fontSize:15, color:'#fff', opacity:0.8, marginBottom:22}}>
          {method === 'onchain' ? 'Buy Mallcoins directly on the blockchain using your wallet.' : 'Purchase Mallcoins using M-Pesa. They will be credited to your wallet.'}
        </p>

        <div style={{display:'flex', flexDirection:'column', gap:18}}>
          {/* Wallet Address */}
          <div>
            <label style={{fontSize:13, fontWeight:600, color:'#a3e635'}}>Wallet Address</label>
            <input 
              aria-label="wallet-address" 
              value={walletAddress} 
              onChange={e => setWalletAddress(e.target.value)} 
              placeholder="Your wallet address (auto-filled if available)" 
              style={{width:'100%', padding:'12px 14px', marginTop:6, borderRadius:10, border:'1px solid #232b38', background:'#181f29', color:'#fff', fontSize:15, outline:'none'}} 
              readOnly={!!walletAddress}
            />
            {walletAddress && <div style={{fontSize:12, marginTop:4, color:'#a3e635'}}>✓ Address loaded from wallet</div>}
          </div>

          {/* Phone (M-Pesa only) */}
          {method === 'mpesa' && (
            <div>
              <label style={{fontSize:13, fontWeight:600, color:'#a3e635'}}>Phone Number (M-Pesa)</label>
              <div style={{display:'flex', gap:8, marginTop:6}}>
                <input 
                  aria-label="phone-prefix"
                  value={prefix} 
                  onChange={e => setPrefix(e.target.value)} 
                  style={{width:'70px', padding:'12px 10px', borderRadius:10, border:'1px solid #232b38', background:'#181f29', color:'#fff', fontSize:15, outline:'none'}}
                />
                <input 
                  aria-label="phone-number"
                  value={phone} 
                  onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} 
                  placeholder="7XXXXXXXX" 
                  style={{flex:1, padding:'12px 14px', borderRadius:10, border:'1px solid #232b38', background:'#181f29', color:'#fff', fontSize:15, outline:'none'}}
                />
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label style={{fontSize:13, fontWeight:600, color:'#a3e635'}}>Amount (MLCNS)</label>
            <input 
              aria-label="mallcoin-amount"
              value={amount} 
              onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} 
              placeholder="e.g. 10" 
              style={{width:'100%', padding:'12px 14px', marginTop:6, borderRadius:10, border:'1px solid #232b38', background:'#181f29', color:'#fff', fontSize:15, outline:'none'}}
            />
          </div>

          {/* Fiat Value */}
          <div>
            <label style={{fontSize:13, fontWeight:600, color:'#a3e635'}}>Estimated Cost</label>
            <div style={{padding:'12px 14px', marginTop:6, borderRadius:10, border:'1px solid #232b38', background:'#232b38', color:'#fff', fontSize:15}}>
              {fiat || '—'}
            </div>
          </div>

          {/* Price Info */}
          <div style={{fontSize:12, color:'#a3e635', padding:10, borderRadius:10, background:'#232b38'}}>
            <strong>Current price:</strong> {method === 'onchain' && buyPrice != null ? (buyPrice).toFixed(4) : price != null ? price.toFixed(4) : 'loading...'} {currency || 'KES'} per MLCNS
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

          {/* Buy Button */}
          <button 
            onClick={handleBuy} 
            disabled={!canBuy}
            style={{
              padding:'16px 0',
              borderRadius:12,
              border:'none',
              background: canBuy ? 'linear-gradient(90deg,#a3e635,#65a30d)' : '#232b38',
              color: canBuy ? '#181f29' : '#888',
              fontWeight:700,
              fontSize:18,
              letterSpacing:0.5,
              cursor: canBuy ? 'pointer' : 'not-allowed',
              boxShadow: canBuy ? '0 2px 8px #a3e63544' : 'none',
              transition: 'background 0.2s, color 0.2s',
              marginTop: 2
            }}
          >
            {pending ? '⏳ Processing...' : `Buy Mallcoins (${method === 'onchain' ? 'On-Chain' : 'M-Pesa'})`}
          </button>

          {/* Info Text */}
          <div style={{fontSize:12, color:'#fff', opacity:0.7, textAlign:'center', marginTop:2}}>
            {method === 'onchain' 
              ? '⛓️ Transaction will be signed and broadcast to the blockchain.' 
              : '📱 You will receive an M-Pesa prompt. Enter your PIN to confirm.'}
          </div>
        </div>
      </div>
    </div>
  )
}

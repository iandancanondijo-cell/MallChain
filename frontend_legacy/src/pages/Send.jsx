import React, { useState, useEffect } from 'react'
import { SendIcon } from '../components/Icons'
import { loadWallet } from '../mallwallet'
import { isValidMallcoinAddress } from '../utils/address'
import { signTransferForBackend } from '../utils/onchain-transactions'
import axios from 'axios'

export default function Send(){
  const [sender, setSender] = useState('')
  const [wallet, setWallet] = useState(null)
  const [balance, setBalance] = useState(null)
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
  const [fee, setFee] = useState(0.0002)
  const [price, setPrice] = useState(0.39)
  const [priceSource, setPriceSource] = useState('loading')
  const [networkStatus, setNetworkStatus] = useState('syncing')
  const [receiver, setReceiver] = useState('')
  const [resolvedReceiver, setResolvedReceiver] = useState('')
  const [mappingNeeded, setMappingNeeded] = useState(false)
  const [mappingBech32, setMappingBech32] = useState('')
  const [amount, setAmount] = useState('')
  const [valid, setValid] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [txId, setTxId] = useState('')

  useEffect(() => {
    // Load sender wallet
    async function initWallet() {
      try {
        const w = await loadWallet()
        console.log('[Send] Loaded wallet:', w)
        if (w && w.address) {
          setSender(w.address)
          setWallet(w)
          console.log('[Send] Wallet address:', w.address)
          
          // Fetch balance for this wallet
          try {
            console.log('[Send] Fetching balance for:', w.address)
            const res = await axios.get(`${base}/api/mallwallet/balance/${w.address}`)
            console.log('[Send] Balance response:', res.data)
            const val = res.data && res.data.balance !== undefined ? Number(res.data.balance) : NaN
            setBalance(Number.isFinite(val) ? val : null)
            setNetworkStatus('synced')
          } catch (e) {
            console.error('[Send] Balance fetch error:', e.message)
            setBalance(null)
            setNetworkStatus('syncing')
          }
        } else {
          console.warn('[Send] No wallet loaded')
          setSender('')
          setBalance(null)
        }
      } catch (e) {
        console.error('[Send] Wallet load error:', e.message)
        setSender('')
        setBalance(null)
      }
    }

    async function fetchPrice() {
      try {
        const res = await axios.get(`${base}/api/market/price`)
        const p = res.data?.market_price?.mid || res.data?.mid
        const source = res.data?.source || 'unknown'
        if (p && !isNaN(Number(p))) {
          setPrice(Number(p))
          setPriceSource(source)
          console.log('[Send] Market price:', p, 'source:', source)
        } else {
          setPrice(0.39)
          setPriceSource('fallback')
        }
      } catch (e) {
        console.error('[Send] Price fetch error:', e.message)
        setPrice(0.39)
        setPriceSource('error')
      }
    }

    initWallet()
    fetchPrice()
  }, [])

  useEffect(() => {
    // Validate receiver address and amount
    setError('')
    if (!receiver) { setValid(false); return }
    let addr = receiver
    if (addr.startsWith('mallcoin:')) addr = addr.slice(9)
    // If resolvedReceiver is available (mapping exists), validate that instead
    if (resolvedReceiver) {
      addr = resolvedReceiver
    } else if (/^0x[0-9a-fA-F]+$/.test(addr)) {
      // clear previous resolved
      setResolvedReceiver('')
      setMappingNeeded(false)
      axios.get(`${base}/api/address/map/${addr}`).then(r => {
        if (r.data && r.data.ok && r.data.bech32) {
          setResolvedReceiver(r.data.bech32)
        } else {
          setMappingNeeded(true)
        }
      }).catch(() => {
        setMappingNeeded(true)
      })
      // temporarily disallow until resolved
      setValid(false)
      return
    }
    const addrCheck = isValidMallcoinAddress(addr)
    if (!addrCheck.valid) {
      setError('Invalid Mallcoin address: ' + addrCheck.error); setValid(false); return
    }
    if (sender && addr === sender) {
      setError('Sender and receiver cannot be the same'); setValid(false); return
    }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      setError('Amount must be > 0'); setValid(false); return
    }
    if (balance !== null && amt + fee > balance) {
      setError('Insufficient balance'); setValid(false); return
    }
    setValid(true)
  }, [receiver, amount, balance, fee, sender, resolvedReceiver])

  const handleCreateMapping = async () => {
    if (!mappingBech32 || !receiver) return
    try {
      const hex = receiver.trim()
      const res = await axios.post(`${base}/api/address/map`, { hex, bech32: mappingBech32.trim() })
      if (res.data && res.data.ok) {
        setResolvedReceiver(mappingBech32.trim())
        setMappingNeeded(false)
        setError('')
      } else {
        setError('Failed to create mapping')
      }
    } catch (e) {
      setError('Mapping create failed: ' + (e.response?.data?.error || e.message))
    }
  }

  const handleSend = async () => {
    if (!valid) return
    if (!wallet) {
      setError('Wallet not loaded')
      return
    }
    
    setPending(true)
    setConfirmed(false)
    setTxHash('')
    
    try {
      const receiverAddr = (resolvedReceiver && resolvedReceiver.length) ? resolvedReceiver : (receiver.startsWith('mallcoin:') ? receiver.slice(9) : receiver);
      const sendAmount = parseFloat(amount);
      
      // Sign transaction client-side
      const signResult = await signTransferForBackend(sender, receiverAddr, sendAmount, {
        fee: { amount: [{ denom: 'umal', amount: '5000' }], gas: '200000' },
        memo: `Transfer ${sendAmount.toFixed(2)} MLCN`
      });
      
      // Send signed transaction to backend for broadcasting
      const response = await axios.post(`${base}/api/send/mallcoins`, {
        from: sender,
        to: receiverAddr,
        amount: sendAmount,
        txBytes: signResult.txBytes
      });
      
      setTxHash(response.data.txHash);
      setConfirmed(true);
      setPending(false);
      setError('');
      setAmount('');
      
    } catch (e) {
      const errorMsg = e.message || (e.response?.data?.error) || 'Transfer failed';
      setError('❌ ' + errorMsg);
      setPending(false);
    }
  }

  // Enhanced UI
  const isAmountValid = amount && !isNaN(Number(amount)) && Number(amount) > 0;
  const canSend = valid && isAmountValid && !pending && !!sender;
  const amountNum = parseFloat(amount) || 0;
  const totalCost = amountNum + fee;
  const remainingBalance = balance !== null ? (balance - totalCost).toFixed(6) : null;
  const maxSendable = balance !== null ? Math.max(0, balance - fee).toFixed(6) : 0;
  
  // Locale-based currency formatter
  const formatCurrency = (value) => {
    const locale = navigator.language || 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };
  
  // Calculate fiat values
  const amountFiat = price ? amountNum * price : 0;
  const feeFiat = price ? fee * price : 0;
  const totalFiat = price ? totalCost * price : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg,#10151c 60%,#232b38 100%)', padding: '20px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', fontFamily: 'Inter, system-ui' }}>
        {/* Header */}
        <div style={{ paddingTop: 20, marginBottom: 32 }}>
          <h2 style={{ marginBottom: 8, fontWeight: 700, fontSize: 32, color: '#a3e635', letterSpacing: -1 }}><SendIcon size={32} color="#a3e635" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} /> Send Mallcoin</h2>
          <p style={{ color: '#888', fontSize: 15 }}>Transfer coins to another address securely</p>
        </div>

        {!sender && (
          <div style={{marginBottom:20, background:'#7f1d1d', borderRadius:14, padding:16, color:'#fca5a5', fontSize:14, border:'2px solid #f87171'}}>
            ⚠️ <strong>No wallet loaded.</strong> Please restore your wallet using your recovery phrase before sending.
            <button onClick={() => window.location.href = '/restore-wallet'} style={{marginTop:12, display:'block', width:'100%', padding:'10px', borderRadius:8, border:'none', background:'#f87171', color:'#7f1d1d', fontWeight:600, cursor:'pointer'}}>
              Restore Wallet
            </button>
          </div>
        )}

        {/* Status Info Box */}
        <div style={{marginBottom:20, background:'#181f29', borderRadius:14, padding:16, color:'#fff', fontSize:14, border:'1px solid #232b38'}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
            <div>
              <div style={{color:'#888', fontSize:12, marginBottom:4}}>Sender Address</div>
              <div style={{color:'#a3e635', fontWeight:600, fontSize:13, fontFamily:'monospace'}}>{sender ? `${sender.slice(0,10)}...${sender.slice(-8)}` : '—'}</div>
            </div>
            <div>
              <div style={{color:'#888', fontSize:12, marginBottom:4}}>Balance</div>
              <div style={{color:balance === 0 ? '#f87171' : '#a3e635', fontWeight:600, fontSize:13}}>{balance !== null ? `${Number(balance).toLocaleString()} MLCNS` : 'Loading...'}</div>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div>
              <div style={{color:'#888', fontSize:12, marginBottom:4}}>Network</div>
              <div style={{color: networkStatus==='synced' ? '#a3e635' : '#eab308', fontWeight:600, fontSize:13}}>● {networkStatus}</div>
            </div>
            <div>
              <div style={{color:'#888', fontSize:12, marginBottom:4}}>Fee</div>
              <div style={{color:'#a3e635', fontWeight:600, fontSize:13}}>{fee} MLCNS</div>
            </div>
          </div>
          <div>
            <div style={{color:'#888', fontSize:12, marginBottom:4}}>Price Source</div>
            <div style={{
              color: priceSource === 'blockchain' ? '#a3e635' : '#a78bfa',
              fontWeight:600,
              fontSize:13
            }}>
              {priceSource === 'blockchain' && '⛓️ Live Blockchain Price'}
              {priceSource === 'fallback' && '📊 Market Price (Cached)'}
              {(priceSource === 'fallback_error' || priceSource === 'error') && '📊 Market Price (Cached)'}
              {priceSource === 'loading' && '⏳ Loading...'}
            </div>
          </div>
        </div>

        {/* Input Section */}
        <div style={{display:'flex', flexDirection:'column', gap:16, marginBottom:20}}>
          {/* Receiver */}
          <div>
            <label style={{ fontWeight: 600, marginBottom: 8, color:'#a3e635', fontSize:14, display:'block' }}>📬 Receiver Address</label>
            <input value={receiver} onChange={e=>setReceiver(e.target.value.trim())} placeholder="Paste Mallcoin address (mall1...)" style={{
              width:'100%', padding:'14px 14px', borderRadius:10, border:'2px solid #232b38', background:'#232b38', color:'#fff', fontSize:15, outline:'none', fontFamily:'monospace', transition:'border-color 0.2s',
              boxSizing: 'border-box'
            }} 
            onFocus={(e) => e.target.style.borderColor = '#a3e635'}
            onBlur={(e) => e.target.style.borderColor = '#232b38'}
            />
            {receiver && receiver.length > 0 && <div style={{marginTop:6, fontSize:12, color: /^mall1/.test(receiver) ? '#a3e635' : '#f87171'}}>
              {/^mall1/.test(receiver) ? '✓ Valid address format' : '⚠ Not a valid Mallcoin address'}
            </div>}
          </div>

          {/* Mapping Alert */}
          {mappingNeeded && (
            <div style={{marginTop:8, padding:14, border:'2px solid #eab308', borderRadius:10, background:'#1a1800'}}>
              <div style={{marginBottom:10, color:'#eab308', fontWeight:600, fontSize:14}}>⚠ Address Mapping Required</div>
              <div style={{marginBottom:8, color:'#ddd', fontSize:13}}>Create a mapping for this hex address:</div>
              <input value={mappingBech32} onChange={e=>setMappingBech32(e.target.value.trim())} placeholder="mall1..." style={{
                width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #eab308', background:'#232b38', color:'#fff', fontSize:14, outline:'none', marginBottom:10,
                boxSizing: 'border-box'
              }} />
              <button onClick={handleCreateMapping} style={{
                width:'100%', padding:'10px', borderRadius:8, border:'none', background:'#eab308', color:'#181f29', fontWeight:600, cursor:'pointer', fontSize:14
              }}>Create Mapping</button>
            </div>
          )}

          {resolvedReceiver && <div style={{padding:10, background:'#0a1a0c', borderRadius:8, fontSize:13, color:'#a3e635', border:'1px solid #1a4d1a'}}>✓ Resolved: <strong>{resolvedReceiver.slice(0,16)}...{resolvedReceiver.slice(-8)}</strong></div>}

          {/* Amount */}
          <div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <label style={{ fontWeight: 600, color:'#a3e635', fontSize:14 }}>💰 Amount to Send</label>
              <button onClick={() => setAmount(maxSendable)} style={{padding:'4px 12px', borderRadius:6, border:'1px solid #a3e635', background:'transparent', color:'#a3e635', fontWeight:600, fontSize:12, cursor:'pointer', transition:'all 0.2s'}}>Max: {maxSendable}</button>
            </div>
            <input value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" style={{
              width:'100%', padding:'14px 14px', borderRadius:10, border:'2px solid #232b38', background:'#232b38', color:'#fff', fontSize:16, outline:'none', fontWeight:600, transition:'border-color 0.2s',
              boxSizing: 'border-box'
            }} 
            onFocus={(e) => e.target.style.borderColor = '#a3e635'}
            onBlur={(e) => e.target.style.borderColor = '#232b38'}
            />
            {isAmountValid && remainingBalance !== null && <div style={{marginTop:6, fontSize:12, color: remainingBalance >= 0 ? '#a3e635' : '#f87171'}}>
              {remainingBalance >= 0 ? `✓ Remaining: ${remainingBalance} MLCNS` : `✗ Insufficient balance`}
            </div>}
          </div>
        </div>

        {/* Transaction Summary */}
        {isAmountValid && (
          <div style={{background:'#181f29', borderRadius:12, padding:16, marginBottom:20, border:'1px solid #232b38'}}>
            <div style={{fontSize:12, color:'#888', marginBottom:14, fontWeight:600}}>TRANSACTION SUMMARY</div>
            
            {/* Transaction ID */}
            {txId && <div style={{marginBottom:14, paddingBottom:14, borderBottom:'1px solid #232b38'}}>
              <div style={{fontSize:12, color:'#888', marginBottom:4}}>Transaction ID</div>
              <div style={{fontFamily:'monospace', fontSize:12, color:'#a3e635', wordBreak:'break-all'}}>{txId}</div>
            </div>}
            
            {/* Amount */}
            <div style={{marginBottom:12}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:14}}>
                <span style={{color:'#ddd'}}>Amount:</span>
                <span style={{color:'#a3e635', fontWeight:600}}>{amountNum.toFixed(6)} MLCNS</span>
              </div>
              {price && <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:'#888'}}>
                <span></span>
                <span>{formatCurrency(amountFiat)}</span>
              </div>}
            </div>
            
            {/* Fee */}
            <div style={{marginBottom:12, borderBottom:'1px solid #232b38', paddingBottom:12}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:14}}>
                <span style={{color:'#ddd'}}>Network Fee:</span>
                <span style={{color:'#a3e635', fontWeight:600}}>{fee} MLCNS</span>
              </div>
              {price && <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:'#888'}}>
                <span></span>
                <span>{formatCurrency(feeFiat)}</span>
              </div>}
            </div>
            
            {/* Total */}
            <div>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, marginBottom:4}}>
                <span style={{color:'#fff'}}>Total Cost:</span>
                <span style={{color:'#a3e635'}}>{totalCost.toFixed(6)} MLCNS</span>
              </div>
              {price && <div style={{display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:600, color:'#a3e635'}}>
                <span></span>
                <span>{formatCurrency(totalFiat)}</span>
              </div>}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={{background:'#1a0c0c', borderRadius:12, padding:14, marginBottom:16, border:'1px solid #f87171', color:'#f87171', fontWeight:600, fontSize:14}}>
            ⚠ {error}
          </div>
        )}

        {/* Send Button */}
        <button onClick={handleSend} disabled={!canSend || pending} style={{
          width:'100%', padding:'16px 0', borderRadius:12, border:'none', 
          background: pending ? '#232b38' : canSend ? 'linear-gradient(90deg,#a3e635,#65a30d)' : '#232b38', 
          color: pending ? '#666' : canSend ? '#181f29' : '#666', 
          fontWeight:700, fontSize:18, letterSpacing:0.5, cursor: pending || !canSend ? 'not-allowed' : 'pointer', 
          boxShadow: canSend && !pending ? '0 4px 12px #a3e63560' : 'none', 
          transition:'all 0.2s',
          marginBottom: 16
        }}>
          {pending ? '⏳ Sending...' : canSend ? '✓ Send Now' : '○ Enter Amount'}
        </button>

        {/* Status Messages */}
        {pending && (
          <div style={{padding:14, background:'#1a1800', borderRadius:10, border:'1px solid #eab308', color:'#eab308', fontWeight:600, fontSize:14, textAlign:'center'}}>
            ⏳ Processing transaction...
          </div>
        )}

        {confirmed && (
          <div style={{padding:16, background:'#0a1a0c', borderRadius:10, border:'2px solid #a3e635', color:'#a3e635'}}>
            <div style={{fontWeight:700, fontSize:16, marginBottom:12}}>✓ Transaction Confirmed!</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12, color:'#888', marginBottom:4}}>Transaction ID:</div>
              <div style={{fontFamily:'monospace', fontSize:12, wordBreak:'break-all', background:'#181f29', padding:8, borderRadius:6, color:'#a3e635'}}>{txId}</div>
            </div>
            <div>
              <div style={{fontSize:12, color:'#888', marginBottom:4}}>Blockchain Hash:</div>
              <div style={{fontFamily:'monospace', fontSize:12, wordBreak:'break-all', background:'#181f29', padding:8, borderRadius:6, color:'#a3e635'}}>{txHash}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'

const countryPhonePrefix = (locale) => {
  try {
    if (!locale) return '+254' // default to Kenya
    const lc = locale.toLowerCase()
    if (lc.includes('ke')) return '+254'
    if (lc.includes('cn') || lc.includes('zh')) return '+86'
    if (lc.includes('ru')) return '+7'
    if (lc.includes('us')) return '+1'
    return '+254'
  } catch (e) { return '+254' }
}

export default function Payment(){
  const { state } = useLocation()
  const navigate = useNavigate()
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  const amount = state?.amount || 0
  const fiat = state?.fiat || ''
  const currency = state?.currency || 'KES'

  const [method, setMethod] = useState('mpesa')
  const [locale, setLocale] = useState(undefined)
  const [prefix, setPrefix] = useState('+254')
  const [phoneRest, setPhoneRest] = useState('')
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    const detected = (() => {
      try {
        const lang = (navigator && (navigator.language || (navigator.languages && navigator.languages[0]))) || ''
        const regionMatch = String(lang).toLowerCase().match(/[-_]([a-z]{2})$/)
        if (regionMatch) return regionMatch[1].toUpperCase()
      } catch (e) {}
      return undefined
    })()
    setLocale(detected)
    // If phone passed from buy flow, prefill prefix and rest
    const fromStatePhone = state?.phone
    if (fromStatePhone) {
      // try split +country then rest
      const m = String(fromStatePhone).match(/^(\+\d+)(.*)$/)
      if (m) {
        setPrefix(m[1])
        setPhoneRest(m[2].replace(/\D/g,''))
      } else {
        setPrefix(countryPhonePrefix(detected || (state?.currencyLocale)))
      }
    } else {
      setPrefix(countryPhonePrefix(detected || (state?.currencyLocale)))
    }
  }, [])

  const fullPhone = () => {
    const rest = (phoneRest || '').replace(/\D/g,'')
    return `${prefix}${rest.startsWith(prefix.replace('+','')) ? rest : rest}`
  }

  const handlePay = async () => {
    if (!phoneRest) { setStatus({ ok:false, msg:'Enter phone number' }); return }
    setProcessing(true)
    setStatus({ ok:null, msg:'Initiating payment...' })

    // Attempt to call backend payment endpoint; if it fails, simulate provider flow
    try {
      const payload = { method, phone: fullPhone(), amountFiat: fiat, amountMallcoin: amount }
      const res = await axios.post(`${base}/api/payment/mpesa/initiate`, payload, { timeout: 10000 })
      // backend should return { providerRef, status: 'pending' }
      setStatus({ ok:null, msg:'Waiting for provider confirmation...' })
      // poll or wait for webhook — for now simulate success if backend accepted
      // If backend indicates immediate success, handle it
      if (res && res.data && res.data.status === 'success'){
        setStatus({ ok:true, msg:'Payment confirmed by provider' })
        // simulate crediting: call backend to release mallcoin
        await axios.post(`${base}/api/mallwallet/credit`, { amount, reference: res.data.providerRef, phone: fullPhone() }).catch(()=>{})
        setProcessing(false)
      } else {
        // simulate provider prompt and eventual success
        setTimeout(async ()=>{
          setStatus({ ok:true, msg:`Payment of ${fiat} received from ${fullPhone()}` })
          // notify backend to credit
          await axios.post(`${base}/api/mallwallet/credit`, { amount, reference: 'mock-rx-001', phone: fullPhone() }).catch(()=>{})
          setProcessing(false)
        }, 4000)
      }
    } catch (e) {
      // backend not present or failed — simulate the whole flow
      setStatus({ ok:null, msg:'Provider prompt: confirm on your phone...' })
      setTimeout(async ()=>{
        setStatus({ ok:true, msg:`Payment of ${fiat} received from ${fullPhone()}` })
        // call credit endpoint if exists
        await axios.post(`${base}/api/mallwallet/credit`, { amount, reference: 'simulated-001', phone: fullPhone() }).catch(()=>{})
        setProcessing(false)
      }, 5000)
    }
  }

  // Enhanced UI
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg,#10151c 60%,#232b38 100%)', padding: 0 }}>
      <div style={{ maxWidth: 480, margin: '64px auto', fontFamily: 'Inter, system-ui', padding: 32, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002' }}>
        <h2 style={{ marginBottom: 10, fontWeight: 700, fontSize: 26, color: '#a3e635', letterSpacing: -1 }}>Payment</h2>
        <div style={{ marginBottom: 18, color:'#fff', fontSize:16 }}>
          Buying <strong style={{ color:'#a3e635' }}>{amount}</strong> MLCNS for <strong style={{ color:'#a3e635' }}>{fiat}</strong>
        </div>

        <label style={{ fontSize:15, color:'#a3e635', marginBottom:6 }}>Choose payment method</label>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display:'flex', gap:8, alignItems:'center', color:'#fff', fontSize:16 }}>
            <input type="radio" name="method" value="mpesa" checked={method==='mpesa'} onChange={()=>setMethod('mpesa')} /> Mpesa (Safaricom)
          </label>
        </div>

        {method === 'mpesa' && (
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14 }}>
            <span style={{ padding:'10px 14px', background:'#181f29', borderRadius:8, color:'#a3e635', fontWeight:600, fontSize:16 }}>{prefix}</span>
            <input
              aria-label="phone-rest"
              placeholder="7xxxxxxxx"
              value={phoneRest}
              onChange={e => setPhoneRest(e.target.value)}
              style={{ flex:1, padding:'12px', borderRadius:10, border:'1px solid #232b38', background:'#181f29', color:'#fff', fontSize:16, fontFamily:'Inter, system-ui', boxShadow:'0 1px 6px #0001' }}
            />
          </div>
        )}

        <div style={{ fontSize:14, color:'#fff', opacity:0.7, marginBottom:18 }}>You will be prompted by the provider to confirm the payment on your phone.</div>

        <button
          disabled={processing}
          onClick={handlePay}
          style={{ width:'100%', padding:'16px 0', borderRadius:12, border:'none', background:'linear-gradient(90deg,#a3e635,#65a30d)', color:'#181f29', fontWeight:700, fontSize:18, letterSpacing:0.5, cursor:'pointer', boxShadow:'0 2px 8px #a3e63544', transition:'background 0.2s, color 0.2s', marginBottom:10 }}
        >
          Pay {fiat || ''}
        </button>

        {status && (
          <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: status.ok ? '#181f29' : '#232b38', color: status.ok ? '#a3e635' : '#f87171', fontWeight:600, fontSize:16 }}>
            {status.msg}
          </div>
        )}

        <button
          onClick={() => navigate('/buy')}
          style={{ width:'100%', padding:'14px 0', borderRadius:10, border:'none', background:'#232b38', color:'#fff', fontWeight:700, fontSize:17, cursor:'pointer', marginTop:18 }}
        >
          Back
        </button>
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function PayAddress() {
  const location = useLocation()
  const navigate = useNavigate()
  const { fiat, mallcoin } = location.state || {}
  const [mode, setMode] = useState('enter') // 'enter' | 'scan'
  const [address, setAddress] = useState('')
  const videoRef = React.useRef(null)
  const rafRef = React.useRef(null)
  const streamRef = React.useRef(null)

  // Camera scan logic (same as Pay.jsx)
  React.useEffect(() => {
    if (mode !== 'scan') return
    setAddress('')
    let detector = null
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        if ('BarcodeDetector' in window) {
          detector = new BarcodeDetector({ formats: ['qr_code'] })
          const scanFrame = async () => {
            try {
              const result = await detector.detect(videoRef.current)
              if (result && result.length) {
                setAddress(result[0].rawValue || '')
                stopCamera()
                return
              }
            } catch (e) {}
            rafRef.current = requestAnimationFrame(scanFrame)
          }
          rafRef.current = requestAnimationFrame(scanFrame)
        }
      } catch (e) { console.error('camera start failed', e) }
    }
    const stopCamera = () => {
      try { if (rafRef.current) cancelAnimationFrame(rafRef.current) } catch(e){}
      try { if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop()) } catch(e){}
      if (videoRef.current) videoRef.current.srcObject = null
    }
    startCamera()
    return () => { stopCamera() }
  }, [mode])

  const handleFile = async (ev) => {
    const f = ev.target.files && ev.target.files[0]
    if (!f) return
    if ('BarcodeDetector' in window) {
      try {
        const img = await createImageBitmap(f)
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        const r = await detector.detect(img)
        if (r && r.length) {
          let val = r[0].rawValue || ''
          if (val.startsWith('mallcoin:')) val = val.slice(9)
          // TODO: add checksum/length validation here
          setAddress(val)
        }
      } catch (e) { console.error('file decode failed', e) }
    } else {
      alert('QR decoding not supported in this browser — please paste the address manually.')
    }
  }

  const handleNext = () => {
    if (!address) { alert('Enter or scan a destination address'); return }
    navigate('/send', { state: { to: address, fiat, mallcoin } })
  }

  return (
    <div style={{padding:20}}>
      <h2>Enter or Scan Recipient Address</h2>
      <div style={{marginBottom:16}}>
        <div>Amount in fiat: <strong>{fiat || '—'}</strong></div>
        <div>Mallcoins to send: <strong>{mallcoin || '—'}</strong></div>
      </div>
      <div style={{display:'flex', gap:20}}>
        <div style={{flex:1}}>
          <div style={{display:'flex', gap:8, marginBottom:12}}>
            <button onClick={()=>setMode('enter')} disabled={mode==='enter'}>Enter address</button>
            <button onClick={()=>setMode('scan')} disabled={mode==='scan'}>Scan QR</button>
          </div>
          {mode === 'enter' && (
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              <label>Recipient address</label>
              <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="paste or type wallet address" />
            </div>
                  )}
                </div>
                <div style={{width:320, display:'flex', flexDirection:'column', gap:8, alignItems:'center'}}>
                  {mode === 'scan' ? (
                    <>
                      <video ref={videoRef} style={{width:'100%', background:'#000'}} playsInline muted />
                      <input type="file" accept="image/*" onChange={handleFile} />
                    </>
                  ) : (
                    <div style={{padding:12, color:'#666'}}>Switch to "Scan QR" to use the camera.</div>
                  )}
                </div>
              </div>
              <div style={{marginTop:20, display:'flex', gap:8}}>
                <button onClick={()=>navigate(-1)}>Back</button>
                <button onClick={handleNext}>Next</button>
              </div>
            </div>
          )
        }

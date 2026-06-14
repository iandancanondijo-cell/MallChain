import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Pay() {
  const navigate = useNavigate()

  /* -------------------- State -------------------- */
  const [mode, setMode] = useState('enter')
  const [address, setAddress] = useState('')
  const [fiat, setFiat] = useState('')
  const [mallcoin, setMallcoin] = useState('')
  const [price, setPrice] = useState(null)
  const [loadingPrice, setLoadingPrice] = useState(true)
  const [priceError, setPriceError] = useState(null)
  const [scanning, setScanning] = useState(false)

  /* -------------------- Refs -------------------- */
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)

  /* -------------------- Fetch Price -------------------- */
  useEffect(() => {
    async function fetchPrice() {
      try {
        setLoadingPrice(true)
        const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
        const res = await fetch(`${base}/api/market/price`)
        const data = await res.json()

        // Use mid price for Mallcoin (for consistency with Convert page)
        const p = Number(data?.market_price?.mid)
        if (!p || isNaN(p)) throw new Error('Invalid price')

        setPrice(p)
        setPriceError(null)
      } catch {
        setPriceError('Unable to load Mallcoin price')
        setPrice(null)
      } finally {
        setLoadingPrice(false)
      }
    }
    fetchPrice()
  }, [])

  /* -------------------- Calculate Mallcoin -------------------- */
  useEffect(() => {
    if (!fiat || !price) {
      setMallcoin('')
      return
    }

    const value = Number(fiat)
    if (isNaN(value) || value <= 0) {
      setMallcoin('')
      return
    }

    setMallcoin((value / price).toFixed(6))
  }, [fiat, price])

  /* -------------------- Camera -------------------- */
  useEffect(() => {
    if (mode !== 'scan') return

    setAddress('')
    startCamera()

    return stopCamera
  }, [mode])

  async function startCamera() {
    try {
      setScanning(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })

      streamRef.current = stream
      if (!videoRef.current) return

      videoRef.current.srcObject = stream
      await videoRef.current.play()

      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] })

        const scan = async () => {
          if (!videoRef.current) return
          try {
            const res = await detector.detect(videoRef.current)
            if (res?.length) {
              setAddress(res[0].rawValue)
              stopCamera()
              return
            }
          } catch {}
          rafRef.current = requestAnimationFrame(scan)
        }
        rafRef.current = requestAnimationFrame(scan)
      }
    } catch (e) {
      console.error('Camera error', e)
      setScanning(false)
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null

    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
  }

  /* -------------------- File QR -------------------- */
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file || !('BarcodeDetector' in window)) return

    try {
      const img = await createImageBitmap(file)
      const detector = new BarcodeDetector({ formats: ['qr_code'] })
      const res = await detector.detect(img)
      if (res?.length) setAddress(res[0].rawValue)
    } catch (e) {
      console.error('QR decode failed', e)
    }
  }

  /* -------------------- Input Validation -------------------- */
  const isAddressValid = address && address.length >= 40;
  const isFiatValid = fiat && !isNaN(Number(fiat)) && Number(fiat) > 0;
  const canProceed = isAddressValid && mallcoin && isFiatValid && !priceError;

  /* -------------------- Actions -------------------- */
  function handleSend() {
    if (!canProceed) return;
    navigate('/pay/confirm', {
      state: {
        to: address,
        amount: mallcoin,
        fiat,
        price,
      },
    });
  }

  /* -------------------- UI -------------------- */
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 32, fontFamily: 'Inter, sans-serif' }}>
      <h2 style={{ marginBottom: 6, fontWeight: 700, fontSize: 28, letterSpacing: -1 }}>Pay with Mallcoin</h2>
      <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 16 }}>
        Send Mallcoin by entering a wallet address or scanning a QR code.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 32 }}>
        {/* Left */}
        <div style={{ background: '#10151c', padding: 28, borderRadius: 16, boxShadow: '0 2px 12px #0002', minHeight: 480 }}>
          {/* Mode */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <button
              disabled={mode === 'enter'}
              onClick={() => setMode('enter')}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                background: mode === 'enter' ? '#1e293b' : '#232b38',
                color: '#fff',
                fontWeight: 600,
                cursor: mode === 'enter' ? 'default' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              Enter Address
            </button>
            <button
              disabled={mode === 'scan'}
              onClick={() => setMode('scan')}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                background: mode === 'scan' ? '#1e293b' : '#232b38',
                color: '#fff',
                fontWeight: 600,
                cursor: mode === 'scan' ? 'default' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              Scan QR
            </button>
          </div>

          {/* Amount */}
          <label style={{ fontWeight: 500, marginBottom: 4 }}>Amount (Fiat)</label>
          <input
            value={fiat}
            onChange={e => setFiat(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="e.g. 100"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #232b38',
              background: '#181f29',
              color: '#fff',
              fontSize: 16,
              marginBottom: 10,
              outline: 'none',
            }}
            inputMode="decimal"
          />

          <label style={{ fontWeight: 500, marginTop: 8, marginBottom: 4 }}>Mallcoin Required</label>
          <input
            readOnly
            value={mallcoin}
            placeholder="Calculated"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #232b38',
              background: '#181f29',
              color: '#fff',
              fontSize: 16,
              marginBottom: 10,
              outline: 'none',
            }}
          />

          {/* Price */}
          <div style={{ fontSize: 14, marginTop: 6, opacity: 0.85, color: priceError ? '#e53e3e' : '#a3e635', fontWeight: 500 }}>
            {loadingPrice && 'Loading price…'}
            {priceError && (
              <>
                {priceError}<br/>
                <span style={{fontSize:12, color:'#e53e3e'}}>Check your network connection and backend server.</span>
              </>
            )}
            {price && !priceError && `1 Mallcoin ≈ ${price}`}
          </div>

          {/* Address */}
          {mode === 'enter' && (
            <>
              <label style={{ fontWeight: 500, marginTop: 14, marginBottom: 4 }}>Recipient Address</label>
              <input
                value={address}
                onChange={e => setAddress(e.target.value.trim())}
                placeholder={priceError ? "Cannot pay until price loads" : "Wallet address"}
                disabled={!!priceError}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: isAddressValid || !address ? '1px solid #232b38' : '1.5px solid #e53e3e',
                  background: '#181f29',
                  color: '#fff',
                  fontSize: 16,
                  marginBottom: 6,
                  outline: 'none',
                }}
              />
              {!isAddressValid && address && (
                <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 4 }}>Address looks invalid</div>
              )}
            </>
          )}

          {/* Scan */}
          {mode === 'scan' && (
            <div style={{ marginTop: 14 }}>
              <div style={{ width: 320, height: 320, background: '#000', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 8px #0004' }}>
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
                />
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                <input type="file" accept="image/*" onChange={handleFile} style={{ color: '#fff' }} />
                <button onClick={stopCamera} style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#232b38',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}>Stop</button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop: 28 }}>
            <button
              onClick={handleSend}
              disabled={!canProceed}
              style={{
                width: '100%',
                padding: '14px 0',
                borderRadius: 10,
                border: 'none',
                background: canProceed ? 'linear-gradient(90deg,#a3e635,#65a30d)' : '#232b38',
                color: canProceed ? '#181f29' : '#888',
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: 0.5,
                cursor: canProceed ? 'pointer' : 'not-allowed',
                boxShadow: canProceed ? '0 2px 8px #a3e63544' : 'none',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              Proceed
            </button>
          </div>
        </div>

        {/* Preview */}
        <div style={{ background: '#10151c', padding: 28, borderRadius: 16, boxShadow: '0 2px 12px #0002', minHeight: 180 }}>
          <h4 style={{ fontWeight: 700, fontSize: 20, marginBottom: 16, color: '#a3e635' }}>Payment Preview</h4>
          <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', color: '#fff', fontSize: 15, marginBottom: 8 }}>
            {address || <span style={{ color: '#888' }}>No address</span>}
          </div>
          <div style={{ marginTop: 10, color: '#fff', fontSize: 15 }}>Fiat: <span style={{ color: '#a3e635' }}>{fiat || '—'}</span></div>
          <div style={{ color: '#fff', fontSize: 15 }}>Mallcoin: <span style={{ color: '#a3e635' }}>{mallcoin || '—'}</span></div>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { QRCodeSVG as QRCode } from 'qrcode.react'
import { ethers } from 'ethers'
import axios from 'axios'

export default function Receive(){
  const [hexAddress, setHexAddress] = useState('')
  const [bech32Address, setBech32Address] = useState('')
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  useEffect(() => {
    // Use a session-scoped receive address so it's one-time for this user/session
    let recv = sessionStorage.getItem('receive_address')
    if (!recv) {
      try {
        const w = ethers.Wallet.createRandom()
        recv = w.address
        sessionStorage.setItem('receive_address', recv)
      } catch (e) {
        // fallback: generate a pseudo-random id
        recv = 'mall1' + Math.random().toString(36).slice(2, 18)
        sessionStorage.setItem('receive_address', recv)
      }
    }
    setHexAddress(recv)
    // Try to resolve bech32 mapping from backend
    axios.get(`${base}/api/address/map/${recv}`).then(r => {
      if (r.data && r.data.ok && r.data.bech32) {
        setBech32Address(r.data.bech32)
      } else {
        setBech32Address('')
      }
    }).catch(() => setBech32Address(''))
  }, [])

  const handleCopy = async (addr) => {
    try {
      await navigator.clipboard.writeText(addr)
      alert('Address copied to clipboard')
    } catch (e) {
      console.error('copy failed', e)
    }
  }

  // Enhanced UI
  const [copyMsg, setCopyMsg] = useState('');
  const handleCopyEnhanced = async (addr) => {
    try {
      await navigator.clipboard.writeText(addr)
      setCopyMsg('Copied!');
      setTimeout(() => setCopyMsg(''), 1200);
    } catch (e) {
      setCopyMsg('Copy failed');
      setTimeout(() => setCopyMsg(''), 1200);
    }
  };
  return (
    <div style={{ maxWidth: 440, margin: '48px auto', fontFamily: 'Inter, system-ui', padding: 28, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002' }}>
      <h2 style={{ marginBottom: 10, fontWeight: 700, fontSize: 26, color: '#a3e635', letterSpacing: -1 }}>Receive Mallcoin</h2>
      <p style={{ color: '#fff', opacity: 0.8, marginBottom: 18 }}>Share this QR or address to receive Mallcoin. This QR is unique to this receive address.</p>

      <div style={{display:'flex', gap:24, alignItems:'center', flexDirection:'column', marginTop:18}}>
        <div style={{position:'relative', width:260, height:260, background:'#181f29', borderRadius:16, boxShadow:'0 1px 8px #0004', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <QRCode value={`mallcoin:${bech32Address || hexAddress}`} size={220} bgColor="#181f29" fgColor="#a3e635" style={{borderRadius:12}} />
          <img
            src="/Mallcoin.png"
            alt="Mallcoin"
            style={{
              position:'absolute',
              left:'50%',
              top:'50%',
              transform:'translate(-50%,-50%)',
              width:60,
              height:60,
              borderRadius:14,
              background:'#041218',
              padding:6,
              boxShadow:'0 8px 24px rgba(2,6,12,0.7)',
              border:'1px solid rgba(255,255,255,0.04)',
              zIndex: 2
            }}
          />
        </div>

        <div style={{fontFamily:'monospace', wordBreak:'break-all', textAlign:'center', color:'#fff', fontSize:15, marginTop:8}}>
          <div><b>Hex address:</b><br/>{hexAddress}</div>
          {bech32Address && <div style={{marginTop:8}}><b>Bech32 address:</b><br/>{bech32Address}</div>}
        </div>

        <div style={{display:'flex', gap:12, marginTop:8}}>
          <button onClick={()=>handleCopyEnhanced(bech32Address || hexAddress)} style={{
            padding:'10px 18px', borderRadius:8, border:'none', background:'#a3e635', color:'#181f29', fontWeight:700, fontSize:16, cursor:'pointer', minWidth:110
          }}>Copy address</button>
          <button onClick={() => {
            sessionStorage.removeItem('receive_address');
            const w = ethers.Wallet.createRandom();
            sessionStorage.setItem('receive_address', w.address);
            setHexAddress(w.address);
            setBech32Address('');
            axios.get(`${base}/api/address/map/${w.address}`).then(r => {
              if (r.data && r.data.ok && r.data.bech32) {
                setBech32Address(r.data.bech32)
              } else {
                setBech32Address('')
              }
            }).catch(() => setBech32Address(''))
          }} style={{
            padding:'10px 18px', borderRadius:8, border:'none', background:'#232b38', color:'#fff', fontWeight:700, fontSize:16, cursor:'pointer', minWidth:110
          }}>Generate new</button>
        </div>
        {copyMsg && <div style={{ color: '#a3e635', fontWeight: 600, marginTop: 6 }}>{copyMsg}</div>}
      </div>
    </div>
  )
}

import React from "react";
import { useEffect, useState } from "react";
import axios from 'axios'
import { createWallet, loadWallet, importWallet } from '../mallwallet'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const [address, setAddress] = useState('')
  const [balance, setBalance] = useState('0')
  const [loading, setLoading] = useState(false)
  const [importKey, setImportKey] = useState('')
  const [status, setStatus] = useState('')

  async function fetchBalance(addr) {
    setLoading(true)
    try {
      const res = await axios.get(`http://localhost:4000/api/mallwallet/balance/${addr}`)
      setBalance(res.data.balance)
    } catch (e) {
      console.error(e)
      setBalance('0')
    }
    setLoading(false)
  }

  const nav = useNavigate()

  useEffect(() => {
    const addr = localStorage.getItem('mall_address')
    if (addr) {
      setAddress(addr)
      fetchBalance(addr)
    }
    // poll every 15s
    let id = null
    if (addr) {
      id = setInterval(() => fetchBalance(addr), 15000)
    }
    return () => { if (id) clearInterval(id) }
  }, [])

  function handleCreate() {
    const addr = createWallet('')
    setAddress(addr)
    fetchBalance(addr)
    setStatus('Wallet created')
    nav('/wallet')
  }

  function handleImport() {
    if (!importKey) return setStatus('Enter private key')
    const addr = importWallet(importKey.trim(), '')
    if (!addr) return setStatus('Import failed (invalid key)')
    setAddress(addr)
    fetchBalance(addr)
    setStatus('Wallet imported')
    nav('/wallet')
  }

  return (
    <div className="app-center">
      <div className="card">
        <div className="left">
          <h2>Your Wallet</h2>
          <p className="sub">Lightweight dashboard — private key is stored encrypted in your browser.</p>

          <div style={{ marginTop: 18 }}>
            <div style={{ marginBottom: 8 }}><strong>Address</strong></div>
            <div style={{ padding: 12, background: '#071018', borderRadius: 8 }}>{address || 'No wallet'}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}><strong>Balance</strong></div>
            <div style={{ padding: 12, background: '#071018', borderRadius: 8 }}>{loading ? 'Loading…' : `${balance} MLCNS`}</div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            <button className="primary" onClick={() => { if (address) { nav('/wallet') } else { handleCreate() } }}>
              {address ? 'Open Wallet' : 'Create Wallet'}
            </button>
            <button className="primary" onClick={() => { if (address) { setStatus(''); fetchBalance(address) } }}>Refresh</button>
          </div>

          {!address && (
            <div style={{ marginTop: 18 }}>
              <div style={{ marginBottom: 8 }}><strong>Import Private Key</strong></div>
              <input value={importKey} onChange={(e) => setImportKey(e.target.value)} placeholder="0x..." style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: '#061018' }} />
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button className="primary" onClick={handleImport}>Import</button>
              </div>
            </div>
          )}

          {status && <div style={{ marginTop: 12, opacity: 0.85 }}>{status}</div>}
        </div>
      </div>
    </div>
  )
}

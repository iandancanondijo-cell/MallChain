import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Vault({ token }){
  const [items, setItems] = useState([])
  const [authority, setAuthority] = useState('')
  const [status, setStatus] = useState('active')
  const [data, setData] = useState('{}')
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  const fetch = () => {
    axios.get(`${base}/api/vault`).then(r=>setItems(r.data)).catch(()=>setItems([]))
  }

  useEffect(()=>{ fetch() },[])

  const createVault = async (e) => {
    e.preventDefault()
    let parsed
    try { parsed = JSON.parse(data) } catch(err){ alert('Data must be valid JSON'); return }
    try{
      await axios.post(`${base}/api/vault`, { authority, status, data: parsed }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      setAuthority('')
      setStatus('active')
      setData('{}')
      fetch()
    }catch(err){
      alert('Create failed: ' + (err?.response?.data || err.message))
    }
  }

  return (
    <div>
      <h2>Vaults</h2>

      <form onSubmit={createVault} style={{ marginBottom: 12 }}>
        <input placeholder='authority' value={authority} onChange={e=>setAuthority(e.target.value)} />
        <select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value='active'>active</option>
          <option value='inactive'>inactive</option>
        </select>
        <input style={{ width: 300 }} value={data} onChange={e=>setData(e.target.value)} />
        <button type='submit'>Create Vault</button>
      </form>

      <ul>
        {items.map(v=> (
          <li key={v._id}>{v.authority} — {v.status} — <pre style={{display:'inline'}}>{JSON.stringify(v.data)}</pre></li>
        ))}
      </ul>
    </div>
  )
}

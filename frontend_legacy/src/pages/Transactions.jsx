import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Transactions(){
  const [txs, setTxs] = useState([])
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
  useEffect(()=>{
    axios.get(`${base}/api/tx`).then(r=>setTxs(r.data)).catch(()=>setTxs([]))
  },[])
  return (
    <div>
      <h2>Transactions</h2>
      <ul>
        {txs.map(t=> (
          <li key={t._id}>{t.from} → {t.to || '-'} : {t.amount}</li>
        ))}
      </ul>
    </div>
  )
}

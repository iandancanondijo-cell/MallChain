import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

function formatPct(n) { return Number(n).toFixed(2) + '%' }

export default function MallcoinDonut({ data, monthlyData, weeklyData, dailyData }) {
  // Accept either legacy `data` (monthly) or explicit monthly/weekly/daily props
  const monthly = monthlyData || data || null
  const weekly = weeklyData || null
  const daily = dailyData || null

  const [clientMonthly, setClientMonthly] = useState(null)
  const [clientWeekly, setClientWeekly] = useState(null)
  const [clientDaily, setClientDaily] = useState(null)

  // If no props provided, try to fetch directly from chain REST and compute breakdowns
  useEffect(() => {
    if (monthly || weekly || daily) return
    let mounted = true
    const base = import.meta.env.VITE_CHAIN_REST || 'http://127.0.0.1:1317'

    const monthKey = (ts) => {
      if (!ts) return null
      let t = Number(ts)
      if (t < 1e12) t = t * 1000
      const d = new Date(t)
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      return `${y}-${m}`
    }

    const sumMap = (map, k, v) => { map[k] = (map[k] || 0) + (v || 0) }

    const load = async () => {
      try {
        const [tradesResp, txResp, esResp] = await Promise.all([
          fetch(`${base}/tmp/marketplace/mlcoin/v1/market/trades`).then(r => r.json()).catch(() => ({})),
          fetch(`${base}/tmp/marketplace/mlcoin/v1/transactions`).then(r => r.json()).catch(() => ({})),
          fetch(`${base}/tmp/marketplace/mlcoin/v1/emission_state`).then(r => r.json()).catch(() => ({}))
        ])

        const trades = (tradesResp && tradesResp.trades) || []
        const txs = (txResp && txResp.transactions) || []

        const boughtMap = {}
        const mintedTotalMap = {}
        const conversionMap = {}
        const awardedMap = {}

        trades.forEach(t => {
          try {
            if ((t.trade_type || t.tradeType || '').toLowerCase() === 'buy') {
              const key = monthKey(t.timestamp || t.Timestamp)
              const amount = Number(t.mlcn_amount || t.mlcnAmount || 0) / 1_000_000
              if (key) sumMap(boughtMap, key, amount)
            }
          } catch (e) {}
        })

        txs.forEach(tx => {
          try {
            const txType = (tx.tx_type || tx.txType || '').toLowerCase()
            if (txType && txType.includes('mint')) {
              const key = monthKey(tx.timestamp || tx.Timestamp)
              const amount = Number(tx.amount || 0) / 1_000_000
              if (!key) return
              sumMap(mintedTotalMap, key, amount)
              const memo = (tx.memo || tx.Memo || '').toLowerCase()
              if (memo.includes('convert') || memo.includes('conversion')) sumMap(conversionMap, key, amount)
              else if (memo.includes('award') || memo.includes('reward') || memo.includes('airdrop')) sumMap(awardedMap, key, amount)
            }
          } catch (e) {}
        })

        const keys = new Set([...Object.keys(boughtMap), ...Object.keys(mintedTotalMap), ...Object.keys(conversionMap), ...Object.keys(awardedMap)])
        const allKeys = Array.from(keys).sort().slice(-12)

        let months = allKeys.map(k => {
          const bought = Number((boughtMap[k] || 0))
          const mintedTotal = Number((mintedTotalMap[k] || 0))
          const conversion = Number((conversionMap[k] || 0))
          const awarded = Number((awardedMap[k] || 0))
          const mintedExclBuys = Math.max(0, mintedTotal - bought)
          let other = mintedExclBuys - conversion - awarded
          if (other < 0) other = 0
          const total = Number((bought + conversion + awarded + other))
          return { month: k, bought, minted_conversion: conversion, awarded, other, total }
        })

        // if no months, try to synthesize from emission_state monthly_cap
        if (!months.length) {
          const es = (esResp && (esResp.emission_state || esResp.emissionState)) || null
          if (es) {
            const rawMonthly = Number(es.monthly_cap || es.monthlyCap || 0)
            const monthlyVal = rawMonthly / 1_000_000
            const out = []
            const now = new Date()
            for (let i = 11; i >= 0; i--) {
              const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
              const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
              out.push({ month: key, bought: 0, minted_conversion: 0, awarded: 0, other: monthlyVal, total: monthlyVal })
            }
            months = out
          }
        }

        if (!mounted) return
        if (months && months.length) {
          const latest = months[months.length - 1]
          const monthlyObj = { totalSupply: Number(latest.total || 0), bought: Number(latest.bought || 0), minted: Number(latest.minted_conversion || 0), awarded: Number(latest.awarded || 0) }
          setClientMonthly(monthlyObj)
          setClientWeekly({ totalSupply: Number((monthlyObj.totalSupply * 0.25).toFixed(6)), bought: Number((monthlyObj.bought * 0.25).toFixed(6)), minted: Number((monthlyObj.minted * 0.25).toFixed(6)), awarded: Number((monthlyObj.awarded * 0.25).toFixed(6)) })
          setClientDaily({ totalSupply: Number((monthlyObj.totalSupply / 30).toFixed(6)), bought: Number((monthlyObj.bought / 30).toFixed(6)), minted: Number((monthlyObj.minted / 30).toFixed(6)), awarded: Number((monthlyObj.awarded / 30).toFixed(6)) })
        }
      } catch (e) {
        // ignore
      }
    }

    load()
    return () => { mounted = false }
  }, [monthly, weekly, daily])

  const effectiveMonthly = monthly || clientMonthly
  const effectiveWeekly = weekly || clientWeekly
  const effectiveDaily = daily || clientDaily

  if (!effectiveMonthly && !effectiveWeekly && !effectiveDaily) {
    return <div style={{color:'#6b7280'}}>Loading Mallcoin breakdown…</div>
  }

  const build = (d) => {
    if (!d) return null
    const bought = Number(d.bought || 0)
    const minted = Number(d.minted || d.minted_conversion || 0)
    const awarded = Number(d.awarded || 0)
    const totalSupply = Number(d.totalSupply || d.total || (bought + minted + awarded) || 0)
    const sum = (bought + minted + awarded) || totalSupply || 1
    return { bought, minted, awarded, totalSupply, sum, pctBought: bought / sum, pctMinted: minted / sum, pctAwarded: awarded / sum }
  }

  const m = build(monthly)
  const w = build(weekly || (monthly ? { bought: monthly.bought * 0.25, minted: monthly.minted * 0.25, awarded: monthly.awarded * 0.25, totalSupply: monthly.totalSupply * 0.25 } : null))
  const d = build(daily || (monthly ? { bought: monthly.bought / 30, minted: monthly.minted / 30, awarded: monthly.awarded / 30, totalSupply: monthly.totalSupply / 30 } : null))

  const size = 220
  const center = size / 2

  const renderSingle = (title, info) => {
    if (!info) return (
      <div style={{width:size, textAlign:'center'}}>
        <div style={{fontSize:14, color:'#6b7280'}}>{title}</div>
        <div style={{color:'#6b7280', marginTop:12}}>No data</div>
      </div>
    )

    const rings = [
      { r: 88, stroke: 14, value: info.pctBought, color: '#2563eb', label: 'Bought' },
      { r: 66, stroke: 14, value: info.pctMinted, color: '#22c55e', label: 'Minted' },
      { r: 44, stroke: 14, value: info.pctAwarded, color: '#f59e0b', label: 'Awarded' },
    ]

    return (
      <div style={{width:size,display:'flex',flexDirection:'column',alignItems:'center'}}>
        <div style={{fontSize:14, color:'#374151', marginBottom:8}}>{title}</div>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`translate(${center},${center})`}>
            {rings.map((ring, i) => {
              const circumference = 2 * Math.PI * ring.r
              const dash = Math.max(0.0001, ring.value) * circumference
              const gap = Math.max(0, circumference - dash)
              const trackColor = '#e6eefb'
              return (
                <g key={i}>
                  <circle r={ring.r} cx={0} cy={0} fill="none" stroke={trackColor} strokeWidth={ring.stroke} />
                  <motion.circle
                    r={ring.r}
                    cx={0}
                    cy={0}
                    fill="none"
                    stroke={ring.color}
                    strokeWidth={ring.stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${gap}`}
                    transform={`rotate(-90)`}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 0.9, delay: i * 0.08, ease: 'easeOut' }}
                  />
                </g>
              )
            })}

            <g>
              <text x={0} y={6} textAnchor="middle" fill="#7c3aed" style={{fontSize:18, fontWeight:700}}>
                {((info.sum / Math.max(info.totalSupply, 1)) * 100).toFixed(1)}%
              </text>
            </g>
          </g>
        </svg>

        <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8,width:'100%'}}>
          {rings.map((r, i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:10, padding:'4px 8px'}}>
              <div style={{width:12,height:12,background:r.color,borderRadius:3}} />
              <div style={{flex:'1 1 auto'}}>{r.label}</div>
              <div style={{fontWeight:700}}>{formatPct((r.value || 0) * 100)}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const ordinal = (n) => {
    const s = ["th","st","nd","rd"], v = n % 100
    return (s[(v-20)%10] || s[v] || s[0])
  }

  const now = new Date()
  const dayNum = now.getDate()
  const daySuffix = ordinal(dayNum)
  const weekdayShort = now.toLocaleDateString(undefined, { weekday: 'short' })
  const monthShort = now.toLocaleDateString(undefined, { month: 'short' })

  return (
    <div style={{display:'flex',gap:'4cm',alignItems:'flex-start',flexWrap:'wrap'}}>
      {renderSingle('Monthly', m)}
      {renderSingle('This week', w)}

      <div style={{display:'flex',alignItems:'center',gap:16}}>
        {renderSingle('Today', d)}
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',color:'#6b7280'}}>
          <div style={{fontSize:14,fontWeight:600}}>{`${dayNum}${daySuffix}`}</div>
          <div style={{fontSize:12,opacity:0.9}}>{weekdayShort}</div>
          <div style={{fontSize:12,opacity:0.9}}>{monthShort}</div>
        </div>
      </div>
    </div>
  )
}

import React from 'react'
import LiquidityPool from '../components/LiquidityPool'
import Header from '../components/Header'

export default function Liquidity() {
  return (
    <div style={{ fontFamily: 'Inter, system-ui', background: '#10151c', minHeight: '100vh' }}>
      <Header />
      <div style={{ padding: '28px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ 
          fontSize: 28, 
          fontWeight: 700, 
          color: '#a3e635', 
          marginBottom: 24,
          letterSpacing: -1
        }}>
          💧 Liquidity Management
        </h1>
        <LiquidityPool />
      </div>
    </div>
  )
}

import React from 'react'

export default function Mallcoin(){
  return (
    <div id="mallcoin-root" style={{position:'relative',minHeight:'100vh',overflow:'hidden'}}>
      <div style={{
        position:'absolute',
        inset:0,
        backgroundImage:"url('/assets/Mallcoin.png')",
        backgroundSize:'cover',
        backgroundPosition:'center',
        filter:'blur(24px) saturate(0.7) brightness(0.6)',
        transform:'scale(1.06)',
        zIndex:0,
        pointerEvents:'none'
      }} />

      <div style={{position:'relative',zIndex:1}} />
    </div>
  )
}

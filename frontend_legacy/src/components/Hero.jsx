import React from 'react'

export default function Hero(){
  return (
    <section className="mth-hero" style={{position:'relative',textAlign:'center',padding:'4rem 1rem'}}>
      <div className="mth-hero-bg" style={{position:'absolute',inset:0,opacity:0.18,backgroundSize:'cover',backgroundPosition:'center',backgroundImage:"url('/chart-bg.png')"}} />
      <div style={{position:'relative',zIndex:10}}>
        <h2 style={{fontSize:36,color:'#34d399',margin:0,fontWeight:800}}>JUST HOPE IN</h2>
        <p style={{marginTop:12,color:'#cbd5e1'}}>WE ALSO DON'T KNOW WHAT'S COMING</p>
      </div>
    </section>
  )
}

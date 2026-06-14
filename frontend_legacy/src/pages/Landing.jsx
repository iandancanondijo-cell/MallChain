import React, { useState, useEffect } from 'react'
import './landing.css'
import Home from './Home'
import Mallcoin from './Mallcoin'

// replaced with Mallcoin and Mallpoint images from project assets

export default function Landing(){
  const [menuOpen, setMenuOpen] = useState(false)

  const [view, setView] = useState('landing')

  useEffect(() => {
    // listen for navigation signal from side menu
    window.__landingNavigate = (v) => setView(v)
    return () => { window.__landingNavigate = undefined }
  }, [])

  if (view === 'home') return <Home />
  if (view === 'mallcoin') return <Mallcoin />

  return (
    <div className="scene" aria-hidden>
      <div className="glow-bg" />

      <div className="platform">
        <div className="ring" />
        <div className="ring inner" />

        <div className="coin">
          {/* coin remains empty (pure visual) */}
        </div>

        {/* hamburger button positioned at the top-left of the viewport */}
        <button
          type="button"
          className={`hamburger outer ${menuOpen ? 'open' : ''}`}
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(v => !v)}
        >
          <span />
          <span />
          <span />
        </button>

        {/* side menu + overlay (slides from left) */}
        <aside className={`side-menu ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen}>
          <nav>
            <ul>
              <li className="side-item">
                <button
                  className="w-full text-left"
                  onClick={() => {
                    setMenuOpen(false)
                    typeof window !== 'undefined' && window.requestAnimationFrame(() => {
                      ;(window.__landingNavigate = window.__landingNavigate || ((v) => {}))( 'home' )
                    })
                  }}
                >
                  Home
                </button>
              </li>
              <li className="side-item">Vault</li>
              <li className="side-item">Transactions</li>
              <li className="side-item">Login</li>

              {/* CTAs added below the menu items */}
              <li className="side-item cta"><button className="menu-cta">TASK to earn</button></li>
              <li className="side-item cta"><button className="menu-cta secondary" onClick={() => {
                setMenuOpen(false)
                if (typeof window !== 'undefined') {
                  // mark that this navigation came from the menu so the Mallcoin page
                  // can react (e.g., hide wallet section)
                  window.__landingNavFromMenu = true
                  window.requestAnimationFrame(() => {
                    ;(window.__landingNavigate = window.__landingNavigate || ((v) => {}))('mallcoin')
                  })
                }
              }}>Mallcoin</button></li>
            </ul>
          </nav>
        </aside>
        {menuOpen && <div className="menu-overlay" onClick={() => setMenuOpen(false)} />}

        {/* logos attached to outer ring */}
        <img src={'/Mallcoin.png'} alt="" className="logo react outer" />
        <img src={'/Mallpoint.png'} alt="" className="logo vite outer" />
      </div>

      {[...Array(12)].map((_, i) => (
        <span
          key={i}
          className="particle"
          style={{ '--randX': Math.random().toFixed(2), '--randY': Math.random().toFixed(2) }}
        />
      ))}
    </div>
  )
}

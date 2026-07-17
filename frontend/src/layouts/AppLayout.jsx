import { useEffect, useState, useMemo } from 'react'
import {
  Outlet,
  Link,
  useLocation
} from 'react-router-dom'

import { appConfig } from '../config/app'
import { useAuthStore } from '../core/store/authStore'
import { useChainHealth, startHealthPolling } from '../core/store/chainHealthStore'
import ThemeDrawer from '../components/ThemeDrawer'

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="4" rx="1.4" />
      <rect x="13.5" y="11" width="7" height="9.5" rx="1.4" />
      <rect x="3.5" y="14" width="7" height="6.5" rx="1.4" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M4 10h14" />
      <path d="M15.5 14.5h.01" />
      <path d="M18 10V7.5" />
    </svg>
  )
}

function TransactionsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h13" />
      <path d="M4 12h9" />
      <path d="M4 17h7" />
      <path d="M17 5v14l3-3" />
    </svg>
  )
}

function VoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5Z" />
      <path d="m8.5 12 2 2 4.5-5" />
      <path d="M5 19h14" />
    </svg>
  )
}

function StakingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4 7v5c0 4.5 3 7.8 8 9 5-1.2 8-4.5 8-9V7Z" />
      <path d="M12 8v8" />
      <path d="M8.5 10.5 12 8l3.5 2.5" />
    </svg>
  )
}

function ValidatorsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.3 2.7 7.4 7 10 4.3-2.6 7-5.7 7-10V6Z" />
      <path d="M9.5 11.5 12 14l3.5-3.5" />
      <path d="M12 8v6" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4.5 6v5.5C4.5 15.5 7.8 19 12 21c4.2-2 7.5-5.5 7.5-9.5V6Z" />
      <path d="M9.5 12 11 13.5 14.5 10" />
    </svg>
  )
}

function ExplorerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
      <path d="M11 8.5v5" />
      <path d="M8.5 11h5" />
    </svg>
  )
}

function MinesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-4 4 4 8 4-8-4-4Z" />
      <path d="M8 17l-3 3" />
      <path d="M16 17l3 3" />
      <path d="M12 15V7" />
    </svg>
  )
}

function LiquidityIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 16a4 4 0 0 1 0-8c1.4 0 2.7.7 3.5 1.8" />
      <path d="M17 8a4 4 0 0 1 0 8c-1.4 0-2.7-.7-3.5-1.8" />
      <path d="M10 12h4" />
    </svg>
  )
}

function EconomicsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
      <path d="M3 19h18" />
    </svg>
  )
}

const themePresets = [
  {
    id: 'midnight',
    label: 'Midnight',
    gradient: ['#020617', '#0f172a'],
    accent: '#22d3ee',
    accentStrong: '#06b6d4',
    background: '#020617',
    surface: 'rgba(15, 23, 42, 0.84)',
    surfaceStrong: 'rgba(15, 23, 42, 0.96)',
    border: 'rgba(34, 211, 238, 0.24)',
    text: '#f8fafc',
    muted: '#94a3b8',
    secondary: '#cbd5e1',
    glow: 'rgba(34, 211, 238, 0.26)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#020617', '#0f172a'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'crimson',
    label: 'Crimson',
    accent: '#DC143C',
    accentStrong: '#FF2400',
    background: '#14080b',
    surface: 'rgba(42, 9, 18, 0.84)',
    surfaceStrong: 'rgba(42, 9, 18, 0.96)',
    border: 'rgba(255, 36, 0, 0.24)',
    text: '#fff5f7',
    muted: '#f9a8d4',
    secondary: '#ffe4e6',
    glow: 'rgba(220, 20, 60, 0.26)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#14080b', '#2a0912'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'rose',
    label: 'Rose',
    accent: '#FF007F',
    accentStrong: '#E0115F',
    background: '#17050e',
    surface: 'rgba(51, 12, 30, 0.84)',
    surfaceStrong: 'rgba(51, 12, 30, 0.96)',
    border: 'rgba(255, 0, 127, 0.24)',
    text: '#fff1f7',
    muted: '#fbcfe8',
    secondary: '#ffe4f0',
    glow: 'rgba(255, 0, 127, 0.25)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#17050e', '#330c1e'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'amber',
    label: 'Amber',
    accent: '#FFBF00',
    accentStrong: '#F4C430',
    background: '#171107',
    surface: 'rgba(54, 36, 7, 0.84)',
    surfaceStrong: 'rgba(54, 36, 7, 0.96)',
    border: 'rgba(255, 191, 0, 0.24)',
    text: '#fff8e7',
    muted: '#fcd34d',
    secondary: '#fef3c7',
    glow: 'rgba(255, 191, 0, 0.24)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#171107', '#362407'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'emerald',
    label: 'Emerald',
    accent: '#50C878',
    accentStrong: '#00A86B',
    background: '#07130e',
    surface: 'rgba(7, 34, 23, 0.84)',
    surfaceStrong: 'rgba(7, 34, 23, 0.96)',
    border: 'rgba(80, 200, 120, 0.24)',
    text: '#f0fdf4',
    muted: '#bbf7d0',
    secondary: '#dcfce7',
    glow: 'rgba(80, 200, 120, 0.24)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#07130e', '#072217'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'azure',
    label: 'Azure',
    accent: '#007FFF',
    accentStrong: '#40E0D0',
    background: '#07131d',
    surface: 'rgba(8, 33, 52, 0.84)',
    surfaceStrong: 'rgba(8, 33, 52, 0.96)',
    border: 'rgba(0, 127, 255, 0.24)',
    text: '#f0f9ff',
    muted: '#bae6fd',
    secondary: '#e0f2fe',
    glow: 'rgba(0, 127, 255, 0.24)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#07131d', '#082134'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'violet',
    label: 'Violet',
    accent: '#8F00FF',
    accentStrong: '#C8A2C8',
    background: '#120c1d',
    surface: 'rgba(34, 20, 49, 0.84)',
    surfaceStrong: 'rgba(34, 20, 49, 0.96)',
    border: 'rgba(143, 0, 255, 0.24)',
    text: '#faf5ff',
    muted: '#e9d5ff',
    secondary: '#f5e8ff',
    glow: 'rgba(143, 0, 255, 0.24)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#120c1d', '#221431'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'terra',
    label: 'Terra',
    accent: '#E2725B',
    accentStrong: '#C04000',
    background: '#17100a',
    surface: 'rgba(53, 27, 12, 0.84)',
    surfaceStrong: 'rgba(53, 27, 12, 0.96)',
    border: 'rgba(226, 114, 91, 0.24)',
    text: '#fff7ed',
    muted: '#fdba74',
    secondary: '#ffedd5',
    glow: 'rgba(226, 114, 91, 0.24)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#17100a', '#351b0c'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'monochrome',
    label: 'Monochrome',
    accent: '#E5E4E2',
    accentStrong: '#0A0A0A',
    background: '#0a0a0a',
    surface: 'rgba(28, 28, 28, 0.84)',
    surfaceStrong: 'rgba(28, 28, 28, 0.96)',
    border: 'rgba(229, 228, 226, 0.24)',
    text: '#f7f7f5',
    muted: '#d4d4d8',
    secondary: '#f5f5f4',
    glow: 'rgba(229, 228, 226, 0.2)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#0a0a0a', '#1c1c1c'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'fuchsia',
    label: 'Fuchsia',
    accent: '#FF00FF',
    accentStrong: '#FF69B4',
    background: '#180813',
    surface: 'rgba(53, 13, 35, 0.84)',
    surfaceStrong: 'rgba(53, 13, 35, 0.96)',
    border: 'rgba(255, 0, 255, 0.24)',
    text: '#fff7ff',
    muted: '#f9a8d4',
    secondary: '#ffe4f3',
    glow: 'rgba(255, 0, 255, 0.24)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#180813', '#350d23'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'cyan',
    label: 'Cyan',
    accent: '#00FFFF',
    accentStrong: '#7DF9FF',
    background: '#07151b',
    surface: 'rgba(7, 32, 40, 0.84)',
    surfaceStrong: 'rgba(7, 32, 40, 0.96)',
    border: 'rgba(0, 255, 255, 0.24)',
    text: '#f0fdff',
    muted: '#a5f3fc',
    secondary: '#cffafe',
    glow: 'rgba(0, 255, 255, 0.24)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#07151b', '#072028'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'forest',
    label: 'Forest',
    accent: '#228B22',
    accentStrong: '#71BC78',
    background: '#07120a',
    surface: 'rgba(10, 33, 14, 0.84)',
    surfaceStrong: 'rgba(10, 33, 14, 0.96)',
    border: 'rgba(34, 139, 34, 0.24)',
    text: '#f2fdf2',
    muted: '#bbf7d0',
    secondary: '#dcfce7',
    glow: 'rgba(34, 139, 34, 0.24)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#07120a', '#0a210e'],
    intensity: 50,
    speed: 50,
  },
  {
    id: 'aurora',
    label: 'Aurora',
    accent: '#00d4aa',
    accentStrong: '#00ffcc',
    background: '#0a0f1a',
    surface: 'rgba(10, 15, 26, 0.84)',
    surfaceStrong: 'rgba(10, 15, 26, 0.96)',
    border: 'rgba(0, 212, 170, 0.24)',
    text: '#f0fdfa',
    muted: '#5eead4',
    secondary: '#ccfbf1',
    glow: 'rgba(0, 212, 170, 0.3)',
    animation: 'flow',
    gradientDirection: 'to-br',
    gradientStops: ['#00d4aa', '#00ffcc', '#7b68ee', '#a855f7'],
    intensity: 70,
    speed: 60,
  },
  {
    id: 'cosmic',
    label: 'Cosmic',
    accent: '#667eea',
    accentStrong: '#a855f7',
    background: '#050510',
    surface: 'rgba(5, 5, 16, 0.84)',
    surfaceStrong: 'rgba(5, 5, 16, 0.96)',
    border: 'rgba(102, 126, 234, 0.24)',
    text: '#f8fafc',
    muted: '#c4b5fd',
    secondary: '#e9d5ff',
    glow: 'rgba(102, 126, 234, 0.3)',
    animation: 'flow',
    gradientDirection: 'to-br',
    gradientStops: ['#667eea', '#764ba2', '#a855f7', '#d946ef'],
    intensity: 70,
    speed: 60,
  },
  {
    id: 'ember',
    label: 'Ember',
    accent: '#ff6b35',
    accentStrong: '#f97316',
    background: '#1a0500',
    surface: 'rgba(26, 5, 0, 0.84)',
    surfaceStrong: 'rgba(26, 5, 0, 0.96)',
    border: 'rgba(255, 107, 53, 0.24)',
    text: '#fff7ed',
    muted: '#fdba74',
    secondary: '#ffedd5',
    glow: 'rgba(255, 107, 53, 0.3)',
    animation: 'flow',
    gradientDirection: 'to-br',
    gradientStops: ['#ff6b35', '#f7931e', '#fdc830', '#ff0040'],
    intensity: 70,
    speed: 60,
  },
  {
    id: 'bifrost',
    label: 'Bifröst',
    accent: '#00ffff',
    accentStrong: '#06b6d4',
    background: '#0a0a1a',
    surface: 'rgba(10, 10, 26, 0.84)',
    surfaceStrong: 'rgba(10, 10, 26, 0.96)',
    border: 'rgba(0, 255, 255, 0.24)',
    text: '#f0fdff',
    muted: '#67e8f9',
    secondary: '#cffafe',
    glow: 'rgba(0, 255, 255, 0.3)',
    animation: 'flow',
    gradientDirection: 'to-br',
    gradientStops: ['#00ffff', '#7b68ee', '#ff00ff', '#00ff88', '#ffff00'],
    intensity: 80,
    speed: 70,
  },
  {
    id: 'void',
    label: 'Void',
    accent: '#ffffff',
    accentStrong: '#e5e5e5',
    background: '#000000',
    surface: 'rgba(10, 10, 10, 0.84)',
    surfaceStrong: 'rgba(10, 10, 10, 0.96)',
    border: 'rgba(255, 255, 255, 0.12)',
    text: '#ffffff',
    muted: '#737373',
    secondary: '#e5e5e5',
    glow: 'rgba(255, 255, 255, 0.15)',
    animation: 'pulse',
    gradientDirection: 'to-br',
    gradientStops: ['#ffffff', '#888888', '#333333', '#000000'],
    intensity: 50,
    speed: 40,
  },
  {
    id: 'plasma',
    label: 'Plasma',
    accent: '#ff00cc',
    accentStrong: '#d946ef',
    background: '#0d0015',
    surface: 'rgba(13, 0, 21, 0.84)',
    surfaceStrong: 'rgba(13, 0, 21, 0.96)',
    border: 'rgba(255, 0, 204, 0.24)',
    text: '#ffe4f5',
    muted: '#fda4fa',
    secondary: '#fce7f3',
    glow: 'rgba(255, 0, 204, 0.3)',
    animation: 'shimmer',
    gradientDirection: 'to-br',
    gradientStops: ['#ff00cc', '#ff3300', '#ffcc00', '#00ffcc'],
    intensity: 80,
    speed: 70,
  },
  {
    id: 'neon-pulse',
    label: 'Neon Pulse',
    accent: '#ff0080',
    accentStrong: '#ff3399',
    background: '#0a0a0a',
    surface: 'rgba(10, 10, 10, 0.84)',
    surfaceStrong: 'rgba(10, 10, 10, 0.96)',
    border: 'rgba(255, 0, 128, 0.24)',
    text: '#ffe4ec',
    muted: '#fda4af',
    secondary: '#fce7f3',
    glow: 'rgba(255, 0, 128, 0.35)',
    animation: 'pulse',
    gradientDirection: 'to-br',
    gradientStops: ['#ff0080', '#8000ff', '#00ffff', '#ff0080'],
    intensity: 80,
    speed: 60,
  },
  {
    id: 'cyber-glow',
    label: 'Cyber Glow',
    accent: '#00ff88',
    accentStrong: '#00cc6a',
    background: '#050510',
    surface: 'rgba(5, 5, 16, 0.84)',
    surfaceStrong: 'rgba(5, 5, 16, 0.96)',
    border: 'rgba(0, 255, 136, 0.24)',
    text: '#e8fdf5',
    muted: '#86efac',
    secondary: '#dcfce7',
    glow: 'rgba(0, 255, 136, 0.35)',
    animation: 'glow',
    gradientDirection: 'to-br',
    gradientStops: ['#00ff88', '#0088ff', '#8800ff', '#00ff88'],
    intensity: 80,
    speed: 60,
  },
  {
    id: 'golden-hour',
    label: 'Golden Hour',
    accent: '#ffd700',
    accentStrong: '#ffcc00',
    background: '#1a1005',
    surface: 'rgba(26, 16, 5, 0.84)',
    surfaceStrong: 'rgba(26, 16, 5, 0.96)',
    border: 'rgba(255, 215, 0, 0.24)',
    text: '#fffef0',
    muted: '#fde047',
    secondary: '#fef9c3',
    glow: 'rgba(255, 215, 0, 0.3)',
    animation: 'shimmer',
    gradientDirection: 'to-br',
    gradientStops: ['#ffd700', '#ff8800', '#ff4400', '#ffd700'],
    intensity: 70,
    speed: 50,
  },
  {
    id: 'northern-lights',
    label: 'Northern Lights',
    accent: '#00ffaa',
    accentStrong: '#00cc88',
    background: '#001a1a',
    surface: 'rgba(0, 26, 26, 0.84)',
    surfaceStrong: 'rgba(0, 26, 26, 0.96)',
    border: 'rgba(0, 255, 170, 0.24)',
    text: '#e8fdf5',
    muted: '#99f6e4',
    secondary: '#ccfbf1',
    glow: 'rgba(0, 255, 170, 0.3)',
    animation: 'flow',
    gradientDirection: 'to-br',
    gradientStops: ['#00ffaa', '#00aaff', '#aa00ff', '#ff00aa', '#00ffaa'],
    intensity: 80,
    speed: 70,
  },
  {
    id: 'sepia',
    label: 'Sepia',
    accent: '#d4a574',
    accentStrong: '#c49564',
    background: '#1a1610',
    surface: 'rgba(26, 22, 16, 0.84)',
    surfaceStrong: 'rgba(26, 22, 16, 0.96)',
    border: 'rgba(212, 165, 116, 0.2)',
    text: '#fdf8f3',
    muted: '#d6c4b0',
    secondary: '#f5f0e8',
    glow: 'rgba(212, 165, 116, 0.15)',
    animation: 'none',
    gradientDirection: 'to-br',
    gradientStops: ['#d4a574', '#c49564', '#b48554', '#a47544'],
    intensity: 50,
    speed: 50,
  },
]

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 4-5-4-5" />
      <path d="M20 12H9" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5h16" />
      <path d="M4 12h16" />
      <path d="M4 17.5h10" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.5 9.5 5 5" />
      <path d="m14.5 9.5-5 5" />
    </svg>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const token = useAuthStore((state) => state.token)
  const logout = useAuthStore((state) => state.logout)
  const { chainStatus, healthState } = useChainHealth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showGlow, setShowGlow] = useState(true)
  const [showNoise, setShowNoise] = useState(true)
  const [walletCount, setWalletCount] = useState(0)
  const [walletCountLoading, setWalletCountLoading] = useState(true)
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return themePresets[0]
    try {
      const stored = window.localStorage.getItem('mallchain-theme')
      return stored ? JSON.parse(stored) : themePresets[0]
    } catch {
      return themePresets[0]
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    root.style.setProperty('--app-bg', theme.background)
    root.style.setProperty('--app-surface', theme.surface)
    root.style.setProperty('--app-surface-strong', theme.surfaceStrong)
    root.style.setProperty('--app-border', theme.border)
    root.style.setProperty('--app-text', theme.text)
    root.style.setProperty('--app-muted', theme.muted)
    root.style.setProperty('--app-secondary', theme.secondary)
    root.style.setProperty('--app-accent', theme.accent)
    root.style.setProperty('--app-accent-strong', theme.accentStrong)
    root.style.setProperty('--app-glow', theme.glow)
    root.style.setProperty('--app-background-image', theme.image ? `url("${theme.image}")` : 'none')
    root.style.setProperty('--app-glow-visibility', showGlow ? '1' : '0')
    root.style.setProperty('--app-noise-visibility', showNoise ? '1' : '0')
    root.style.setProperty('--app-border-radius', theme.borderRadius ? `${theme.borderRadius}px` : '12px')
    root.style.setProperty('--app-animation-speed', theme.speed ? theme.speed / 50 : '1')
    root.style.setProperty('--app-animation-intensity', theme.intensity ? theme.intensity / 50 : '1')
    root.style.setProperty('--app-glow-intensity', theme.intensity ? theme.intensity / 100 : '0.5')
    // Set animation data attributes for CSS selectors
    document.body.dataset.glow = showGlow && theme.animation && theme.animation !== 'none' ? 'true' : 'false'
    document.body.dataset.flow = theme.animation === 'flow' ? 'true' : 'false'
    document.body.dataset.radial = theme.animation === 'pulse' ? 'true' : 'false'
    window.localStorage.setItem('mallchain-theme', JSON.stringify({ ...theme, showGlow, showNoise }))
  }, [theme, showGlow, showNoise])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    window.requestAnimationFrame(() => setSidebarOpen(false))
  }, [location.pathname])

  // Handle auth token from URL (e.g. from mines redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      // Clean URL to remove token
      window.history.replaceState({}, document.title, window.location.pathname)
      // Store token and fetch user using mines profile endpoint
      fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:4000'}/api/mines/profile/me`, {
        headers: { Authorization: `Bearer ${urlToken}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data?.ok && data?.data) {
            useAuthStore.getState().login({ token: urlToken, user: data.data })
          }
        })
        .catch(() => {})
    }
  }, [])

  // Health polling is now shared via chainHealthStore — one interval for the whole app.
  useEffect(() => startHealthPolling(), [])

  // Fetch wallet count when on wallet page
  useEffect(() => {
    if (!location.pathname.startsWith('/wallet')) {
      setWalletCount(0)
      setWalletCountLoading(false)
      return
    }
    let cancelled = false
    setWalletCountLoading(true)
    const fetchWalletCount = async () => {
      try {
        const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
        const response = await fetch(`${base}/api/economy/state`, { timeout: 8000 })
        if (!cancelled && response.ok) {
          const data = await response.json()
          if (data?.wallets) {
            const nonNullWallets = Object.values(data.wallets).filter(v => v != null).length
            setWalletCount(nonNullWallets)
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setWalletCountLoading(false)
      }
    }
    fetchWalletCount()
    const interval = setInterval(fetchWalletCount, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [location.pathname])

useEffect(() => {
    const handleMessage = (event) => {
      // Respond to auth:request from any child window we opened (e.g. Mines tab).
      // We validate the origin against the known mines URL to prevent phishing.
      const minesOrigin = new URL(import.meta.env.VITE_MINES_URL || 'http://localhost:5176').origin
      if (event.origin !== minesOrigin) return
      if (event.data?.type !== 'auth:request') return

      const authStore = useAuthStore.getState ? useAuthStore.getState() : null
      const currentToken = authStore?.token
      const currentUser = authStore?.user
      if (currentToken && event.source) {
        try {
          event.source.postMessage(
            { type: 'auth:share', payload: { token: currentToken, user: currentUser } },
            event.origin,
          )
        } catch {
          // cross-origin postMessage can throw if the window was closed
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const statusTone = {
    live: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]',
    retrying: 'bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]',
    down: 'bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.15)]',
    loading: 'bg-slate-500 shadow-[0_0_0_4px_rgba(148,163,184,0.15)]'
  }[healthState]

  const stateLabel = {
    live: 'Live',
    retrying: 'Retrying',
    down: 'Offline',
    loading: 'Checking'
  }[healthState]

  const networkBars = healthState === 'live' ? 5 : healthState === 'retrying' ? 3 : 1

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = () => {
      setTheme((current) => ({ ...current, image: reader.result }))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const walletLinks = useMemo(() => [
    { name: 'Overview', path: '/wallet', exact: true, icon: <WalletIcon /> },
    { name: 'Transactions', path: '/wallet/transactions', icon: <TransactionsIcon /> },
  ], [])

  const governanceLinks = useMemo(() => [
    { name: 'Proposals', path: '/governance', exact: false, icon: <VoteIcon /> },
  ], [])

  const stakingLinks = useMemo(() => [
    { name: 'Dashboard', path: '/staking', exact: true, icon: <StakingIcon /> },
    { name: 'Validators', path: '/staking/validators', icon: <ValidatorsIcon /> },
    { name: 'Validator Center', path: '/validator-center', icon: <ShieldIcon /> },
    { name: 'My Validator Center', path: '/my-validator-center', icon: <ShieldIcon /> },
  ], [])

  const minesBaseUrl = import.meta.env.VITE_MINES_URL || 'http://localhost:5176'
  const minesLinks = useMemo(() => [
    {
      name: 'Mines',
      path: token ? `${minesBaseUrl}?token=${encodeURIComponent(token)}` : minesBaseUrl,
      external: true,
      allowOpener: true,
      icon: <MinesIcon />,
    },
  ], [minesBaseUrl, token])

  const links = useMemo(() => [
    { name: 'Explorer', path: '/explorer', icon: <ExplorerIcon /> },
    { name: 'Liquidity', path: '/liquidity', icon: <LiquidityIcon /> },
    { name: 'Economics', path: '/economics', icon: <EconomicsIcon /> },
  ], [])

  const isSubLinkActive = (path, exact) => {
    if (exact) {
      return location.pathname === path || location.pathname === `${path}/`
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const renderSubNav = (title, items) => (
    <div>
      <p className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: theme.muted }}>
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {items.map((link) => {
          const active = link.external ? false : isSubLinkActive(link.path, link.exact)
          if (link.external) {
             const rel = link.allowOpener ? '' : 'noopener noreferrer'
            return (
              <a
                key={link.path}
                href={link.path}
                target="_blank"
                rel={rel}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all ${
                  active
                    ? 'text-white'
                    : 'hover:text-white'
                }`}
                style={active ? {
                  backgroundColor: theme.accent,
                  boxShadow: `0 16px 32px ${theme.glow}`,
                } : {
                  color: theme.secondary,
                }}
              >
                {link.icon}
                {link.name}
              </a>
            )
          }
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all ${
                active
                  ? 'text-white'
                  : 'hover:text-white'
              }`}
              style={active ? {
                backgroundColor: theme.accent,
                boxShadow: `0 16px 32px ${theme.glow}`,
              } : {
                color: theme.secondary,
              }}
            >
              {link.icon}
              {link.name}
            </Link>
          )
        })}
      </div>
    </div>
  )

  const sidebarContent = (
    <>
      <div>
        <h1 className="text-3xl font-bold" style={{ color: theme.text }}>
          {appConfig.name}
        </h1>
        <p className="mt-2" style={{ color: theme.muted }}>
          {appConfig.networkLabel}
        </p>
      </div>

      <nav className="mt-10 flex flex-col gap-3">
        <Link
          to="/dashboard"
          className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all"
          style={location.pathname === '/dashboard' ? {
            backgroundColor: theme.accent,
            boxShadow: `0 16px 32px ${theme.glow}`,
            color: theme.text,
          } : {
            color: theme.secondary,
          }}
        >
          <DashboardIcon />
          Dashboard
        </Link>

        {renderSubNav('Wallet', walletLinks)}
        {renderSubNav('Governance', governanceLinks)}
        {renderSubNav('Staking', stakingLinks)}
        {renderSubNav('Mines', minesLinks)}

        {links.filter((link) => link.path !== '/dashboard').map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all"
            style={location.pathname === link.path || location.pathname.startsWith(`${link.path}/`) ? {
              backgroundColor: theme.accent,
              boxShadow: `0 16px 32px ${theme.glow}`,
              color: theme.text,
            } : {
              color: theme.secondary,
            }}
          >
            {link.icon}
            {link.name}
          </Link>
        ))}
      </nav>
    </>
  )

  return (
    <div className="flex min-h-screen app-shell" style={{ backgroundColor: theme.background, color: theme.text }}>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:flex-shrink-0 lg:border-r lg:bg-slate-900/60 lg:backdrop-blur-xl lg:p-6 lg:fixed lg:top-0 lg:left-0 lg:h-screen lg:z-40"
        style={{ borderColor: theme.border, backgroundColor: theme.surfaceStrong }}>
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r p-6 overflow-y-auto transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ borderColor: theme.border, backgroundColor: theme.surfaceStrong }}
        aria-label="Navigation sidebar"
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">{appConfig.name}</h1>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl hover:bg-slate-800"
            aria-label="Close navigation"
          >
            <CloseIcon />
          </button>
        </div>
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:ml-72">

        <header className="fixed top-0 left-0 lg:left-72 right-0 z-50 h-12 lg:h-14 border-b backdrop-blur-xl px-4 lg:px-6 flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC` }}>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl hover:bg-slate-800"
            aria-label="Open navigation"
          >
            <MenuIcon />
          </button>

          <div className="hidden sm:block">
            <h2 className="text-lg lg:text-2xl font-semibold truncate">
              {appConfig.networkLabel} · {appConfig.chain.id}
            </h2>
          </div>

          <div className="flex items-center gap-2 lg:gap-4 ml-auto">

            <div className="hidden md:flex items-center gap-3 rounded-2xl border px-3 lg:px-4 py-2 text-sm"
              style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC`, color: theme.secondary }}>
              <span style={{ color: theme.muted }}>Block</span>
              <strong style={{ color: theme.text }}>#{chainStatus?.latestHeight || '—'}</strong>
            </div>

            {location.pathname.startsWith('/wallet') && (
              <div className="flex items-center gap-3 rounded-2xl border px-3 lg:px-4 py-2 text-sm"
                style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC`, color: theme.secondary }}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                  <path d="M4 10h14" />
                  <path d="M15.5 14.5h.01" />
                  <path d="M18 10V7.5" />
                </svg>
                <span style={{ color: theme.text }}>{walletCountLoading ? '—' : walletCount.toLocaleString()}</span>
                <span style={{ color: theme.muted }}>wallets</span>
              </div>
            )}

            <div className="flex items-center gap-2 lg:gap-3 rounded-2xl border px-3 lg:px-4 py-2 text-sm"
              style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC`, color: theme.secondary }}>
              <span className={`h-2.5 w-2.5 rounded-full ${statusTone}`} />
              <span className="hidden sm:inline">{stateLabel}</span>
            </div>

            <div className="hidden sm:flex items-center gap-1 rounded-2xl border px-3 py-2" aria-label="Network speed bars"
              style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC` }}>
              {Array.from({ length: 5 }, (_, index) => (
                <span
                  key={index}
                  className={`h-4 w-1.5 rounded-full ${index < networkBars ? 'bg-emerald-400' : 'bg-slate-700'}`}
                />
              ))}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setDrawerOpen((value) => !value)}
                className="flex h-7 w-7 items-center justify-center rounded-full border transition-all"
                aria-label="Open theme picker"
                title="Theme"
                style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC`, boxShadow: `0 0 0 1px ${theme.border}` }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentStrong})` }} />
              </button>

              <ThemeDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                theme={theme}
                setTheme={setTheme}
                showGlow={showGlow}
                setShowGlow={setShowGlow}
                showNoise={showNoise}
                setShowNoise={setShowNoise}
                handleImageUpload={handleImageUpload}
                themePresets={themePresets}
              />
            </div>

            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-xl transition-colors"
              aria-label="Logout"
              title="Logout"
              style={{ color: theme.muted }}
            >
              <LogoutIcon />
            </button>

          </div>

        </header>

        <main className="flex-1 pt-12 lg:pt-14 p-4 lg:p-8 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>

      </div>

    </div>
  )
}

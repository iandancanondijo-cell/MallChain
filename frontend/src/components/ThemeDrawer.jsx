import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Extended theme presets with gradients and animations
const THEME_PRESETS = [
  // Classic solid themes
  {
    id: 'midnight',
    label: 'Midnight',
    category: 'classic',
    gradient: ['#020617', '#0f172a'],
    accent: '#22d3ee',
    accentStrong: '#06b6d4',
    glow: '#22d3ee',
    animation: 'none',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    category: 'classic',
    gradient: ['#0c1e2a', '#112240'],
    accent: '#14b8a6',
    accentStrong: '#0d9488',
    glow: '#14b8a6',
    animation: 'none',
  },
  {
    id: 'forest',
    label: 'Forest',
    category: 'classic',
    gradient: ['#0f1d13', '#16261b'],
    accent: '#84cc16',
    accentStrong: '#65a30d',
    glow: '#84cc16',
    animation: 'none',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    category: 'classic',
    gradient: ['#1d120f', '#291b11'],
    accent: '#f97316',
    accentStrong: '#ea580c',
    glow: '#f97316',
    animation: 'none',
  },
  {
    id: 'rose',
    label: 'Rose',
    category: 'classic',
    gradient: ['#1c0a13', '#2d1420'],
    accent: '#f43f5e',
    accentStrong: '#e11d48',
    glow: '#f43f5e',
    animation: 'none',
  },
  {
    id: 'violet',
    label: 'Violet',
    category: 'classic',
    gradient: ['#160f29', '#1e1433'],
    accent: '#a855f7',
    accentStrong: '#9333ea',
    glow: '#a855f7',
    animation: 'none',
  },

  // Gradient themes
  {
    id: 'aurora',
    label: 'Aurora',
    category: 'gradient',
    gradient: ['#0a0f1a', '#1a0a2e', '#0f1a2e'],
    accent: '#00ffc8',
    accentStrong: '#00d4aa',
    glow: '#00ffc8',
    gradientStops: ['#00d4aa', '#00ffc8', '#7b68ee', '#a855f7'],
    animation: 'flow',
  },
  {
    id: 'cosmic',
    label: 'Cosmic',
    category: 'gradient',
    gradient: ['#050510', '#1a0a2e', '#16213e'],
    accent: '#bf94ff',
    accentStrong: '#a855f7',
    glow: '#bf94ff',
    gradientStops: ['#667eea', '#764ba2', '#a855f7', '#d946ef'],
    animation: 'flow',
  },
  {
    id: 'ember',
    label: 'Ember',
    category: 'gradient',
    gradient: ['#1a0500', '#2d120a', '#3d1a0f'],
    accent: '#ff6b35',
    accentStrong: '#f97316',
    glow: '#ff6b35',
    gradientStops: ['#ff6b35', '#f7931e', '#fdc830', '#ff0040'],
    animation: 'flow',
  },
  {
    id: 'bifrost',
    label: 'Bifröst',
    category: 'gradient',
    gradient: ['#0a0a1a', '#1a0a2e', '#0f1a2e'],
    accent: '#00ffff',
    accentStrong: '#06b6d4',
    glow: '#00ffff',
    gradientStops: ['#00ffff', '#7b68ee', '#ff00ff', '#00ff88', '#ffff00'],
    animation: 'flow',
  },
  {
    id: 'void',
    label: 'Void',
    category: 'gradient',
    gradient: ['#000000', '#0a0a0a', '#1a1a1a'],
    accent: '#ffffff',
    accentStrong: '#e5e5e5',
    glow: '#ffffff',
    gradientStops: ['#ffffff', '#888888', '#333333', '#000000'],
    animation: 'pulse',
  },
  {
    id: 'plasma',
    label: 'Plasma',
    category: 'gradient',
    gradient: ['#0d0015', '#1a0033', '#2d004d'],
    accent: '#ff00cc',
    accentStrong: '#d946ef',
    glow: '#ff00cc',
    gradientStops: ['#ff00cc', '#ff3300', '#ffcc00', '#00ffcc'],
    animation: 'shimmer',
  },

  // Animated themes
  {
    id: 'neon-pulse',
    label: 'Neon Pulse',
    category: 'animated',
    gradient: ['#0a0a0a', '#1a001a', '#0a0a1a'],
    accent: '#ff0080',
    accentStrong: '#ff3399',
    glow: '#ff0080',
    gradientStops: ['#ff0080', '#8000ff', '#00ffff', '#ff0080'],
    animation: 'pulse',
  },
  {
    id: 'cyber-glow',
    label: 'Cyber Glow',
    category: 'animated',
    gradient: ['#050510', '#0a0a2a', '#051020'],
    accent: '#00ff88',
    accentStrong: '#00cc6a',
    glow: '#00ff88',
    gradientStops: ['#00ff88', '#0088ff', '#8800ff', '#00ff88'],
    animation: 'glow',
  },
  {
    id: 'golden-hour',
    label: 'Golden Hour',
    category: 'animated',
    gradient: ['#1a1005', '#2a1a0a', '#1a2a05'],
    accent: '#ffd700',
    accentStrong: '#ffcc00',
    glow: '#ffd700',
    gradientStops: ['#ffd700', '#ff8800', '#ff4400', '#ffd700'],
    animation: 'shimmer',
  },
  {
    id: 'northern-lights',
    label: 'Northern Lights',
    category: 'animated',
    gradient: ['#001a1a', '#001a2a', '#0a1a1a'],
    accent: '#00ffaa',
    accentStrong: '#00cc88',
    glow: '#00ffaa',
    gradientStops: ['#00ffaa', '#00aaff', '#aa00ff', '#ff00aa', '#00ffaa'],
    animation: 'flow',
  },

  // Monochrome/Minimal
  {
    id: 'monochrome',
    label: 'Monochrome',
    category: 'minimal',
    gradient: ['#0a0a0a', '#1a1a1a', '#0a0a0a'],
    accent: '#ffffff',
    accentStrong: '#cccccc',
    glow: '#ffffff',
    gradientStops: ['#ffffff', '#999999', '#555555', '#111111'],
    animation: 'none',
  },
  {
    id: 'sepia',
    label: 'Sepia',
    category: 'minimal',
    gradient: ['#1a1610', '#2a221a', '#1a2a1a'],
    accent: '#d4a574',
    accentStrong: '#c49564',
    glow: '#d4a574',
    gradientStops: ['#d4a574', '#c49564', '#b48554', '#a47544'],
    animation: 'none',
  },

  // Theme 1: Pastel & Soft Tones
  {
    id: 'pastel-soft',
    label: 'Pastel & Soft Tones',
    category: 'gradient',
    gradient: ['#FFF0F5', '#E6F3FF', '#FFF8E1'],
    accent: '#FFB6C1',
    accentStrong: '#FFDAB9',
    glow: '#FFB6C1',
    gradientStops: ['#FFB6C1', '#FFDAB9', '#FFFACD', '#98FB98', '#E0FFFF', '#E6E6FA', '#CCCCFF'],
    animation: 'flow',
  },

  // Theme 2: Earthy & Organic
  {
    id: 'earthy-organic',
    label: 'Earthy & Organic',
    category: 'gradient',
    gradient: ['#2D2D2D', '#3D3D3D', '#4D4D4D'],
    accent: '#E2725B',
    accentStrong: '#9C9F84',
    glow: '#E2725B',
    gradientStops: ['#E2725B', '#9C9F84', '#224326', '#B87333', '#E6D7B8', '#E1AD01', '#708090'],
    animation: 'flow',
  },

  // Theme 3: Oceanic & Coastal
  {
    id: 'oceanic-coastal',
    label: 'Oceanic & Coastal',
    category: 'gradient',
    gradient: ['#001a33', '#002b33', '#1a3a4a'],
    accent: '#008080',
    accentStrong: '#9FE2BF',
    glow: '#008080',
    gradientStops: ['#000080', '#9FE2BF', '#008080', '#7FFFD4', '#FF7F50', '#F5F5DC', '#4682B4'],
    animation: 'flow',
  },

  // Theme 4: Neon & Cyberpunk
  {
    id: 'neon-cyberpunk',
    label: 'Neon & Cyberpunk',
    category: 'gradient',
    gradient: ['#0B0B1E', '#1A0A2E', '#0F1A2E'],
    accent: '#FF007F',
    accentStrong: '#00F3FF',
    glow: '#FF007F',
    gradientStops: ['#FF007F', '#00F3FF', '#CCFF00', '#9D00FF', '#FF5500', '#0B0B1E', '#CEFF00'],
    animation: 'pulse',
  },

  // Theme 5: Luxury & Jewel Tones
  {
    id: 'luxury-jewel',
    label: 'Luxury & Jewel Tones',
    category: 'gradient',
    gradient: ['#0A0A0A', '#1A0A1A', '#0A1A1A'],
    accent: '#50C878',
    accentStrong: '#9B111E',
    glow: '#50C878',
    gradientStops: ['#50C878', '#9B111E', '#0F52BA', '#9966CC', '#E5A93B', '#1A1A1A', '#F7E7CE'],
    animation: 'shimmer',
  },

  // Theme 6: Autumnal Warmth
  {
    id: 'autumnal-warmth',
    label: 'Autumnal Warmth',
    category: 'gradient',
    gradient: ['#1A1005', '#2A1A0A', '#1A2A05'],
    accent: '#E97451',
    accentStrong: '#FFBF00',
    glow: '#E97451',
    gradientStops: ['#E97451', '#FFBF00', '#9E1B32', '#6B8E23', '#B87333', '#FFFDD0', '#36454F'],
    animation: 'flow',
  },

  // Theme 7: Corporate & Corporate Tech
  {
    id: 'corporate-tech',
    label: 'Corporate & Tech',
    category: 'classic',
    gradient: ['#0F172A', '#1E293B', '#334155'],
    accent: '#4682B4',
    accentStrong: '#1B365D',
    glow: '#4682B4',
    gradientStops: ['#4682B4', '#4A4A4A', '#F4F6F9', '#1B365D', '#FF6600', '#E5E5E5', '#00A896'],
    animation: 'none',
  },

  // Theme 8: Retro & Vintage
  {
    id: 'retro-vintage',
    label: 'Retro & Vintage',
    category: 'gradient',
    gradient: ['#1A1610', '#2A221A', '#1A2A1A'],
    accent: '#568203',
    accentStrong: '#FFDB58',
    glow: '#568203',
    gradientStops: ['#568203', '#FFDB58', '#CC5500', '#004C54', '#DCAE1D', '#F5E6CC', '#704214'],
    animation: 'shimmer',
  },

  // Theme 9: Scandinavian & Minimalist
  {
    id: 'scandinavian-minimalist',
    label: 'Scandinavian & Minimalist',
    category: 'minimal',
    gradient: ['#FBFCFC', '#E5E8E8', '#D5D8DC'],
    accent: '#D4E6F1',
    accentStrong: '#212F3D',
    glow: '#D4E6F1',
    gradientStops: ['#D4E6F1', '#D5D8DC', '#212F3D', '#FBFCFC', '#D35400', '#E5E8E8', '#2E4053'],
    animation: 'none',
  },

  // Theme 10: Vaporwave & Sunset Synth
  {
    id: 'vaporwave-sunset',
    label: 'Vaporwave & Sunset Synth',
    category: 'gradient',
    gradient: ['#191970', '#4B0082', '#000080'],
    accent: '#DA70D6',
    accentStrong: '#FF69B4',
    glow: '#DA70D6',
    gradientStops: ['#DA70D6', '#FF69B4', '#FF7F50', '#4B0082', '#191970', '#00FFFF', '#FFDAB9'],
    animation: 'flow',
  },
]

const ANIMATION_OPTIONS = [
  { id: 'none', label: 'Static', description: 'No animation' },
  { id: 'pulse', label: 'Pulse', description: 'Gentle breathing glow' },
  { id: 'glow', label: 'Glow', description: 'Continuous soft glow' },
  { id: 'shimmer', label: 'Shimmer', description: 'Light sweeps across' },
  { id: 'flow', label: 'Flow', description: 'Colors flow like aurora' },
  { id: 'particles', label: 'Particles', description: 'Floating light particles' },
]

const GRADIENT_DIRECTIONS = [
  { id: 'to-r', label: '→ Right', degrees: '90deg' },
  { id: 'to-br', label: '↘ Bottom-Right', degrees: '135deg' },
  { id: 'to-b', label: '↓ Down', degrees: '180deg' },
  { id: 'to-bl', label: '↙ Bottom-Left', degrees: '225deg' },
  { id: 'to-l', label: '← Left', degrees: '270deg' },
  { id: 'to-tl', label: '↖ Top-Left', degrees: '315deg' },
  { id: 'to-t', label: '↑ Up', degrees: '0deg' },
  { id: 'to-tr', label: '↗ Top-Right', degrees: '45deg' },
]

function ThemeDrawer({
  isOpen,
  onClose,
  theme,
  setTheme,
  showGlow,
  setShowGlow,
  showNoise,
  setShowNoise,
  handleImageUpload,
  themePresets,
}) {
  // All hooks must be called unconditionally at the top
  const drawerRef = useRef(null)
  const [activeTab, setActiveTab] = useState('presets')
  const [customColors, setCustomColors] = useState({
    primary: theme.accent || '#22d3ee',
    secondary: theme.accentStrong || '#06b6d4',
    background: theme.background || '#020617',
    surface: theme.surface || '#0f172a',
  })
  const [selectedAnimation, setSelectedAnimation] = useState(theme.animation || 'none')
  const [gradientDirection, setGradientDirection] = useState(theme.gradientDirection || 'to-br')
  const [gradientStops, setGradientStops] = useState(theme.gradientStops || [])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [intensity, setIntensity] = useState(theme.intensity || 50)
const [speed, setSpeed] = useState(theme.speed || 50)

   // Animation style helper
   const getAnimationStyle = useMemo(() => {
     return (animationType) => {
       const baseStyle = {}
       
       // Animation duration based on speed (10-200% -> 0.1s to 2s)
       const duration = Math.max(0.1, Math.min(2, speed / 100 * 2))
       
       switch (animationType) {
         case 'pulse':
           return {
             ...baseStyle,
             animationName: 'pulse',
             animationDuration: `${duration}s`,
             animationTimingFunction: 'ease-in-out',
             animationIterationCount: 'infinite'
           }
         case 'glow':
           return {
             ...baseStyle,
             animationName: 'glow',
             animationDuration: `${duration}s`,
             animationTimingFunction: 'ease-in-out',
             animationIterationCount: 'infinite'
           }
         case 'shimmer':
           return {
             ...baseStyle,
             animationName: 'shimmer',
             animationDuration: `${duration}s`,
             animationTimingFunction: 'linear',
             animationIterationCount: 'infinite'
           }
         case 'flow':
           return {
             ...baseStyle,
             animationName: 'flow',
             animationDuration: `${duration}s`,
             animationTimingFunction: 'ease-in-out',
             animationIterationCount: 'infinite'
           }
         case 'particles':
         case 'none':
         default:
           return baseStyle
       }
     }
   }, [speed])

   // Keyframes for animations - defined in a style tag in JSX
   // Pulse: subtle opacity pulse (0.8 -> 1.0 -> 0.8)
   // Glow: pulsing outer glow (shadow intensity)
   // Shimmer: moving highlight across gradient
   // Flow: slow color shift in gradient

   // Click outside to close - always register, but only act when isOpen
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && drawerRef.current && !drawerRef.current.contains(event.target)) {
        onClose()
      }
    }

    const handleKeyDown = (event) => {
      if (isOpen && event.key === 'Escape') onClose()
    }

    if (isOpen) {
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleKeyDown)
      }, 0)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Position near trigger button - always compute
  const position = useMemo(() => {
    const triggerButton = document.querySelector('[aria-label="Open theme picker"]')
    if (triggerButton) {
      const rect = triggerButton.getBoundingClientRect()
      return {
        top: `${rect.bottom + 8}px`,
        right: `${window.innerWidth - rect.right}px`,
        left: 'auto',
      }
    }
    return { top: '5rem', right: '1rem', left: 'auto' }
  }, [isOpen])

  // Live preview style - always compute
  const previewStyle = useMemo(() => ({
    width: '100%',
    height: '60px',
    borderRadius: '16px',
    border: `1px solid ${theme.border}`,
    background: gradientStops.length > 1
      ? `linear-gradient(${GRADIENT_DIRECTIONS.find(d => d.id === gradientDirection)?.degrees || '135deg'}, ${gradientStops.join(', ')})`
      : `linear-gradient(135deg, ${theme.gradient?.[0] || theme.background}, ${theme.gradient?.[1] || theme.surface})`,
    position: 'relative',
    overflow: 'hidden',
  }), [theme, gradientStops, gradientDirection])

  // Render null early if not open - but AFTER all hooks
  if (!isOpen) return null

  const drawerContent = (
    <div
      ref={drawerRef}
      className="w-80 rounded-3xl border p-4 shadow-2xl backdrop-blur-2xl"
      style={{
        borderColor: theme.border,
        backgroundColor: theme.surfaceStrong,
        position: 'fixed',
        ...position,
        zIndex: 99999,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}
    >
      {/* Animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 5px rgba(0, 255, 255, 0.5); }
          50% { box-shadow: 0 0 20px rgba(0, 255, 255, 0.8); }
        }
        @keyframes shimmer {
          0% { background-position: -500% 0; }
          100% { background-position: 500% 0; }
        }
        @keyframes flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold" style={{ color: theme.text }}>Palette</p>
          <p className="text-xs" style={{ color: theme.muted }}>Customize your wallet</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-2 py-1 text-xs transition-colors"
          style={{ color: theme.muted, backgroundColor: `${theme.surface}CC` }}
        >
          Close
        </button>
      </div>

{/* Live Preview */}
       <div className="mb-4 rounded-2xl border overflow-hidden" style={{ borderColor: theme.border }}>
         <div style={{ ...previewStyle, ...getAnimationStyle(selectedAnimation) }}>
           {selectedAnimation === 'particles' && (
             <ParticleEffect color={theme.accent} count={15} />
           )}
         </div>
         <p className="text-xs mt-1 text-center" style={{ color: theme.muted }}>Live preview</p>
       </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border p-1" style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC` }}>
        {['presets', 'custom', 'effects', 'advanced'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === tab ? 'shadow-sm' : ''}`}
            style={{
              color: activeTab === tab ? theme.text : theme.muted,
              backgroundColor: activeTab === tab ? `${theme.accent}30` : 'transparent',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Presets Tab */}
      {activeTab === 'presets' && (
        <div className="space-y-4">
          {['classic', 'gradient', 'animated', 'minimal'].map((category) => (
            <div key={category}>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: theme.muted }}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {THEME_PRESETS.filter(p => p.category === category).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all ${theme.id === preset.id ? 'scale-[1.02]' : ''}`}
                    style={{
                      borderColor: theme.id === preset.id ? preset.accent : theme.border,
                      backgroundColor: theme.id === preset.id ? `${preset.accent}20` : `${theme.surface}CC`,
                      color: theme.text,
                    }}
                  >
                    <div className="w-full h-8 rounded-xl" style={{
                      background: preset.gradientStops
                        ? `linear-gradient(135deg, ${preset.gradientStops.join(', ')})`
                        : `linear-gradient(135deg, ${preset.gradient?.join(', ') || preset.gradient})`,
                    }} />
                    <span className="text-xs font-medium">{preset.label}</span>
                    {preset.animation !== 'none' && (
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{
                        backgroundColor: `${preset.accent}30`,
                        color: preset.accent,
                      }}>
                        {preset.animation.toUpperCase()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom Colors Tab */}
      {activeTab === 'custom' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ColorPicker
              label="Primary Accent"
              value={customColors.primary}
              onChange={(c) => setCustomColors(prev => ({ ...prev, primary: c }))}
              theme={theme}
            />
            <ColorPicker
              label="Secondary Accent"
              value={customColors.secondary}
              onChange={(c) => setCustomColors(prev => ({ ...prev, secondary: c }))}
              theme={theme}
            />
            <ColorPicker
              label="Background"
              value={customColors.background}
              onChange={(c) => setCustomColors(prev => ({ ...prev, background: c }))}
              theme={theme}
            />
            <ColorPicker
              label="Surface"
              value={customColors.surface}
              onChange={(c) => setCustomColors(prev => ({ ...prev, surface: c }))}
              theme={theme}
            />
          </div>

          <div className="rounded-xl border p-3" style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC` }}>
            <label className="flex items-center gap-2 mb-3" style={{ color: theme.text }}>
              <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
              <span className="text-sm">Show gradient stops</span>
            </label>

            {showAdvanced && (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: theme.muted }}>Gradient Stops (drag to reorder)</p>
                <div className="flex flex-wrap gap-2">
                  {gradientStops.map((stop, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={stop}
                        onChange={(e) => {
                          const newStops = [...gradientStops]
                          newStops[i] = e.target.value
                          setGradientStops(newStops)
                        }}
                        className="w-8 h-8 rounded border-0 cursor-pointer"
                      />
                      <span className="text-xs font-mono" style={{ color: theme.text }}>{stop}</span>
                      {gradientStops.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setGradientStops(gradientStops.filter((_, idx) => idx !== i))}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setGradientStops([...gradientStops, '#000000'])}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border"
                    style={{ borderColor: theme.border, color: theme.muted }}
                  >
                    + Add Stop
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs flex-1" style={{ color: theme.muted }}>Direction</label>
                  <select
                    value={gradientDirection}
                    onChange={(e) => setGradientDirection(e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs rounded-lg border"
                    style={{ borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }}
                  >
                    {GRADIENT_DIRECTIONS.map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={applyCustomTheme}
                className="flex-1 px-3 py-2 rounded-xl font-medium transition-all"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.background,
                }}
              >
                Apply Custom Theme
              </button>
              <button
                type="button"
                onClick={() => setCustomColors({
                  primary: '#22d3ee',
                  secondary: '#06b6d4',
                  background: '#020617',
                  surface: '#0f172a',
                })}
                className="px-3 py-2 rounded-xl text-sm border transition-colors"
                style={{ borderColor: theme.border, color: theme.muted }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Effects Tab */}
      {activeTab === 'effects' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ToggleCard
              label="Glow Effect"
              description="Subtle glow around elements"
              checked={showGlow}
              onChange={setShowGlow}
              theme={theme}
            />
            <ToggleCard
              label="Texture"
              description="Subtle noise/grain overlay"
              checked={showNoise}
              onChange={setShowNoise}
              theme={theme}
            />
            <ToggleCard
              label="Glass Morphism"
              description="Frosted glass panels"
              checked={theme.glassMorphism}
              onChange={(v) => setTheme(prev => ({ ...prev, glassMorphism: v }))}
              theme={theme}
            />
            <ToggleCard
              label="Particles"
              description="Floating ambient particles"
              checked={selectedAnimation === 'particles'}
              onChange={(v) => setSelectedAnimation(v ? 'particles' : 'none')}
              theme={theme}
            />
          </div>

          <div className="rounded-xl border p-3" style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC` }}>
            <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Animation Style</p>
            <div className="grid grid-cols-2 gap-2">
              {ANIMATION_OPTIONS.map((anim) => (
                <button
                  key={anim.id}
                  type="button"
                  onClick={() => setSelectedAnimation(anim.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${selectedAnimation === anim.id ? 'shadow-sm' : ''}`}
                  style={{
                    borderColor: selectedAnimation === anim.id ? theme.accent : theme.border,
                    backgroundColor: selectedAnimation === anim.id ? `${theme.accent}20` : `${theme.surface}CC`,
                    color: theme.text,
                  }}
                >
                  <div className="font-medium text-sm">{anim.label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: theme.muted }}>{anim.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Animation Controls */}
          {(selectedAnimation !== 'none') && (
            <div className="rounded-xl border p-3 space-y-4" style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC` }}>
              <p className="text-sm font-medium" style={{ color: theme.text }}>Animation Intensity</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                  className="flex-1 h-2 rounded-lg appearance-none"
                  style={{ background: theme.surface, accentColor: theme.accent }}
                />
                <span className="text-sm w-10 text-right" style={{ color: theme.text }}>{intensity}%</span>
              </div>

              <p className="text-sm font-medium" style={{ color: theme.text }}>Animation Speed</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="10"
                  max="200"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="flex-1 h-2 rounded-lg appearance-none"
                  style={{ background: theme.surface, accentColor: theme.accent }}
                />
                <span className="text-sm w-14 text-right" style={{ color: theme.text }}>{speed}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Tab */}
      {activeTab === 'advanced' && (
        <div className="space-y-4">
          <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC` }}>
            <p className="text-sm font-medium" style={{ color: theme.text }}>Background Image</p>
            <label className="flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm transition-colors"
              style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC`, color: theme.text }}>
              <span>Upload custom background</span>
              <span className="rounded-full px-2 py-1 text-xs" style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}>Image</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            {theme.image && (
              <div className="rounded-xl border p-2" style={{ borderColor: theme.border }}>
                <img src={theme.image} alt="Background preview" className="h-24 w-full rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setTheme((current) => ({ ...current, image: '' }))}
                  className="mt-2 w-full px-3 py-1.5 text-sm rounded-lg transition-colors"
                  style={{ backgroundColor: `${theme.accent}20`, color: theme.text }}
                >
                  Remove background
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC` }}>
            <p className="text-sm font-medium" style={{ color: theme.text }}>Border Radius</p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="24"
                value={theme.borderRadius || 12}
                onChange={(e) => setTheme(prev => ({ ...prev, borderRadius: Number(e.target.value) }))}
                className="flex-1 h-2 rounded-lg appearance-none"
                style={{ background: theme.surface, accentColor: theme.accent }}
              />
              <span className="text-sm w-10 text-right" style={{ color: theme.text }}>{theme.borderRadius || 12}px</span>
            </div>
          </div>

          <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: theme.border, backgroundColor: `${theme.surface}CC` }}>
            <p className="text-sm font-medium" style={{ color: theme.text }}>Theme Sync</p>
            <label className="flex items-center gap-2 text-sm" style={{ color: theme.text }}>
              <input
                type="checkbox"
                checked={theme.syncWithSystem}
                onChange={(e) => setTheme(prev => ({ ...prev, syncWithSystem: e.target.checked }))}
                className="w-4 h-4 rounded accent-[inherit]"
                style={{ accentColor: theme.accent }}
              />
              Sync with system preference
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: theme.text }}>
              <input
                type="checkbox"
                checked={theme.reduceMotion}
                onChange={(e) => setTheme(prev => ({ ...prev, reduceMotion: e.target.checked }))}
                className="w-4 h-4 rounded accent-[inherit]"
                style={{ accentColor: theme.accent }}
              />
              Reduce motion (accessibility)
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportTheme}
              className="flex-1 px-3 py-2 rounded-xl text-sm border transition-colors"
              style={{ borderColor: theme.border, color: theme.text }}
            >
              Export Theme
            </button>
            <button
              type="button"
              onClick={importTheme}
              className="flex-1 px-3 py-2 rounded-xl text-sm border transition-colors"
              style={{ borderColor: theme.border, color: theme.text }}
            >
              Import Theme
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-4 border-t flex gap-2" style={{ borderColor: theme.border }}>
        <button
          type="button"
          onClick={() => setTheme(prev => ({ ...prev, ...THEME_PRESETS[0] }))}
          className="flex-1 px-3 py-2 rounded-xl text-sm border transition-colors"
          style={{ borderColor: theme.border, color: theme.muted }}
        >
          Reset to Default
        </button>
        <button
          type="button"
          onClick={() => {
            const random = THEME_PRESETS[Math.floor(Math.random() * THEME_PRESETS.length)]
            applyPreset(random)
          }}
          className="flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all"
          style={{
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentStrong})`,
            color: theme.background,
          }}
        >
          Surprise Me ✨
        </button>
      </div>
    </div>
  )

  return createPortal(drawerContent, document.body)

  // Helper functions
  function applyPreset(preset) {
    setTheme(current => ({
      ...preset,
      image: current.image,
      showGlow: current.showGlow,
      showNoise: current.showNoise,
    }))
    setSelectedAnimation(preset.animation || 'none')
    setGradientDirection(preset.gradientDirection || 'to-br')
    setGradientStops(preset.gradientStops || [])
    setCustomColors({
      primary: preset.accent,
      secondary: preset.accentStrong,
      background: preset.background || preset.gradient?.[0],
      surface: preset.surface || preset.gradient?.[1],
    })
  }

  function applyCustomTheme() {
    const newTheme = {
      id: `custom-${Date.now()}`,
      label: 'Custom',
      category: 'custom',
      gradient: [customColors.background, customColors.surface],
      accent: customColors.primary,
      accentStrong: customColors.secondary,
      background: customColors.background,
      surface: customColors.surface,
      surfaceStrong: customColors.surface,
      border: customColors.primary + '40',
      text: '#f8fafc',
      muted: '#94a3b8',
      glow: customColors.primary,
      animation: selectedAnimation,
      gradientDirection,
      gradientStops,
      intensity,
      speed,
    }
    setTheme(current => ({ ...newTheme, image: current.image }))
  }

  function exportTheme() {
    const exportData = {
      ...theme,
      customColors,
      selectedAnimation,
      gradientDirection,
      gradientStops,
      intensity,
      speed,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mallchain-theme-${theme.id || 'custom'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importTheme() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result)
          setTheme(prev => ({ ...imported, image: prev.image }))
          if (imported.gradientStops) setGradientStops(imported.gradientStops)
          if (imported.gradientDirection) setGradientDirection(imported.gradientDirection)
          if (imported.animation) setSelectedAnimation(imported.animation)
          if (imported.intensity) setIntensity(imported.intensity)
          if (imported.speed) setSpeed(imported.speed)
        } catch (err) {
          console.error('Invalid theme file', err)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }
}

// Helper Components
function ColorPicker({ label, value, onChange, theme }) {
  return (
    <div className="space-y-1">
      <label className="text-xs" style={{ color: theme.muted }}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border-0 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs rounded-lg border font-mono"
          style={{ borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }}
        />
      </div>
    </div>
  )
}

function ToggleCard({ label, description, checked, onChange, theme }) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all"
      style={{
        borderColor: checked ? theme.accent : theme.border,
        backgroundColor: checked ? `${theme.accent}15` : `${theme.surface}CC`,
        color: theme.text,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 rounded accent-[inherit]"
        style={{ accentColor: theme.accent }}
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: theme.muted }}>{description}</p>
      </div>
    </label>
  )
}

function ParticleEffect({ color, count }) {
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: Math.random() * 4 + 2,
      delay: Math.random() * 5,
      duration: Math.random() * 10 + 10,
      tx: (Math.random() - 0.5) * 40,
    }))
  , [count])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full opacity-30"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: color,
            animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite`,
            '--tx': `${p.tx}px`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          25% { transform: translate(20px, -30px) scale(1.2); opacity: 0.6; }
          50% { transform: translate(-15px, -50px) scale(0.8); opacity: 0.4; }
          75% { transform: translate(-30px, -20px) scale(1.1); opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export default ThemeDrawer
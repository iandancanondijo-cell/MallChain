import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../core/store/authStore'

const MINES_URL = import.meta.env.VITE_MINES_URL || 'http://localhost:5176'
const MINES_ORIGIN = new URL(MINES_URL).origin

export default function MinesBridge() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const iframeRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const handleLoad = () => {
      setReady(true)
      console.log('[MinesBridge] iframe loaded, sending auth:change', { hasToken: !!token, user: user?.id })
      if (!token) return
      try {
        iframe.contentWindow?.postMessage(
          { type: 'auth:change', payload: { token, user: user || undefined } },
          MINES_ORIGIN,
        )
      } catch (e) {
        console.warn('[MinesBridge] postMessage failed', e)
      }
    }

    // Also listen for auth:request from mines iframe
    const handleMessage = (event) => {
      if (event.origin !== MINES_ORIGIN) return
      if (event.data?.type === 'auth:request') {
        console.log('[MinesBridge] Received auth:request from mines')
        if (token && event.source) {
          try {
            event.source.postMessage(
              { type: 'auth:share', payload: { token, user: user || undefined } },
              event.origin,
            )
          } catch (e) {
            console.warn('[MinesBridge] postMessage auth:share failed', e)
          }
        }
      }
    }

    window.addEventListener('message', handleMessage)
    iframe.addEventListener('load', handleLoad)
    return () => {
      window.removeEventListener('message', handleMessage)
      iframe.removeEventListener('load', handleLoad)
    }
  }, [token, user])

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-white">Mallchain Mines</h1>
          <p className="text-xs text-slate-400">
            Engagement economy linked to your Mallchain identity
          </p>
        </div>
        {!ready && (
          <span className="text-xs text-slate-400">Loading mines…</span>
        )}
      </div>
      <div className="flex-1 rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/60">
        <iframe
          ref={iframeRef}
          src={MINES_URL}
          title="Mallchain Mines"
          allow="clipboard-write"
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  )
}

import { useEffect, useCallback, useRef } from 'react'
import socket from './socket'
import { useAuthStore } from '../store/authStore'

/**
 * React hook that wires the unified socket into the auth store.
 * - Attaches the auth token on connect / token change.
 * - Emits a typed heartbeat so the backend knows the client is alive.
 * - Cleans up on unmount.
 * - Prevents reconnection storms by tracking connection state.
 */
export function useSocket() {
  const token = useAuthStore((s) => s.token)
  const isConnectingRef = useRef(false)

  useEffect(() => {
    const s = socket

    const onConnect = () => {
      if (token) {
        s.auth = { token }
      }
      s.emit('heartbeat', { ts: Date.now() })
      isConnectingRef.current = false
    }

    const onConnectError = (err) => {
      console.warn('[socket] connection error:', err.message)
      isConnectingRef.current = false
    }

    const onDisconnect = (reason) => {
      console.info('[socket] disconnected:', reason)
      isConnectingRef.current = false
      // Don't manually reconnect - socket.io handles it with reconnectionAttempts
    }

    s.on('connect', onConnect)
    s.on('connect_error', onConnectError)
    s.on('disconnect', onDisconnect)

    // Only attempt connection if not already connecting/connected and we have a token
    if (!s.connected && !isConnectingRef.current && token) {
      isConnectingRef.current = true
      s.connect()
    } else if (s.connected) {
      // Already connected, refresh auth
      onConnect()
    }

    return () => {
      s.off('connect', onConnect)
      s.off('connect_error', onConnectError)
      s.off('disconnect', onDisconnect)
    }
  }, [token])

  const emit = useCallback((event, data) => {
    socket.emit(event, data)
  }, [])

  const on = useCallback((event, handler) => {
    socket.on(event, handler)
    return () => {
      socket.off(event, handler)
    }
  }, [])

  return { socket, emit, on }
}

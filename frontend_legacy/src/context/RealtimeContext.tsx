import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import socket from '../lib/socket'

interface RealtimeContextType {
  connected: boolean
  marketFeed: any[]
  priceData: any
  walletBalance: any
  notifications: any[]
  subscribeToWallet: (address: string) => void
  unsubscribeFromWallet: (address: string) => void
  subscribeToMarket: () => void
  subscribeToPrice: () => void
  subscribeToBlocks: () => void
}

export const RealtimeContext = createContext<RealtimeContextType | null>(null)

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [marketFeed, setMarketFeed] = useState([])
  const [priceData, setPriceData] = useState(null)
  const [walletBalance, setWalletBalance] = useState(null)
  const [notifications, setNotifications] = useState([])

  // Connection lifecycle
  useEffect(() => {
    socket.on('connect', () => {
      setConnected(true)
      console.log('🔌 Realtime connected')
    })

    socket.on('disconnect', () => {
      setConnected(false)
      console.log('🔌 Realtime disconnected')
    })

    return () => {
      socket.off('connect')
      socket.off('disconnect')
    }
  }, [])

  // Market feed listener
  useEffect(() => {
    socket.on('market:event', (event) => {
      setMarketFeed((prev) => [event, ...prev].slice(0, 100))
    })

    socket.on('market:feed', (events) => {
      setMarketFeed(events)
    })

    return () => {
      socket.off('market:event')
      socket.off('market:feed')
    }
  }, [])

  // Price updates listener
  useEffect(() => {
    socket.on('price:update', (data) => {
      setPriceData((prev) => ({
        ...prev,
        ...data,
        history: prev?.history ? [...prev.history, data].slice(-100) : [data]
      }))
    })

    socket.on('price:current', (data) => {
      setPriceData(data)
    })

    return () => {
      socket.off('price:update')
      socket.off('price:current')
    }
  }, [])

  // Wallet updates listener
  useEffect(() => {
    socket.on('wallet:update', (data) => {
      setWalletBalance(data)
    })

    return () => {
      socket.off('wallet:update')
    }
  }, [])

  // Notifications listener
  useEffect(() => {
    socket.on('notification', (notification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 50))
    })

    return () => {
      socket.off('notification')
    }
  }, [])

  // Subscription methods
  const subscribeToWallet = useCallback((address: string) => {
    socket.emit('subscribe:wallet', address)
  }, [])

  const unsubscribeFromWallet = useCallback((address: string) => {
    socket.emit('unsubscribe:wallet', address)
  }, [])

  const subscribeToMarket = useCallback(() => {
    socket.emit('subscribe:market')
  }, [])

  const subscribeToPrice = useCallback(() => {
    socket.emit('subscribe:price')
  }, [])

  const subscribeToBlocks = useCallback(() => {
    socket.emit('subscribe:blocks')
  }, [])

  const value = {
    connected,
    marketFeed,
    priceData,
    walletBalance,
    notifications,
    subscribeToWallet,
    unsubscribeFromWallet,
    subscribeToMarket,
    subscribeToPrice,
    subscribeToBlocks
  }

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const context = useContext(RealtimeContext)
  if (!context) {
    throw new Error('useRealtime must be used within RealtimeProvider')
  }
  return context
}

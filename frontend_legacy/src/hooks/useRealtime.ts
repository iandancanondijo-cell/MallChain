import { useEffect, useState } from 'react'
import { useRealtime } from '../context/RealtimeContext'

/**
 * Hook to sync wallet balance in real-time
 */
export function useLiveWallet(address?: string) {
  const { subscribeToWallet, unsubscribeFromWallet, walletBalance } =
    useRealtime()

  useEffect(() => {
    if (!address) return

    subscribeToWallet(address)

    return () => {
      unsubscribeFromWallet(address)
    }
  }, [address, subscribeToWallet, unsubscribeFromWallet])

  return walletBalance
}

/**
 * Hook to stream market activity
 */
export function useLiveMarketFeed(limit = 50) {
  const { subscribeToMarket, marketFeed } = useRealtime()

  useEffect(() => {
    subscribeToMarket()
  }, [subscribeToMarket])

  return marketFeed.slice(0, limit)
}

/**
 * Hook to stream price updates
 */
export function useLivePrice() {
  const { subscribeToPrice, priceData } = useRealtime()

  useEffect(() => {
    subscribeToPrice()
  }, [subscribeToPrice])

  return priceData
}

/**
 * Hook to listen for real-time notifications
 */
export function useNotifications() {
  const { notifications } = useRealtime()
  return notifications
}

/**
 * Hook to get connection status
 */
export function useRealtimeStatus() {
  const { connected } = useRealtime()
  return {
    isConnected: connected,
    status: connected ? 'connected' : 'disconnected'
  }
}

/**
 * Hook to listen for new blocks
 */
export function useLiveBlocks() {
  const { subscribeToBlocks } = useRealtime()
  const [latestBlock, setLatestBlock] = useState(null)

  useEffect(() => {
    subscribeToBlocks()
  }, [subscribeToBlocks])

  // Listen for block events
  useEffect(() => {
    const handleBlockUpdate = (block: any) => {
      setLatestBlock(block)
    }

    // This would need to be set up in the socket listener
    return () => {}
  }, [])

  return latestBlock
}

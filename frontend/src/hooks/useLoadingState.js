import { useState, useCallback } from 'react'

/**
 * Hook for managing loading states with error handling
 * @param {Object} options - Configuration options
 * @param {string} options.initialMessage - Initial loading message
 * @returns {Object} Loading state and control functions
 */
export default function useLoadingState({ initialMessage = 'Loading…' } = {}) {
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState(initialMessage)
  const [loadingProgress, setLoadingProgress] = useState(null)

  const startLoading = useCallback((message) => {
    setLoading(true)
    if (message) setLoadingMessage(message)
  }, [])

  const stopLoading = useCallback(() => {
    setLoading(false)
    setLoadingProgress(null)
  }, [])

  const setProgress = useCallback((progress) => {
    setLoadingProgress(progress)
  }, [])

  const withLoading = useCallback(async (asyncFn, message) => {
    startLoading(message)
    try {
      const result = await asyncFn()
      return result
    } finally {
      stopLoading()
    }
  }, [startLoading, stopLoading])

  return {
    loading,
    loadingMessage,
    loadingProgress,
    startLoading,
    stopLoading,
    setProgress,
    withLoading
  }
}
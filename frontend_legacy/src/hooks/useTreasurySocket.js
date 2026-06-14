import { useEffect } from 'react'
import { io } from 'socket.io-client'

const socket = io('http://localhost:4000')

export default function useTreasurySocket(setMetrics) {
  useEffect(() => {
    socket.on('treasury_update', data => {
      setMetrics(data)
    })

    return () => {
      socket.off('treasury_update')
    }
  }, [])
}
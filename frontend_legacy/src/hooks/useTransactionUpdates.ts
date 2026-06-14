import { useEffect } from 'react'
import { socket } from '../services/socket'

export default function useTransactionUpdates(onUpdate: () => void) {
  useEffect(() => {
    const handler = () => onUpdate()

    socket.on('tx:update', handler)
    return () => {
      socket.off('tx:update', handler)
    }
  }, [onUpdate])
}

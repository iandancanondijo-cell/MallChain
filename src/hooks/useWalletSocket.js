import { useEffect } from 'react'

import socket from '../core/socket/socket'

export default function useWalletSocket(
  address,
  onUpdate
) {

  useEffect(() => {

    if (!address) return

    socket.emit(
      'subscribe:wallet',
      address
    )

    socket.on(
      'wallet:update',
      onUpdate
    )

    return () => {

      socket.emit(
        'unsubscribe:wallet',
        address
      )

      socket.off(
        'wallet:update',
        onUpdate
      )

    }

  }, [address])

}

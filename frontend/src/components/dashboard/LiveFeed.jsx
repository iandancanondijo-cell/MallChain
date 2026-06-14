import { useEffect, useState } from 'react'

import socket from '../../core/socket/socket'

export default function LiveFeed() {
  const [events, setEvents] = useState([])

  useEffect(() => {

    socket.on(
      'new_transaction',
      tx => {
        setEvents(prev => [
          tx,
          ...prev.slice(0, 9)
        ])
      }
    )

    return () => {
      socket.off('new_transaction')
    }

  }, [])

  return (
    <div
      className="
        rounded-3xl
        border
        border-slate-800
        bg-slate-900/50
        backdrop-blur-xl
        p-6
      "
    >

      <div className="flex items-center justify-between mb-6">

        <h2 className="text-2xl font-bold">
          Live Blockchain Feed
        </h2>

        <div className="flex items-center gap-2">

          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />

          <span className="text-emerald-400 text-sm">
            Live
          </span>

        </div>

      </div>

      <div className="space-y-4">

        {
          events.length === 0 && (
            <p className="text-slate-400">
              Waiting for blockchain activity...
            </p>
          )
        }

        {
          events.map((tx, index) => (
            <div
              key={index}
              className="
                rounded-2xl
                bg-slate-800/60
                p-4
              "
            >

              <div className="flex justify-between">

                <span className="font-mono text-sm">
                  {tx.hash}
                </span>

                <span className="text-emerald-400">
                  {tx.amount} MLN
                </span>

              </div>

              <div className="mt-2 text-slate-400 text-sm">
                {tx.type}
              </div>

            </div>
          ))
        }

      </div>

    </div>
  )
}

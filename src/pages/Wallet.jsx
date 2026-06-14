import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'

import socket from '../core/socket/socket'
import useWalletSocket from '../hooks/useWalletSocket'

export default function Wallet() {

  const [address, setAddress] =
    useState('')

  const [balance, setBalance] =
    useState('0')

  const [connected, setConnected] =
    useState(false)

  const [lastUpdated, setLastUpdated] =
    useState('')

  const [transactions, setTransactions] =
    useState([])

  useEffect(() => {

    const saved =
      localStorage.getItem(
        'mall_address'
      )

    if (saved) {
      setAddress(saved)
    }

  }, [])

  useEffect(() => {

    socket.on('connect', () => {
      setConnected(true)
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on(
      'new_transaction',
      tx => {

        setTransactions(prev => [
          tx,
          ...prev.slice(0, 9)
        ])

      }
    )

    return () => {

      socket.off('connect')
      socket.off('disconnect')
      socket.off('new_transaction')

    }

  }, [])

  useWalletSocket(
    address,
    data => {

      if (data.balance) {
        setBalance(data.balance)
      }

      setLastUpdated(
        new Date().toLocaleString()
      )

    }
  )

  return (
    <div
      className="
        min-h-screen
        bg-slate-950
        text-white
        p-8
      "
    >

      <div
        className="
          max-w-7xl
          mx-auto
        "
      >

        <div
          className="
            flex
            items-center
            justify-between
            mb-10
          "
        >

          <div>

            <h1
              className="
                text-5xl
                font-black
              "
            >
              Mallcoin Wallet
            </h1>

            <p
              className="
                text-slate-400
                mt-2
              "
            >
              Realtime blockchain wallet
            </p>

          </div>

          <div
            className="
              flex
              items-center
              gap-3
            "
          >

            <div
              className={`
                w-3 h-3 rounded-full
                ${
                  connected
                    ? 'bg-emerald-400'
                    : 'bg-red-500'
                }
              `}
            />

            <span>
              {
                connected
                  ? 'Live'
                  : 'Offline'
              }
            </span>

          </div>

        </div>

        <div
          className="
            grid
            grid-cols-1
            lg:grid-cols-3
            gap-8
          "
        >

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}

            className="
              lg:col-span-2
              rounded-3xl
              bg-slate-900/70
              border
              border-slate-800
              p-8
              backdrop-blur-xl
            "
          >

            <div
              className="
                flex
                justify-between
                items-start
              "
            >

              <div>

                <p className="text-slate-400">
                  Total Balance
                </p>

                <h2
                  className="
                    text-6xl
                    font-black
                    mt-4
                  "
                >
                  {balance}
                </h2>

                <p
                  className="
                    text-cyan-400
                    mt-2
                  "
                >
                  MLN
                </p>

              </div>

              <div
                className="
                  bg-slate-800
                  p-4
                  rounded-2xl
                "
              >

                <QRCodeSVG
                  value={address || 'wallet'}
                  size={120}
                  bgColor="transparent"
                  fgColor="#22d3ee"
                />

              </div>

            </div>

            <div className="mt-8">

              <p
                className="
                  text-slate-500
                  text-sm
                "
              >
                Wallet Address
              </p>

              <p
                className="
                  mt-2
                  font-mono
                  break-all
                "
              >
                {
                  address ||
                  'No wallet connected'
                }
              </p>

            </div>

            <div
              className="
                grid
                grid-cols-2
                gap-4
                mt-10
              "
            >

              <button
                className="
                  bg-cyan-500
                  hover:bg-cyan-400
                  transition
                  rounded-2xl
                  py-4
                  font-bold
                "
              >
                Send
              </button>

              <button
                className="
                  bg-slate-800
                  hover:bg-slate-700
                  transition
                  rounded-2xl
                  py-4
                  font-bold
                "
              >
                Receive
              </button>

            </div>

            <div
              className="
                mt-8
                text-sm
                text-slate-500
              "
            >
              Last Updated:
              {' '}
              {lastUpdated || '—'}
            </div>

          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}

            className="
              rounded-3xl
              bg-slate-900/70
              border
              border-slate-800
              p-6
            "
          >

            <div
              className="
                flex
                justify-between
                items-center
                mb-6
              "
            >

              <h3
                className="
                  text-2xl
                  font-bold
                "
              >
                Live Feed
              </h3>

              <div
                className="
                  text-emerald-400
                  text-sm
                "
              >
                realtime
              </div>

            </div>

            <div className="space-y-4">

              {
                transactions.length === 0 && (
                  <div
                    className="
                      text-slate-500
                    "
                  >
                    Waiting for activity...
                  </div>
                )
              }

              {
                transactions.map(
                  (tx, index) => (

                    <div
                      key={index}

                      className="
                        bg-slate-800/70
                        rounded-2xl
                        p-4
                      "
                    >

                      <div
                        className="
                          flex
                          justify-between
                        "
                      >

                        <span
                          className="
                            text-xs
                            font-mono
                          "
                        >
                          {tx.hash}
                        </span>

                        <span
                          className="
                            text-cyan-400
                          "
                        >
                          {tx.amount}
                        </span>

                      </div>

                      <div
                        className="
                          text-slate-400
                          text-sm
                          mt-2
                        "
                      >
                        {tx.type}
                      </div>

                    </div>

                  )
                )
              }

            </div>

          </motion.div>

        </div>

      </div>

    </div>
  )
}

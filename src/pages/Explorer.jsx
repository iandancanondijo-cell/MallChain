import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import socket from '../core/socket/socket'

export default function Explorer() {

  const [blocks, setBlocks] =
    useState([])

  const [transactions, setTransactions] =
    useState([])

  const [networkStats, setNetworkStats] =
    useState({
      height: 0,
      validators: 0,
      txs: 0
    })

  useEffect(() => {

    socket.emit('subscribe:blocks')

    socket.on(
      'block:new',
      block => {

        setBlocks(prev => [
          block,
          ...prev.slice(0, 14)
        ])

        setNetworkStats(prev => ({
          ...prev,
          height: block.height
        }))

      }
    )

    socket.on(
      'new_transaction',
      tx => {

        setTransactions(prev => [
          tx,
          ...prev.slice(0, 14)
        ])

        setNetworkStats(prev => ({
          ...prev,
          txs: prev.txs + 1
        }))

      }
    )

    socket.on(
      'validator:update',
      validators => {

        setNetworkStats(prev => ({
          ...prev,
          validators
        }))

      }
    )

    return () => {

      socket.off('block:new')

      socket.off('new_transaction')

      socket.off('validator:update')

    }

  }, [])

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

        <div className="mb-10">

          <h1
            className="
              text-5xl
              font-black
            "
          >
            Mallcoin Explorer
          </h1>

          <p
            className="
              text-slate-400
              mt-3
            "
          >
            Live blockchain explorer
          </p>

        </div>

        <div
          className="
            grid
            grid-cols-1
            md:grid-cols-3
            gap-6
            mb-10
          "
        >

          <StatCard
            title="Latest Block"
            value={networkStats.height}
          />

          <StatCard
            title="Validators"
            value={networkStats.validators}
          />

          <StatCard
            title="Transactions"
            value={networkStats.txs}
          />

        </div>

        <div
          className="
            grid
            grid-cols-1
            xl:grid-cols-2
            gap-8
          "
        >

          <ExplorerPanel
            title="Latest Blocks"
          >

            {
              blocks.length === 0 && (
                <Empty
                  text="Waiting for blocks..."
                />
              )
            }

            {
              blocks.map(
                (block, index) => (

                  <ExplorerCard
                    key={index}

                    title={
                      `Block #${block.height}`
                    }

                    subtitle={
                      block.time
                    }

                    value={
                      `${block.transactions} txs`
                    }
                  />

                )
              )
            }

          </ExplorerPanel>

          <ExplorerPanel
            title="Latest Transactions"
          >

            {
              transactions.length === 0 && (
                <Empty
                  text="Waiting for txs..."
                />
              )
            }

            {
              transactions.map(
                (tx, index) => (

                  <ExplorerCard
                    key={index}

                    title={
                      tx.hash
                    }

                    subtitle={
                      tx.type
                    }

                    value={
                      `${tx.amount} MLN`
                    }
                  />

                )
              )
            }

          </ExplorerPanel>

        </div>

      </div>

    </div>
  )
}

function StatCard({
  title,
  value
}) {

  return (
    <motion.div

      whileHover={{
        scale: 1.02
      }}

      className="
        rounded-3xl
        bg-slate-900/70
        border
        border-slate-800
        p-6
      "
    >

      <div className="text-slate-400">
        {title}
      </div>

      <div
        className="
          text-4xl
          font-black
          mt-4
        "
      >
        {value}
      </div>

    </motion.div>
  )
}

function ExplorerPanel({
  title,
  children
}) {

  return (
    <div
      className="
        rounded-3xl
        bg-slate-900/70
        border
        border-slate-800
        p-6
      "
    >

      <h2
        className="
          text-2xl
          font-bold
          mb-6
        "
      >
        {title}
      </h2>

      <div className="space-y-4">
        {children}
      </div>

    </div>
  )
}

function ExplorerCard({
  title,
  subtitle,
  value
}) {

  return (
    <motion.div

      initial={{
        opacity: 0,
        y: 10
      }}

      animate={{
        opacity: 1,
        y: 0
      }}

      className="
        rounded-2xl
        bg-slate-800/60
        p-4
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

          <div
            className="
              font-mono
              text-sm
              break-all
            "
          >
            {title}
          </div>

          <div
            className="
              text-slate-400
              text-sm
              mt-2
            "
          >
            {subtitle}
          </div>

        </div>

        <div className="text-cyan-400">
          {value}
        </div>

      </div>

    </motion.div>
  )
}

function Empty({
  text
}) {

  return (
    <div
      className="
        py-10
        text-center
        text-slate-500
      "
    >
      {text}
    </div>
  )
}

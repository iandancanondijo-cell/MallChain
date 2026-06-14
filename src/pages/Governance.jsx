import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import axios from 'axios'

import socket from '../core/socket/socket'

export default function Governance() {

  const [proposals, setProposals] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  useEffect(() => {

    loadProposals()

    socket.on(
      'governance:update',
      proposal => {

        setProposals(prev => {

          const exists =
            prev.find(
              p => p.id === proposal.id
            )

          if (exists) {

            return prev.map(p =>
              p.id === proposal.id
                ? proposal
                : p
            )

          }

          return [
            proposal,
            ...prev
          ]

        })

      }
    )

    return () => {
      socket.off('governance:update')
    }

  }, [])

  async function loadProposals() {

    try {

      const res =
        await axios.get(
          'http://localhost:4000/api/governance'
        )

      setProposals(
        res.data.proposals || []
      )

    } catch (err) {

      console.error(
        'governance load failed',
        err
      )

    }

    setLoading(false)

  }

  async function vote(
    proposalId,
    option
  ) {

    try {

      await axios.post(
        `http://localhost:4000/api/governance/vote`,
        {
          proposalId,
          option
        }
      )

    } catch (err) {

      console.error(
        'vote failed',
        err
      )

    }

  }

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
            Governance Center
          </h1>

          <p
            className="
              text-slate-400
              mt-3
            "
          >
            Decentralized network governance
          </p>

        </div>

        {
          loading && (
            <div
              className="
                text-slate-500
              "
            >
              Loading proposals...
            </div>
          )
        }

        <div className="space-y-6">

          {
            proposals.map(
              proposal => (

                <motion.div

                  key={proposal.id}

                  initial={{
                    opacity: 0,
                    y: 20
                  }}

                  animate={{
                    opacity: 1,
                    y: 0
                  }}

                  className="
                    rounded-3xl
                    bg-slate-900/70
                    border
                    border-slate-800
                    p-8
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
                          text-cyan-400
                          text-sm
                          mb-3
                        "
                      >
                        Proposal #{proposal.id}
                      </div>

                      <h2
                        className="
                          text-3xl
                          font-bold
                        "
                      >
                        {proposal.title}
                      </h2>

                      <p
                        className="
                          text-slate-400
                          mt-4
                          leading-relaxed
                        "
                      >
                        {proposal.description}
                      </p>

                    </div>

                    <div
                      className="
                        px-4
                        py-2
                        rounded-xl
                        bg-slate-800
                      "
                    >
                      {proposal.status}
                    </div>

                  </div>

                  <div
                    className="
                      grid
                      grid-cols-3
                      gap-4
                      mt-8
                    "
                  >

                    <VoteCard
                      label="Yes"
                      value={
                        proposal.yes || 0
                      }
                    />

                    <VoteCard
                      label="No"
                      value={
                        proposal.no || 0
                      }
                    />

                    <VoteCard
                      label="Abstain"
                      value={
                        proposal.abstain || 0
                      }
                    />

                  </div>

                  <div
                    className="
                      flex
                      gap-4
                      mt-8
                    "
                  >

                    <button
                      onClick={() =>
                        vote(
                          proposal.id,
                          'yes'
                        )
                      }

                      className="
                        flex-1
                        bg-emerald-500
                        hover:bg-emerald-400
                        transition
                        rounded-2xl
                        py-4
                        font-bold
                      "
                    >
                      Vote Yes
                    </button>

                    <button
                      onClick={() =>
                        vote(
                          proposal.id,
                          'no'
                        )
                      }

                      className="
                        flex-1
                        bg-red-500
                        hover:bg-red-400
                        transition
                        rounded-2xl
                        py-4
                        font-bold
                      "
                    >
                      Vote No
                    </button>

                    <button
                      onClick={() =>
                        vote(
                          proposal.id,
                          'abstain'
                        )
                      }

                      className="
                        flex-1
                        bg-slate-700
                        hover:bg-slate-600
                        transition
                        rounded-2xl
                        py-4
                        font-bold
                      "
                    >
                      Abstain
                    </button>

                  </div>

                </motion.div>

              )
            )
          }

        </div>

      </div>

    </div>
  )
}

function VoteCard({
  label,
  value
}) {

  return (
    <div
      className="
        rounded-2xl
        bg-slate-800/60
        p-4
      "
    >

      <div className="text-slate-400">
        {label}
      </div>

      <div
        className="
          text-3xl
          font-black
          mt-3
        "
      >
        {value}
      </div>

    </div>
  )
}

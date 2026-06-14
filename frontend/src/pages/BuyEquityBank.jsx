import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, CreditCard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function BuyEquityBank() {
  const [account, setAccount] = useState('')
  const [amountFiat, setAmountFiat] = useState('')
  const [processing, setProcessing] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState(null)
  const [providerRef, setProviderRef] = useState(null)

  const validate = () => {
    if (!account.trim()) return 'Account identifier is required'
    const n = Number(amountFiat)
    if (!Number.isFinite(n) || n <= 0) return 'Amount must be greater than 0'
    return null
  }

  const start = (e) => {
    e.preventDefault()
    const err = validate()
    setError(err)
    if (err) return

    setProcessing(true)
    setCompleted(false)
    setProviderRef(null)

    setTimeout(() => {
      setProviderRef(`EB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`)
      setProcessing(false)
      setCompleted(true)
    }, 4300)
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <Link
          to="/buy"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Buy
        </Link>
        <h1 className="text-3xl font-black">Equity Bank</h1>
        <p className="text-slate-400 mt-2">Start a direct bank flow for this purchase.</p>
      </div>

      <motion.form
        onSubmit={start}
        className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        noValidate
        hidden={processing || completed}
      >
        <label className="block text-sm text-slate-400">
          Account / Identifier
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            onBlur={() => setError(validate())}
            placeholder="Enter account or mobile number"
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
        </label>

        <label className="block text-sm text-slate-400">
          Amount (KES)
          <input
            type="number"
            min="1"
            value={amountFiat}
            onChange={(e) => setAmountFiat(e.target.value)}
            onBlur={() => setError(validate())}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
        </label>

        {error && (
          <div className="text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <button
          type="submit"
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-slate-700 to-slate-900 font-bold flex items-center justify-center gap-2"
        >
          <CreditCard className="w-5 h-5" /> Continue
        </button>
      </motion.form>

      {processing && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-xl font-bold">Connecting bank gateway</h2>
          <p className="text-slate-400 text-sm">Approve the verification step when prompted.</p>
        </div>
      )}

      {completed && (
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
          <h2 className="text-2xl font-bold">Bank payment initiated</h2>
          <p className="text-slate-400">
            {providerRef && (
              <>
                Reference: <span className="font-mono text-emerald-300">{providerRef}</span>
              </>
            )}
          </p>
          <Link to="/buy" className="inline-block text-cyan-400 hover:underline">Back to Buy</Link>
        </div>
      )}
    </div>
  )
}


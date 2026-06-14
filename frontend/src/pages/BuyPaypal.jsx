import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react'

export default function BuyPaypal() {
  const [step, setStep] = useState('login') // login | withdraw | review | success
  const [usdAmount, setUsdAmount] = useState('100')
  const [error, setError] = useState(null)
  const exchangeRate = 129.5

  const usd = Number(usdAmount)

  const start = (e) => {
    e.preventDefault()
    if (!Number.isFinite(usd) || usd <= 0) {
      setError('Enter a valid amount')
      return
    }
    setError(null)
    setStep('withdraw')
  }

  const review = () => {
    if (!Number.isFinite(usd) || usd <= 0) {
      setError('Enter a valid amount')
      return
    }
    setError(null)
    setStep('review')
  }

  const confirm = () => {
    setError(null)
    setStep('success')
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
        <h1 className="text-3xl font-black">PayPal</h1>
        <p className="text-slate-400 mt-2">PayPal → M-Pesa style flow (demo UI).</p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
        {step === 'login' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xl font-bold">Link your PayPal gateway</h2>
            <p className="text-slate-400 text-sm mt-2">
              Click below to continue. You'll authorize access on the next steps.
            </p>
            <button
              onClick={() => setStep('withdraw')}
              className="mt-5 w-full py-4 rounded-2xl bg-blue-600 font-bold text-white"
            >
              Log in securely with PayPal
            </button>
          </motion.div>
        )}

        {step === 'withdraw' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xl font-bold">Withdraw funds</h2>
            <p className="text-slate-400 text-sm mt-2">Enter USD amount to convert to Kenyan KSh.</p>

            <label className="block text-sm text-slate-400 mt-4">
              USD amount
              <div className="relative mt-2">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  value={usdAmount}
                  onChange={(e) => setUsdAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white pl-10"
                />
              </div>
            </label>

            {error && (
              <div className="text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}

            <button
              onClick={review}
              className="mt-5 w-full py-4 rounded-2xl bg-blue-600 font-bold text-white"
            >
              Calculate conversion
            </button>
          </motion.div>
        )}

        {step === 'review' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xl font-bold">Review</h2>
            <div className="mt-3 rounded-2xl bg-slate-950 border border-slate-700 p-4 text-sm space-y-2">
              <div className="flex justify-between gap-4">
                <span className="text-slate-300">Withdrawal</span>
                <span className="font-mono text-white">${usdAmount}.00</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-300">Rate</span>
                <span className="font-mono text-cyan-300">1 USD = {exchangeRate} KES</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-300">Estimated KSh</span>
                <span className="font-mono text-emerald-300">
                  {Number.isFinite(usd) ? Math.round(usd * exchangeRate).toLocaleString() : '0'}
                </span>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setStep('withdraw')}
                className="flex-1 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white"
              >
                Back
              </button>
              <button
                type="button"
                onClick={confirm}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-bold"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mx-auto w-14 h-14 bg-emerald-500/15 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold mt-4">Transaction initialized</h2>
            <p className="text-slate-400 text-sm mt-2">
              Conversion and settlement steps will complete in the background.
            </p>
            <Link to="/buy" className="block mt-6 text-cyan-400 hover:underline">
              Back to Buy
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  )
}


import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Smartphone, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function BuyTkash() {
  const [phone, setPhone] = useState('')
  const [amountFiat, setAmountFiat] = useState('')
  const [step, setStep] = useState('form') // form | processing | success
  const [error, setError] = useState(null)
  const [providerRef, setProviderRef] = useState(null)

  const validate = () => {
    const p = phone.trim()
    if (!p) return 'Phone number is required'
    if (!/^\d{9,10}$/.test(p)) return 'Enter a valid T-Kash phone number'
    const n = Number(amountFiat)
    if (!Number.isFinite(n) || n <= 0) return 'Amount must be greater than 0'
    return null
  }

  const start = (e) => {
    e.preventDefault()
    const err = validate()
    setError(err)
    if (err) return

    setStep('processing')
    setProviderRef(null)

    setTimeout(() => {
      setProviderRef(`TK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`)
      setStep('success')
    }, 4200)
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
        <h1 className="text-3xl font-black">T-Kash</h1>
        <p className="text-slate-400 mt-2">Start the T-Kash payment flow.</p>
      </div>

      <motion.form
        onSubmit={start}
        className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        noValidate
        hidden={step !== 'form'}
      >
        <label className="block text-sm text-slate-400">
          T-Kash phone
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
            <Smartphone className="w-5 h-5 text-slate-500" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              onBlur={() => setError(validate())}
              placeholder="07XXXXXXXX"
              className="flex-1 bg-transparent outline-none text-white"
            />
          </div>
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

        <button type="submit" className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 font-bold">
          Continue
        </button>
      </motion.form>

      {step === 'processing' && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-xl font-bold">Waiting for T-Kash approval</h2>
          <p className="text-slate-400 text-sm">Approve the prompt on your phone.</p>
        </div>
      )}

      {step === 'success' && (
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
          <h2 className="text-2xl font-bold">Payment confirmed</h2>
          <p className="text-slate-400">
            {providerRef && (
              <>
                Reference: <span className="font-mono text-emerald-300">{providerRef}</span>
              </>
            )}
          </p>
          <Link to="/buy" className="inline-block text-cyan-400 hover:underline">
            Back to Buy
          </Link>
        </div>
      )}
    </div>
  )
}


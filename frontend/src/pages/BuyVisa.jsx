import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, CreditCard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function BuyVisa() {
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [step, setStep] = useState('form') // form | processing | success
  const [error, setError] = useState(null)
  const [providerRef, setProviderRef] = useState(null)

  const validate = () => {
    if (!cardNumber.replace(/\D/g, '')) return 'Card number is required'
    if (!expiry.trim()) return 'Expiry is required'
    if (!cvv.trim()) return 'CVV is required'
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
      setProviderRef(`VS-${Math.random().toString(36).slice(2, 10).toUpperCase()}`)
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
        <h1 className="text-3xl font-black">Visa</h1>
        <p className="text-slate-400 mt-2">Visa 3D Secure flow (demo UI).</p>
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
          Card number
          <input
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            onBlur={() => setError(validate())}
            placeholder="4000 1234 5678 9010"
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white font-mono"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm text-slate-400">
            Expiry
            <input
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              onBlur={() => setError(validate())}
              placeholder="MM/YY"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white font-mono text-center"
            />
          </label>
          <label className="block text-sm text-slate-400">
            CVV
            <input
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
              onBlur={() => setError(validate())}
              placeholder="123"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white font-mono text-center"
            />
          </label>
        </div>

        {error && (
          <div className="text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <button type="submit" className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 font-bold flex items-center justify-center gap-2">
          <CreditCard className="w-5 h-5" /> Pay securely
        </button>
      </motion.form>

      {step === 'processing' && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-xl font-bold">Redirecting to bank authorization</h2>
          <p className="text-slate-400 text-sm">Enter OTP on your bank app to complete.</p>
        </div>
      )}

      {step === 'success' && (
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
          <h2 className="text-2xl font-bold">Payment authorized</h2>
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


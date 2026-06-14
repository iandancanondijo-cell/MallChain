import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Smartphone,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react'

import toast from 'react-hot-toast'

import { fetchBuyPrice } from '../core/buy/buyApi'
import { TOKENS } from '../config/tokens'

export default function BuyAirtelMoney() {
  const [phone, setPhone] = useState('')
  const [amountFiat, setAmountFiat] = useState('')
  const [loading, setLoading] = useState(false)

  const [providerRef, setProviderRef] = useState(null)
  const [status, setStatus] = useState(null)

  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})

  const [buyPriceKes, setBuyPriceKes] = useState(null)
  const [mlcnsQuote, setMlcnsQuote] = useState(0)

  const validatePhone = (value) => {
    if (!value.trim()) return 'Phone number is required'
    const v = value.trim()
    if (!/^\d{9,10}$/.test(v)) return 'Enter a valid Airtel phone number'
    return null
  }

  const validateAmount = (value) => {
    if (!value) return 'Amount is required'
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return 'Amount must be greater than 0'
    return null
  }

  const validate = () => {
    const newErrors = {}
    const phoneErr = validatePhone(phone)
    const amountErr = validateAmount(amountFiat)

    if (phoneErr) newErrors.phone = phoneErr
    if (amountErr) newErrors.amount = amountErr

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }))

    if (field === 'phone') {
      setErrors((prev) => ({ ...prev, phone: validatePhone(phone) }))
    }

    if (field === 'amount') {
      setErrors((prev) => ({ ...prev, amount: validateAmount(amountFiat) }))
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { buyPriceKes } = await fetchBuyPrice()
        if (!mounted) return
        setBuyPriceKes(buyPriceKes)
      } catch {
        // keep defaults; UI can still work
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!buyPriceKes) return

    const kes = Number(amountFiat)
    if (!Number.isFinite(kes) || kes <= 0) {
      setMlcnsQuote(0)
      return
    }

    setMlcnsQuote(kes / buyPriceKes)
  }, [amountFiat, buyPriceKes])

  const amountKes = useMemo(() => Number(amountFiat), [amountFiat])

  const initiate = async (e) => {
    e.preventDefault()
    setTouched({ phone: true, amount: true })

    if (!validate()) return
    if (!Number.isFinite(amountKes) || amountKes <= 0) return

    setLoading(true)
    setProviderRef(null)
    setStatus(null)

    try {
      // TODO: Replace demo with real Airtel STK + callback/polling.
      setTimeout(() => {
        setProviderRef(`AL-${Math.random().toString(36).slice(2, 10).toUpperCase()}`)
        setStatus('success')
        toast.success('Airtel prompt sent — complete on your phone')
        setLoading(false)
      }, 2000)
    } catch (err) {
      toast.error(err?.message || 'Buy failed')
      setLoading(false)
    }
  }

  const buyRateDisplay = (buyPriceKes ?? TOKENS.mallcoin.basePriceKes).toFixed(4)

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link
          to="/buy"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Buy
        </Link>

        <h1 className="text-3xl font-black">Buy MLCNS</h1>

        <p className="text-slate-400 mt-2">
          Balance: <span className="font-mono text-white">0.0000</span> {TOKENS.mallcoin.symbol} · Buy rate{' '}
          <span className="text-cyan-400">KSh {buyRateDisplay} / MLCNS</span>
        </p>
      </div>

      {/* Stepper */}
      <div className="flex gap-2">
        {['Amount', 'Pay', 'Credit'].map((label, i) => (
          <div
            key={label}
            className={`flex-1 rounded-xl py-2 text-center text-xs font-semibold border ${
              i === 0
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-800 text-slate-500'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex gap-3">
        <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
        <p className="text-sm text-slate-300">Airtel Money payment flow · prices update by live buy rate.</p>
      </div>

      <motion.form
        onSubmit={initiate}
        className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        noValidate
      >
        <label className="block text-sm text-slate-400">
          Wallet (receives MLCNS)
          <input
            disabled
            value={'mlcns_wallet_address'}
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400"
          />
        </label>

        <label className="block text-sm text-slate-400">
          Pay (KES)
          <div
            className={`mt-2 flex items-center gap-2 rounded-2xl border px-4 py-3 transition-colors ${
              touched.phone && errors.phone
                ? 'border-red-500 bg-red-950/20'
                : 'border-slate-700 bg-slate-950'
            }`}
          >
            <Smartphone className="w-5 h-5 text-slate-500" />
            <input
              value={phone}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '')
                setPhone(next)
                if (touched.phone) {
                  setErrors((prev) => ({ ...prev, phone: validatePhone(next) }))
                }
              }}
              onBlur={() => handleBlur('phone')}
              placeholder="07XXXXXXXX"
              className="flex-1 bg-transparent outline-none text-white"
              aria-invalid={touched.phone && !!errors.phone}
            />
          </div>

          {touched.phone && errors.phone && (
            <p className="mt-2 text-sm text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {errors.phone}
            </p>
          )}

          <div className="mt-4">
            <label className="sr-only">Amount (KES)</label>
            <input
              type="number"
              min="1"
              placeholder="Amount (KES)"
              value={amountFiat}
              onChange={(e) => {
                const next = e.target.value
                setAmountFiat(next)
                if (touched.amount) {
                  setErrors((prev) => ({ ...prev, amount: validateAmount(next) }))
                }
              }}
              onBlur={() => handleBlur('amount')}
              className="w-full bg-transparent outline-none text-white placeholder:text-slate-500"
            />

            {touched.amount && errors.amount && (
              <p className="mt-2 text-sm text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.amount}
              </p>
            )}
          </div>

          <label className="block text-sm text-slate-400 mt-4">
            Receive (MLCNS)
            <div className="mt-2 text-xs text-slate-500">
              Estimated:{' '}
              <span className="font-mono text-cyan-400">{mlcnsQuote.toFixed(6)} MLCNS</span>
            </div>
            <input
              disabled
              type="number"
              min="0"
              step="0.000001"
              value={mlcnsQuote}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-300"
            />
          </label>
        </label>

      
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-2xl bg-blue-600 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
          Buy with Airtel Money
        </button>
      </motion.form>

      {providerRef && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm space-y-2">
          <p>
            Reference: <span className="font-mono text-emerald-400">{providerRef}</span>
          </p>
          <p>
            Status:{' '}
            <span
              className={`font-medium ${
                status === 'success'
                  ? 'text-emerald-400'
                  : status === 'failed'
                    ? 'text-red-400'
                    : 'text-amber-400'
              }`}
            >
              {status || 'pending'}
            </span>
          </p>
          <button
            type="button"
            className="text-cyan-400 hover:underline"
            onClick={() => {
              toast('Status polling not implemented yet')
            }}
          >
            Refresh status
          </button>
        </div>
      )}

      {status === 'success' && (
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
          <h2 className="text-2xl font-bold">Payment approved</h2>
          <p className="text-slate-400">
            {providerRef ? (
              <>
                Reference: <span className="font-mono text-emerald-300">{providerRef}</span>
              </>
            ) : (
              'Payment confirmed.'
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


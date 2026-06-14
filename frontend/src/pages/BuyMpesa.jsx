import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, CreditCard, Loader2, Smartphone, AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

import toast from 'react-hot-toast'
import { initiateLegacyMpesa, getLegacyPaymentStatus, fetchBuyPrice } from '../core/buy/buyApi'
import { TOKENS } from '../config/tokens'


/** Quick M-Pesa top-up via legacy payment API */
export default function BuyMpesa() {
  const [phone, setPhone] = useState('')
  const [amountFiat, setAmountFiat] = useState('')
  const [loading, setLoading] = useState(false)

  const [providerRef, setProviderRef] = useState(null)
  const [status, setStatus] = useState(null)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})

  const [walletAddress, setWalletAddress] = useState('')


  const [buyPriceKes, setBuyPriceKes] = useState(null)
  const [mlcnsQuote, setMlcnsQuote] = useState(0)


  const validatePhone = (value) => {
    if (!value.trim()) return 'Phone number is required'
    if (!/^254\d{9}$/.test(value.trim())) return 'Enter a valid Kenyan phone (2547XXXXXXXX)'
    return null
  }

  const validateAmount = (value) => {
    if (!value) return 'Amount is required'
    const num = Number(value)
    if (num <= 0) return 'Amount must be greater than 0'
    if (num < 10) return 'Minimum amount is KES 10'
    if (num > 150000) return 'Maximum amount is KES 150,000'
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
      const err = validatePhone(phone)
      setErrors((prev) => ({ ...prev, phone: err }))
    }
    if (field === 'amount') {
      const err = validateAmount(amountFiat)
      setErrors((prev) => ({ ...prev, amount: err }))
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

  const initiate = async (e) => {

    e.preventDefault()
    setTouched({ phone: true, amount: true })
    if (!validate()) return

    const amountKes = Number(amountFiat)
    if (!Number.isFinite(amountKes) || amountKes <= 0) return

    setLoading(true)

    setProviderRef(null)
    setStatus(null)
    try {
      const data = await initiateLegacyMpesa({
        phone: phone.trim(),
        amountFiat: amountKes,
        amountMallcoin: mlcnsQuote,
      })

      setProviderRef(data.providerRef)
      setStatus(data.status)
      toast.success('M-Pesa prompt sent — complete on your phone')
    } catch (err) {
      toast.error(err.message || 'Buy failed')
    } finally {
      setLoading(false)
    }
  }

  const checkStatus = async () => {
    if (!providerRef) return
    try {
      const data = await getLegacyPaymentStatus(providerRef)
      setStatus(data.status)
      if (data.status === 'success') toast.success('Payment confirmed')
    } catch (err) {
      toast.error(err.message || 'Status check failed')
    }
  }

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
          <span className="text-cyan-400">KSh {(buyPriceKes ?? TOKENS.mallcoin.basePriceKes).toFixed(4)} / MLCNS</span>
        </p>
      </div>

      <div className="flex gap-2">
        {['Amount', 'Pay', 'Credit'].map((label, i) => (
          <div
            key={label}
            className={`flex-1 rounded-xl py-2 text-center text-xs font-semibold border ${
              i === 0 ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 text-slate-500'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
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

          <div className={`mt-2 flex items-center gap-2 rounded-2xl border px-4 py-3 transition-colors ${
            touched.phone && errors.phone
              ? 'border-red-500 bg-red-950/20'
              : 'border-slate-700 bg-slate-950'
          }`}>
            <Smartphone className="w-5 h-5 text-slate-500" />
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                if (touched.phone) {
                  setErrors((prev) => ({ ...prev, phone: validatePhone(e.target.value) }))
                }
              }}
              onBlur={() => handleBlur('phone')}
              placeholder="2547XXXXXXXX"
              className="flex-1 bg-transparent outline-none text-white"
              aria-invalid={touched.phone && !!errors.phone}
              aria-describedby="phone-error"
            />
          </div>
          {touched.phone && errors.phone && (
            <p id="phone-error" className="mt-2 text-sm text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {errors.phone}
            </p>
          )}
        </label>

        <label className="block text-sm text-slate-400">
          Receive (MLCNS)

          <div className="mt-2 text-xs text-slate-500">
            Estimated: <span className="font-mono text-cyan-400">{mlcnsQuote.toFixed(6)} MLCNS</span>
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

        <label className="block text-sm text-slate-400">
          Pay (KES)


          <input
            type="number"
            min="1"
            value={amountFiat}
            onChange={(e) => {
              setAmountFiat(e.target.value)
              if (touched.amount) {
                setErrors((prev) => ({ ...prev, amount: validateAmount(e.target.value) }))
              }
            }}
            onBlur={() => handleBlur('amount')}
            className={`mt-2 w-full rounded-2xl border px-4 py-3 text-white transition-colors ${
              touched.amount && errors.amount
                ? 'border-red-500 bg-red-950/20'
                : 'border-slate-700 bg-slate-950'
            }`}
            aria-invalid={touched.amount && !!errors.amount}
            aria-describedby="amount-error"
          />
          {touched.amount && errors.amount && (
            <p id="amount-error" className="mt-2 text-sm text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {errors.amount}
            </p>
          )}
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-2xl bg-blue-600 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
          Buy with M-Pesa
        </button>
      </motion.form>

      {providerRef && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm space-y-2">
          <p>
            Reference: <span className="font-mono text-emerald-400">{providerRef}</span>
          </p>
          <p>
            Status:{' '}
            <span className={`font-medium ${
              status === 'success' ? 'text-emerald-400' : status === 'failed' ? 'text-red-400' : 'text-amber-400'
            }`}>
              {status || 'pending'}
            </span>
          </p>
          <button type="button" onClick={checkStatus} className="text-cyan-400 hover:underline">
            Refresh status
          </button>
        </div>
      )}
    </div>
  )
}

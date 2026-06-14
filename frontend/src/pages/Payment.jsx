import { useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, Loader2, Smartphone, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiFetch } from '../lib/api'
import { appConfig } from '../config/app'

export default function Payment() {
  const [phone, setPhone] = useState('')
  const [amountFiat, setAmountFiat] = useState('')
  const [amountToken, setAmountToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [providerRef, setProviderRef] = useState(null)
  const [status, setStatus] = useState(null)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})

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
      setErrors((prev) => ({ ...prev, phone: validatePhone(phone) }))
    }
    if (field === 'amount') {
      setErrors((prev) => ({ ...prev, amount: validateAmount(amountFiat) }))
    }
  }

  const initiate = async (e) => {
    e.preventDefault()
    setTouched({ phone: true, amount: true })
    if (!validate()) return

    setLoading(true)
    setProviderRef(null)
    setStatus(null)
    try {
      const data = await apiFetch('/payment/mpesa/initiate', {
        method: 'POST',
        body: JSON.stringify({
          method: 'mpesa',
          phone: phone.trim(),
          amountFiat: Number(amountFiat),
          amountMallcoin: Number(amountToken || amountFiat),
        }),
      })
      setProviderRef(data.providerRef)
      setStatus(data.status)
      toast.success('Payment initiated — complete on your phone')
    } catch (err) {
      toast.error(err.message || 'Payment failed')
    } finally {
      setLoading(false)
    }
  }

  const checkStatus = async () => {
    if (!providerRef) return
    try {
      const data = await apiFetch(
        `/payment/mpesa/status?providerRef=${encodeURIComponent(providerRef)}`
      )
      setStatus(data.status)
      if (data.status === 'success') toast.success('Payment confirmed')
    } catch (err) {
      toast.error(err.message || 'Status check failed')
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black">Payments</h1>
        <p className="text-slate-400 mt-2">
          Buy {appConfig.chain.displayDenom} via M-Pesa. Funds are credited after provider confirmation.
        </p>
      </div>

      <motion.form
        onSubmit={initiate}
        className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        noValidate
      >
        <label className="block text-sm text-slate-400">
          M-Pesa phone
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
              aria-describedby="pay-phone-error"
            />
          </div>
          {touched.phone && errors.phone && (
            <p id="pay-phone-error" className="mt-2 text-sm text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {errors.phone}
            </p>
          )}
        </label>

        <label className="block text-sm text-slate-400">
          Amount (KES)
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
            aria-describedby="pay-amount-error"
          />
          {touched.amount && errors.amount && (
            <p id="pay-amount-error" className="mt-2 text-sm text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {errors.amount}
            </p>
          )}
        </label>

        <label className="block text-sm text-slate-400">
          {appConfig.chain.displayDenom} to credit (optional)
          <input
            type="number"
            min="0"
            step="any"
            value={amountToken}
            onChange={(e) => setAmountToken(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-2xl bg-blue-600 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <CreditCard className="w-5 h-5" />
          )}
          Pay with M-Pesa
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
          <button
            type="button"
            onClick={checkStatus}
            className="text-blue-400 hover:underline"
          >
            Refresh status
          </button>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Coins,
  Loader2,
  Smartphone,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { loadWallet } from '../core/wallet/walletUtils'
import { fetchMlcnsBalance } from '../core/wallet/mallcoinApi'
import {
  fetchBuyPrice,
  mlcnsForKes,
  kesForMlcns,
  reserveBuyQuote,
  initiateBuyMpesa,
  getBuyStatus,
  creditBuyPurchase,
} from '../core/buy/buyApi'
import { TOKENS } from '../config/tokens'

const STEPS = ['Amount', 'Pay', 'Credit']

export default function BuyMlcns() {
  const [wallet, setWallet] = useState(null)
  const [balance, setBalance] = useState(0)
  const [price, setPrice] = useState(null)
  const [kesAmount, setKesAmount] = useState('')
  const [mlcnsAmount, setMlcnsAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [quoteId, setQuoteId] = useState(null)
  const [paymentId, setPaymentId] = useState(null)
  const [orderStatus, setOrderStatus] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [liquidityInfo, setLiquidityInfo] = useState(null)

  const buyPrice = price?.buyPriceKes ?? TOKENS.mallcoin.basePriceKes

  const kesValue = useMemo(() => {
    const n = Number(kesAmount)
    return Number.isFinite(n) && n > 0 ? n : 0
  }, [kesAmount])

  const mlcnsValue = useMemo(() => {
    const n = Number(mlcnsAmount)
    if (Number.isFinite(n) && n > 0) return n
    if (kesValue > 0) return mlcnsForKes(kesValue, buyPrice)
    return 0
  }, [mlcnsAmount, kesValue, buyPrice])

  const load = async () => {
    setLoading(true)
    try {
      const w = loadWallet()
      if (!w) {
        setWallet(null)
        return
      }
      setWallet(w)
      const [bal, p] = await Promise.all([
        fetchMlcnsBalance(w.address),
        fetchBuyPrice(),
      ])
      setBalance(Number(bal.availableDisplay || 0))
      setPrice(p)
    } catch (e) {
      toast.error(e.message || 'Failed to load buy data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleKesChange = (v) => {
    setKesAmount(v)
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) {
      setMlcnsAmount(mlcnsForKes(n, buyPrice).toFixed(6))
    } else {
      setMlcnsAmount('')
    }
  }

  const handleMlcnsChange = (v) => {
    setMlcnsAmount(v)
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) {
      setKesAmount(kesForMlcns(n, buyPrice).toFixed(2))
    } else {
      setKesAmount('')
    }
  }

  const startPurchase = async (e) => {
    e.preventDefault()
    if (!wallet) {
      toast.error('Create a wallet first')
      return
    }
    if (!phone.trim() || kesValue <= 0 || mlcnsValue <= 0) {
      toast.error('Enter phone and amount')
      return
    }

    setBusy(true)
    try {
      const quote = await reserveBuyQuote({
        walletAddress: wallet.address,
        phone: phone.trim(),
        mlcnsAmount: mlcnsValue,
        kesAmount: kesValue,
      })
      setQuoteId(quote.quoteId)

      const mpesa = await initiateBuyMpesa({
        quoteId: quote.quoteId,
        phone: phone.trim(),
        amountKes: kesValue,
        description: `Buy ${mlcnsValue.toFixed(4)} MLCNS`,
      })
      setPaymentId(mpesa.paymentId)
      setOrderStatus(mpesa.status || 'initiated')
      setStep(1)
      toast.success('Complete payment on your phone')
    } catch (err) {
      toast.error(err.message || 'Could not start purchase')
    } finally {
      setBusy(false)
    }
  }

  const pollAndCredit = async () => {
    if (!paymentId || !quoteId || !wallet) return
    setBusy(true)
    try {
      const st = await getBuyStatus(paymentId)
      setOrderStatus(st.status)

      if (st.status === 'credited') {
        setStep(2)
        setTxHash(st.txHash)
        toast.success('Already credited')
        await load()
      } else if (st.status === 'confirmed') {
        const credit = await creditBuyPurchase({
          quoteId,
          walletAddress: wallet.address,
        })
        setTxHash(credit.txHash)
        setLiquidityInfo(credit.liquidity || null)
        setStep(2)
        toast.success('MLCNS credited to your wallet')
        await load()
      } else if (st.status === 'failed') {
        toast.error(st.reason || 'Payment failed')
      } else {
        toast('Still pending — try again shortly')
      }
    } catch (err) {
      toast.error(err.message || 'Status check failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
      </div>
    )
  }

  if (!wallet) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <Coins className="w-14 h-14 text-slate-500 mx-auto" />
        <h1 className="text-2xl font-bold">Buy MLCNS</h1>
        <p className="text-slate-400">You need a Mallchain wallet to receive Mallcoins.</p>
        <Link to="/wallet/create" className="inline-block px-6 py-3 rounded-xl bg-cyan-600 font-semibold">
          Create wallet
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link to="/buy" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-3">
          <ArrowLeft className="w-4 h-4" /> Buy
        </Link>
        <h1 className="text-3xl font-black">Buy MLCNS</h1>
        <p className="text-slate-400 mt-1">
          Balance: {balance.toFixed(4)} {TOKENS.mallcoin.symbol} · Buy rate{' '}
          <span className="text-cyan-400">KSh {buyPrice.toFixed(4)}</span> / MLCNS
        </p>
      </div>

      <div className="flex gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`flex-1 rounded-xl py-2 text-center text-xs font-semibold border ${
              step >= i ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 text-slate-500'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {step === 2 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center"
        >
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold">Purchase complete</h2>
          <p className="text-slate-400 mt-2">
            {mlcnsValue.toFixed(4)} MLCNS credited to your wallet
          </p>
          {liquidityInfo ? (
            <div className="mt-4 rounded-2xl bg-slate-950 border border-cyan-600/30 p-4 text-sm text-slate-200">
              <p className="font-semibold text-white">Fiat routed into liquidity pool</p>
              <p>Pool: {liquidityInfo.pool?.name || 'MLCN/KES'}</p>
              <p>LP tokens: {liquidityInfo.lpTokens}</p>
              <p>Pool share: {liquidityInfo.shareOfPool}%</p>
            </div>
          ) : (
            <p className="text-slate-500 mt-4">Fiat deposit routing to liquidity pool is enabled.</p>
          )}
          {txHash && (
            <p className="font-mono text-xs text-cyan-400 mt-4 break-all">{txHash}</p>
          )}
          <Link to="/wallet" className="inline-block mt-6 text-cyan-400 hover:underline">
            View wallet
          </Link>
        </motion.div>
      ) : step === 1 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <p className="text-white font-semibold">Complete M-Pesa on your phone</p>
          <p className="text-sm text-slate-400">
            Quote: <span className="font-mono text-slate-300">{quoteId}</span>
          </p>
          <p className="text-sm text-slate-400">
            Payment ID: <span className="font-mono text-slate-300">{paymentId}</span>
          </p>
          <p className="text-sm">
            Status: <span className="font-medium text-amber-300">{orderStatus || 'pending'}</span>
          </p>
          <button
            type="button"
            onClick={pollAndCredit}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-cyan-600 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            Confirm payment & credit MLCNS
          </button>
          <p className="text-xs text-slate-500 text-center">
            In sandbox, M-Pesa may auto-confirm. Tap above after paying.
          </p>
        </div>
      ) : (
        <motion.form
          onSubmit={startPurchase}
          className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <label className="text-sm text-slate-400">Wallet (receives MLCNS)</label>
            <p className="font-mono text-xs text-white mt-1 break-all bg-slate-800 rounded-lg p-3">
              {wallet.address}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm text-slate-400">
              Pay (KES)
              <input
                type="number"
                min="1"
                value={kesAmount}
                onChange={(e) => handleKesChange(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              />
            </label>
            <label className="block text-sm text-slate-400">
              Receive (MLCNS)
              <input
                type="number"
                min="0"
                step="0.000001"
                value={mlcnsAmount}
                onChange={(e) => handleMlcnsChange(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              />
            </label>
          </div>

          <label className="block text-sm text-slate-400">
            M-Pesa phone
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
              <Smartphone className="w-5 h-5 text-slate-500" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2547XXXXXXXX"
                className="flex-1 bg-transparent outline-none text-white"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coins className="w-5 h-5" />}
            Buy with M-Pesa
          </button>
        </motion.form>
      )}
    </div>
  )
}

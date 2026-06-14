import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { getBuyStatus, creditBuyPurchase } from '../core/buy/buyApi'
import { loadWallet } from '../core/wallet/walletUtils'

export default function BuyStatus() {
  const [paymentId, setPaymentId] = useState('')
  const [quoteId, setQuoteId] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [liquidityInfo, setLiquidityInfo] = useState(null)

  const check = async () => {
    if (!paymentId.trim()) {
      toast.error('Enter payment ID')
      return
    }
    setLoading(true)
    try {
      const data = await getBuyStatus(paymentId.trim())
      setStatus(data)
      toast.success(`Status: ${data.status}`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const claimCredit = async () => {
    const w = loadWallet()
    if (!w) {
      toast.error('Load your wallet first')
      return
    }
    if (!quoteId.trim()) {
      toast.error('Quote ID required to credit')
      return
    }
    setLoading(true)
    try {
      const data = await creditBuyPurchase({
        quoteId: quoteId.trim(),
        walletAddress: w.address,
      })
      setLiquidityInfo(data.liquidity || null)
      toast.success(`Credited · ${data.txHash || 'ok'}`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <Link to="/buy" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-3">
          <ArrowLeft className="w-4 h-4" /> Buy
        </Link>
        <h1 className="text-3xl font-black">Order status</h1>
        <p className="text-slate-400 mt-2">Track MLCNS buy orders and claim credit after M-Pesa confirms.</p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
        <label className="block text-sm text-slate-400">
          Payment ID (from M-Pesa step)
          <input
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-white"
            placeholder="PAY… or CheckoutRequestID"
          />
        </label>
        <button
          type="button"
          onClick={check}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-slate-700 font-semibold flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          Check status
        </button>

        {status && (
          <div className="rounded-xl bg-slate-800 p-4 text-sm">
            <p>
              Status: <strong className="text-white">{status.status}</strong>
            </p>
            {status.reason && <p className="text-red-400 mt-1">{status.reason}</p>}
          </div>
        )}

        {liquidityInfo && (
          <div className="rounded-xl bg-slate-800 p-4 text-sm text-slate-200">
            <p className="font-semibold text-white">Liquidity pool routing</p>
            <p>Pool: {liquidityInfo.pool?.name || 'MLCN/KES'}</p>
            <p>LP tokens: {liquidityInfo.lpTokens}</p>
            <p>Pool share: {liquidityInfo.shareOfPool}%</p>
          </div>
        )}

        <hr className="border-slate-700" />

        <label className="block text-sm text-slate-400">
          Quote ID (to credit MLCNS after confirmed)
          <input
            value={quoteId}
            onChange={(e) => setQuoteId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-white"
          />
        </label>
        <button
          type="button"
          onClick={claimCredit}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-cyan-600 font-semibold disabled:opacity-50"
        >
          Credit MLCNS to my wallet
        </button>
      </div>
    </div>
  )
}

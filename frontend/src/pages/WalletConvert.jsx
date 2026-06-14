import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Gift, Loader2, RefreshCw, Sparkles, ShieldCheck, Clock3, CheckCircle2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { loadWallet } from '../core/wallet/walletUtils'
import {
  fetchMallpointsBalance,
  fetchMlcnsBalance,
  convertMallpointsToMlcns,
  syncMallpointsProfile,
} from '../core/wallet/mallcoinApi'
import { TOKENS } from '../config/tokens'

export default function WalletConvert() {
  const [wallet, setWallet] = useState(null)
  const [points, setPoints] = useState(0)
  const [chainPoints, setChainPoints] = useState(0)
  const [dbPoints, setDbPoints] = useState(0)
  const [mlcns, setMlcns] = useState(0)
  const [pointPriceKes, setPointPriceKes] = useState(TOKENS.mallpoints.basePriceKes)
  const [conversionStatus, setConversionStatus] = useState(null)
  const [badge, setBadge] = useState({ exists: false })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [converting, setConverting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const w = loadWallet()
      if (!w) return
      setWallet(w)
      const [p, m] = await Promise.all([
        fetchMallpointsBalance(w.address),
        fetchMlcnsBalance(w.address),
      ])
      setPoints(p.balance)
      setChainPoints(p.chainPoints ?? 0)
      setDbPoints(p.dbPoints ?? 0)
      setPointPriceKes(p.pointPriceKes ?? TOKENS.mallpoints.basePriceKes)
      setConversionStatus(p.conversionStatus ?? null)
      setBadge(p.badge || { exists: false })
      setMlcns(Number(m.availableDisplay || 0))
      setSyncMessage('')
    } catch (e) {
      toast.error(e.message || 'Failed to load balances')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSync = async () => {
    if (!wallet) return
    setSyncing(true)
    setSyncMessage('')
    try {
      const sync = await syncMallpointsProfile(wallet.address)
      setPoints(sync.balance)
      setChainPoints(sync.chainPoints)
      setDbPoints(sync.dbPoints)
      setPointPriceKes(sync.pointPriceKes)
      setConversionStatus(sync.conversionStatus)
      setBadge(sync.badge || { exists: false })
      setSyncMessage('Marketplace profile synced successfully.')
      toast.success('Marketplace profile synced')
    } catch (e) {
      setSyncMessage(e.message || 'Failed to sync marketplace profile')
      toast.error(e.message || 'Failed to sync marketplace profile')
    } finally {
      setSyncing(false)
    }
  }

  const handleConvert = async () => {
    if (!wallet) return
    setConverting(true)
    try {
      const sync = await syncMallpointsProfile(wallet.address)
      setPoints(sync.balance)
      setChainPoints(sync.chainPoints)
      setDbPoints(sync.dbPoints)
      setPointPriceKes(sync.pointPriceKes)
      setConversionStatus(sync.conversionStatus)
      setBadge(sync.badge || { exists: false })

      const canConvert = sync.conversionStatus?.canConvert
      if (!canConvert) {
        throw new Error(sync.conversionStatus?.reason || 'Conversion is not available today')
      }

      const result = await convertMallpointsToMlcns(wallet.address)
      toast.success(`Converted ${result.convertedPoints} Mallpoints to MLCNS`)
      await load()
    } catch (e) {
      toast.error(e.message || 'Conversion failed')
    } finally {
      setConverting(false)
    }
  }

  const estimatedMallcoins = points
  const estimatedPointValue = points * pointPriceKes
  const canConvert = conversionStatus?.canConvert && points > 0
  const nextAllowedDate = conversionStatus?.nextAllowedConversionAt
    ? new Date(conversionStatus.nextAllowedConversionAt).toLocaleDateString()
    : null

  if (!wallet && !loading) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <p className="text-slate-400 mb-6">Create a wallet first to convert Mallpoints.</p>
        <Link to="/wallet/create" className="text-cyan-400 hover:underline">Create wallet</Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black">Convert Mallpoints</h1>
          <p className="text-slate-400 mt-1 max-w-2xl">
            Mallpoints are earned for marketplace activity and convert to MLCNS for spending. Sync your
            marketplace profile before conversion to verify badge status and your allowed date.
          </p>
        </div>
        <Link to="/wallet" className="inline-flex items-center justify-center rounded-2xl bg-slate-800 px-4 py-3 text-slate-200 transition hover:bg-slate-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
      </div>

      <motion.div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-slate-400 uppercase text-xs tracking-[0.3em]">Mallpoints</p>
                <div className="mt-3 flex items-end gap-3">
                  <p className="text-4xl font-black text-white">{points.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</p>
                </div>
                <p className="mt-3 text-slate-500 text-sm">
                  Chain {chainPoints.toLocaleString()} · rewards {dbPoints.toLocaleString()}
                </p>
                <p className="mt-4 text-slate-500 text-sm">
                  Estimated value: <span className="font-semibold text-slate-100">KSh {estimatedPointValue.toFixed(2)}</span>
                </p>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-slate-400 uppercase text-xs tracking-[0.3em]">MLCNS balance</p>
                <p className="mt-3 text-4xl font-black text-white">{mlcns.toFixed(4)}</p>
                <p className="mt-4 text-slate-500 text-sm">
                  Mallcoins are electronic cash and can be spent directly on the marketplace.
                </p>
                <p className="mt-4 text-slate-500 text-sm">
                  Base reference: <span className="font-semibold text-slate-100">KSh {TOKENS.mallcoin.basePriceKes.toFixed(2)}</span>
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-slate-500 uppercase text-xs tracking-[0.3em]">Conversion window</p>
                    <p className="mt-2 text-white font-semibold">{conversionStatus?.windowRule || 'Fetching conversion rules…'}</p>
                  </div>
                  {conversionStatus?.canConvert ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200 text-xs">
                      <CheckCircle2 className="w-4 h-4" /> Eligible
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-amber-200 text-xs">
                      <AlertTriangle className="w-4 h-4" /> Not eligible
                    </span>
                  )}
                </div>
                <div className="space-y-2 text-sm text-slate-400">
                  <p>{conversionStatus?.reason || 'Sync to see the latest conversion eligibility.'}</p>
                  {nextAllowedDate && (
                    <p>
                      Next allowed conversion: <span className="text-slate-100">{nextAllowedDate}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-slate-500 uppercase text-xs tracking-[0.3em]">Badge status</p>
                    <p className="mt-2 text-white font-semibold">
                      {badge.exists ? badge.badgeType || 'Badge holder' : 'No badge found'}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-cyan-200 text-xs">
                    <ShieldCheck className="w-4 h-4" /> Verified
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  Badge holders can convert on the 15th of each month. Non-badge holders can convert only on December 27th unless developer override is enabled.
                </p>
                <p className="text-sm text-slate-400">
                  Sync will verify your marketplace profile and badge status before conversion is attempted.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center justify-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Sync marketplace profile
              </button>
              <button
                type="button"
                onClick={handleConvert}
                disabled={converting || !canConvert || points <= 0}
                className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 font-semibold text-white transition disabled:opacity-50"
              >
                {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                Convert Mallpoints → MLCNS
              </button>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-400">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-200">Conversion preview</p>
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">1:1</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Mallpoints to convert</p>
                  <p className="mt-2 text-xl font-bold text-white">{estimatedMallcoins.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} MP</p>
                </div>
                <div className="rounded-2xl bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Expected MLCNS</p>
                  <p className="mt-2 text-xl font-bold text-white">{estimatedMallcoins.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} MLCNS</p>
                </div>
              </div>
              <p className="mt-4 text-slate-500">
                Mallpoints are converted at the current conversion policy. If the window is closed, the request will be blocked and the page will explain why.
              </p>
            </div>

            {syncMessage && (
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-200">
                <p>{syncMessage}</p>
              </div>
            )}

            <button
              type="button"
              onClick={load}
              className="w-full flex items-center justify-center gap-2 py-3 text-slate-400 hover:text-white text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Refresh balances
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}

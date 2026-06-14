import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
 import { Wallet as WalletIcon, Copy, Plus, ArrowUp, ArrowDown, RefreshCw, Loader, ShieldCheck, Lock, CircleDollarSign, CalendarDays, BarChart3, AlertTriangle, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import {
  fetchMlcnsBalance,
  fetchMallpointsBalance,
  fetchMlcnsPrice,
  fetchFaucetStatus,
  requestFaucetMlcns,
} from '../core/wallet/mallcoinApi'
import { TOKENS, kesFromMlcns } from '../config/tokens'
import { initiateWithdrawMpesa } from '../core/withdraw/withdrawApi'

export default function Wallet() {
  const [loading, setLoading] = useState(true)
  const [wallet, setWallet] = useState(null)
  const [mlcnsBalance, setMlcnsBalance] = useState(0)
  const [mallpoints, setMallpoints] = useState(0)
  const [mallpointsChain, setMallpointsChain] = useState(0)
  const [mallpointsDb, setMallpointsDb] = useState(0)
  const [faucetEnabled, setFaucetEnabled] = useState(false)
  const [faucetLoading, setFaucetLoading] = useState(false)
  const [priceKes, setPriceKes] = useState(TOKENS.mallcoin.basePriceKes)
  const [pointPriceKes, setPointPriceKes] = useState(TOKENS.mallpoints.basePriceKes)
  const [mlcnsProfile, setMlcnsProfile] = useState(null)
  const [conversionWindow, setConversionWindow] = useState(null)
  const [conversionStatus, setConversionStatus] = useState(null)
  const [badge, setBadge] = useState({ exists: false })
  const [lastConversionAt, setLastConversionAt] = useState(null)
  const [walletAddress, setWalletAddress] = useState('')
  const [showKeystore, setShowKeystore] = useState(false)
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    const savedWallet = localStorage.getItem('wallet')
    if (savedWallet) {
      const walletData = JSON.parse(savedWallet)
      setWallet(walletData)
      setWalletAddress(walletData.address)
      fetchBalances(walletData.address)
    } else {
      setLoading(false)
    }
  }, [])

  const fetchBalances = async (address) => {
    setLoading(true)
    setFetchError(null)
    try {
      const [mlcns, points, price, faucet] = await Promise.all([
        fetchMlcnsBalance(address),
        fetchMallpointsBalance(address),
        fetchMlcnsPrice().catch(() => null),
        fetchFaucetStatus().catch(() => ({ enabled: false })),
      ])
      setMlcnsBalance(Number(mlcns.availableDisplay || 0))
      setMallpoints(points.balance)
      setMallpointsChain(points.chainPoints ?? 0)
      setMallpointsDb(points.dbPoints ?? 0)
      setConversionWindow(points.conversionWindow || null)
      setConversionStatus(points.conversionStatus || null)
      setBadge(points.badge || { exists: false })
      setPointPriceKes(points.pointPriceKes || TOKENS.mallpoints.basePriceKes)
      setLastConversionAt(points.lastConversionAt || null)
      setFaucetEnabled(Boolean(faucet?.enabled && faucet?.configured))
      setMlcnsProfile(price)
      const mid = Number(price?.market?.midPriceKes || 0)
      if (mid > 0) setPriceKes(mid)
    } catch (error) {
      console.error('Error fetching balances:', error)
      setFetchError('Unable to load wallet balances. Please check your connection.')
      setMlcnsBalance(0)
      setMallpoints(0)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const refreshBalances = () => {
    if (walletAddress) {
      fetchBalances(walletAddress)
      toast.success('Balances refreshed')
    }
  }

  const requestTestMlcns = async () => {
    if (!walletAddress) return
    setFaucetLoading(true)
    try {
      const result = await requestFaucetMlcns(walletAddress)
      toast.success(`Received ${result.transfer?.amountMlcns ?? 'test'} MLCNS`)
      await fetchBalances(walletAddress)
    } catch (e) {
      toast.error(e.message || 'Faucet failed')
    } finally {
      setFaucetLoading(false)
    }
  }

  const totalKes = kesFromMlcns(mlcnsBalance, priceKes) + mallpoints * pointPriceKes

  if (!wallet) {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <WalletIcon className="w-16 h-16 text-slate-500 mx-auto mb-6" />
            <h1 className="text-4xl font-black text-white mb-4">
              My Wallet
            </h1>
            <p className="text-slate-400 mb-8">
              Create or import a wallet to get started
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <a
                href="/wallet/create"
                className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-6 rounded-xl hover:from-cyan-600 hover:to-blue-600 transition-all"
              >
                Create New Wallet
              </a>
              <a
                href="/wallet/restore"
                className="bg-slate-800 border border-slate-700 text-white font-medium py-3 px-6 rounded-xl hover:bg-slate-700 transition-colors"
              >
                Import Wallet
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-black text-white mb-2">
            My Wallet
          </h1>
          <p className="text-slate-400">
            Manage your wallet and assets
          </p>
        </motion.div>

        {/* Error Banner */}
        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-200 text-sm flex-1">{fetchError}</p>
            <button
              onClick={refreshBalances}
              className="text-red-200 text-sm font-medium hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Balance Card */}
        <div className="mb-8 p-8 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 backdrop-blur-xl">
          <div className="text-slate-400 text-sm mb-2">Total Balance</div>
          <div className="text-5xl font-black text-white mb-2">
            KSh {totalKes.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-slate-400 text-sm mb-6">
            {mlcnsBalance.toFixed(4)} MLCNS @ {priceKes.toFixed(2)} KES · {mallpoints.toFixed(2)} Mallpoints
          </p>
          <div className="flex gap-4 flex-wrap">
            <Link
              to="/buy/mlcns"
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold py-3 px-6 rounded-xl hover:opacity-90 transition-all"
            >
              Buy MLCNS
            </Link>
            <Link
              to="/wallet/send"
              className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-6 rounded-xl hover:from-cyan-600 hover:to-blue-600 transition-all"
            >
              <ArrowUp className="w-5 h-5" />
              Send
            </Link>
            <Link
              to="/wallet/convert"
              aria-label="Convert mlpts to MLCNS"
              className="flex items-center gap-3 bg-slate-700 text-white font-semibold py-3 px-8 rounded-xl text-lg transition-all hover:bg-black hover:shadow-[0_0_26px_rgba(255,215,0,0.95)] focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <span className="uppercase">mlpts</span>
              <ArrowRight className="w-5 h-5 text-amber-300" />
              <span className="ml-1">MLCNS</span>
            </Link>
            <button
              onClick={refreshBalances}
              className="flex items-center gap-2 bg-slate-700 text-white font-medium py-3 px-6 rounded-xl hover:bg-slate-600 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Refresh
            </button>
            {faucetEnabled && (
              <button
                type="button"
                onClick={requestTestMlcns}
                disabled={faucetLoading}
                className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/40 text-amber-200 font-medium py-3 px-6 rounded-xl hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                {faucetLoading ? (
                  <Loader className="w-5 h-5 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
                Get test MLCNS
              </button>
            )}
          </div>
        </div>

        {/* Wallet Address */}
        <div className="mb-8 p-6 rounded-3xl border border-slate-800 bg-slate-900/70 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">Wallet Address</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-slate-800 rounded-xl p-4 font-mono text-sm text-white break-all">
              {walletAddress}
            </div>
            <button
              onClick={() => copyToClipboard(walletAddress)}
              className="p-4 rounded-xl bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
            >
              <Copy className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mallcoin details */}
        <MallcoinDetailsCard
          profile={mlcnsProfile}
          conversionWindow={conversionWindow}
          conversionStatus={conversionStatus}
          badge={badge}
          pointPriceKes={pointPriceKes}
          priceKes={priceKes}
          mallpoints={mallpoints}
          lastConversionAt={lastConversionAt}
          mlcnsBalance={mlcnsBalance}
          totalKes={totalKes}
          walletAddress={walletAddress}
          onWithdrawComplete={() => fetchBalances(walletAddress)}
        />

        {/* Balances */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-white mb-4">Your utilities</h3>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 backdrop-blur-xl overflow-hidden divide-y divide-slate-800">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader className="w-8 h-8 text-slate-500 animate-spin" />
              </div>
            ) : (
              <>
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold">MLCNS (Mallcoins)</div>
                    <div className="text-slate-400 text-sm">Electronic cash · momentum pricing</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">{mlcnsBalance.toFixed(4)}</div>
                    <div className="text-slate-400 text-sm">≈ KSh {kesFromMlcns(mlcnsBalance, priceKes).toFixed(2)}</div>
                  </div>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold">Mallpoints</div>
                    <div className="text-slate-400 text-sm">
                      On-chain {mallpointsChain.toLocaleString()} · app rewards {mallpointsDb.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">{mallpoints.toLocaleString()}</div>
                    <Link to="/wallet/convert" className="text-cyan-400 text-sm hover:underline">
                      Convert →
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Wallet Info */}
        <div className="p-6 rounded-3xl border border-slate-800 bg-slate-900/70 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">Wallet Details</h3>
          <div className="space-y-4">
            <div>
              <div className="text-slate-400 text-sm mb-1">Public Key</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-800 rounded-lg p-3 font-mono text-sm text-white break-all">
                  {wallet.publicKey || 'N/A'}
                </code>
                {wallet.publicKey && (
                  <button
                    onClick={() => copyToClipboard(wallet.publicKey)}
                    className="text-slate-500 hover:text-cyan-400 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-sm mb-1">Security Status</div>
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-green-200 font-semibold mb-1">✓ Private Key Secure</p>
                    <p className="text-green-200/70 text-sm">
                      Your private key is never stored on disk. It exists only in memory during signing and is immediately cleared afterward.
                    </p>
                    <p className="text-green-200/70 text-sm mt-2">
                      Keep your recovery phrase safe and secure. You'll need it to sign transactions.
                    </p>
                  </div>
                </div>
              </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setShowKeystore(true)} className="px-3 py-2 rounded bg-slate-800 text-slate-200">Manage Keystore</button>
                </div>
            </div>
          </div>
        </div>
      </div>
      {showKeystore && (
        <KeystoreModal isOpen={showKeystore} onClose={() => setShowKeystore(false)} address={walletAddress} />
      )}
    </div>
  )
}

// Render Keystore modal at root of Wallet page
export function WalletKeystoreWrapper({ address, visible, onClose }) {
  return <KeystoreModal isOpen={visible} onClose={onClose} address={address} />
}


// Add Keystore modal import at bottom to avoid top-level changes
import KeystoreModal from '../components/KeystoreModal'


function MallcoinDetailsCard({
  profile,
  conversionWindow,
  conversionStatus,
  badge,
  pointPriceKes,
  priceKes,
  mallpoints,
  lastConversionAt,
  mlcnsBalance,
  totalKes,
  walletAddress,
  onWithdrawComplete,
}) {
  const market = profile?.market || {}
  const currentPrice = Number(priceKes || profile?.basePriceKes || TOKENS.mallcoin.basePriceKes)
  const pointPrice = Number(pointPriceKes || TOKENS.mallpoints.basePriceKes)
  const canConvert = conversionStatus?.canConvert
  const nextAllowed = conversionStatus?.nextAllowedConversionAt
    ? new Date(conversionStatus.nextAllowedConversionAt).toLocaleDateString()
    : null
  const statusText = conversionStatus?.reason || 'Conversion eligibility not loaded.'

  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawPhone, setWithdrawPhone] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)

  const estimatedKes = Number(withdrawAmount || 0) > 0 ? kesFromMlcns(Number(withdrawAmount), currentPrice) : 0

  const rows = [
    { label: 'Wallet holdings', value: `${mlcnsBalance.toFixed(4)} MLCNS` },
    { label: 'Wallet value', value: `KSh ${Number(totalKes || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { label: 'Mallpoints total', value: `${mallpoints.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} MP` },
    { label: 'Mallpoints value', value: `KSh ${(mallpoints * pointPrice).toFixed(2)}` },
    { label: 'MLCNS price', value: `KSh ${currentPrice.toFixed(2)}` },
    { label: 'Point price', value: `KSh ${pointPrice.toFixed(2)}` },
    { label: 'Badge status', value: badge?.exists ? badge.badgeType || 'Badge holder' : 'No badge' },
    { label: 'Last conversion', value: lastConversionAt ? new Date(lastConversionAt).toLocaleDateString() : 'Never' },
  ]

  const handleWithdraw = async (e) => {
    e.preventDefault()
    if (!walletAddress) return toast.error('Wallet address not available')
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return toast.error('Enter amount to withdraw')
    if (Number(withdrawAmount) > mlcnsBalance) return toast.error('Withdrawal exceeds balance')
    if (!withdrawPhone) return toast.error('Enter phone number for payout')

    setWithdrawing(true)
    try {
      const resp = await initiateWithdrawMpesa({
        walletAddress,
        phone: withdrawPhone,
        amountMlcns: Number(withdrawAmount),
        amountKes: Number(estimatedKes),
      })
      toast.success(resp?.message || 'Withdrawal initiated')
      setShowWithdrawModal(false)
      setWithdrawAmount('')
      setWithdrawPhone('')
      if (onWithdrawComplete) onWithdrawComplete()
    } catch (err) {
      console.error('Withdraw failed', err)
      toast.error(err?.message || 'Withdrawal failed')
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className="mb-8 rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <CircleDollarSign className="w-5 h-5" />
            <h3 className="text-xl font-black text-white">Mallcoin detail view</h3>
          </div>
          <p className="text-slate-400 text-sm mt-2 max-w-2xl">
            Accurate Mallcoin wallet metrics and pricing. This panel shows only values sourced from the wallet and market feed, not estimated token supply.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Wallet value</p>
          <p className="text-lg font-black text-white mt-1">
            KSh {Number(totalKes || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-500 mt-1">{mlcnsBalance.toFixed(4)} MLCNS available</p>
          <p className="text-xs text-slate-500 mt-1">Badge: {badge?.exists ? badge.badgeType || 'Badge holder' : 'None'}</p>
          <p className="text-xs text-slate-500">Conversion status: {statusText}</p>
          {nextAllowed && (
            <p className="text-xs text-slate-400 mt-2">Next allowed conversion: {nextAllowed}</p>
          )}
          <div className="mt-3 flex gap-2 flex-wrap">
            <button
              onClick={() => setShowWithdrawModal(true)}
              className="flex items-center gap-2 bg-rose-600 text-white font-semibold py-2 px-4 rounded-xl hover:opacity-90 transition-all text-sm"
            >
              Withdraw
            </button>
            <button
              type="button"
              onClick={() => walletAddress && navigator.clipboard.writeText(walletAddress)}
              className="flex items-center gap-2 bg-slate-800 text-white font-medium py-2 px-4 rounded-xl hover:bg-slate-700 text-sm"
            >
              Copy address
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
            <p className="mt-2 text-sm font-semibold text-white break-words">{row.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <StatPill
          icon={<ShieldCheck className="w-4 h-4" />}
          label="Eligibility"
          value={statusText}
          tone={canConvert ? 'emerald' : 'amber'}
        />
        <StatPill
          icon={<Lock className="w-4 h-4" />}
          label="Conversion window"
          value={conversionStatus?.windowRule || 'Unavailable'}
          tone={canConvert ? 'emerald' : 'slate'}
        />
        <StatPill
          icon={<BarChart3 className="w-4 h-4" />}
          label="Market mode"
          value={market?.fallback ? 'Fallback pricing' : 'Live pricing'}
          tone={market?.fallback ? 'amber' : 'cyan'}
        />
      </div>

      <p className="mt-4 text-xs text-slate-500">
        The values shown here are based on the market feed and your wallet balance. Supply metrics are not displayed unless explicitly provided by the backend.
      </p>

      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleWithdraw} className="w-full max-w-md bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h4 className="text-lg font-bold text-white mb-3">Withdraw MLCNS as fiat</h4>
            <p className="text-sm text-slate-400 mb-4">Enter the amount of MLCNS you want to convert and receive as Mpesa cash.</p>

            <label className="block text-xs text-slate-400 mb-1">Amount (MLCNS)</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              max={mlcnsBalance}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="w-full mb-3 p-3 rounded-lg bg-slate-800 text-white"
            />

            <label className="block text-xs text-slate-400 mb-1">Phone (Mpesa)</label>
            <input
              type="tel"
              placeholder="2547XXXXXXXX"
              value={withdrawPhone}
              onChange={(e) => setWithdrawPhone(e.target.value)}
              className="w-full mb-3 p-3 rounded-lg bg-slate-800 text-white"
            />

            <div className="mb-4 text-sm text-slate-300">
              Estimated payout: <span className="font-semibold">KSh {Number(estimatedKes || 0).toFixed(2)}</span>
            </div>

            <div className="flex gap-2 justify-end flex-wrap">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={withdrawing}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold disabled:opacity-50"
              >
                {withdrawing ? 'Withdrawing…' : 'Withdraw (Mpesa)'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function StatPill({ icon, label, value, tone = 'slate' }) {
  const toneClasses = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
    slate: 'border-slate-700 bg-slate-800/70 text-slate-200',
  }

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold break-words">{value}</div>
    </div>
  )
}

function formatUnits(value) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

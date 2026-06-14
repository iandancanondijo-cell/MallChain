import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Fuel,
  Globe,
  History,
  Loader2,
  QrCode,
  RefreshCw,
  Send as SendIcon,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Plus,
  Share2,
  Wallet,
  X,
  XCircle,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { loadWallet } from '../core/wallet/walletUtils'
import SecureSigningModal from '../components/SecureSigningModal'
import { withSigningKey } from '../core/wallet/secureSigner'
import { transferMlcns } from '../core/wallet/mallcoinTx'
import {
  validateRecipient,
  fetchSendContext,
  simulateTransfer,
  getRecentRecipients,
  saveRecentRecipient,
  buildPriceInsight,
  buildInviteJoinUrl,
  isAddressFormatValid,
} from '../core/wallet/sendApi'
import { TOKENS, FX_FROM_KES } from '../config/tokens'
import { appConfig } from '../config/app'

const SYMBOL = TOKENS.mallcoin.symbol
const DECIMALS = TOKENS.mallcoin.decimals

export default function Send() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [wallet, setWallet] = useState(null)
  const [balance, setBalance] = useState(0)
  const [lockedBalance, setLockedBalance] = useState(0)
  const [gasBalance, setGasBalance] = useState(null)
  const [priceInsight, setPriceInsight] = useState(null)

  const [country, setCountry] = useState('Kenya')
  const [amount, setAmount] = useState('')
  const [fiatAmount, setFiatAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [memo, setMemo] = useState('')

  const [recipientState, setRecipientState] = useState({ status: 'idle', info: null })
  const [feeEstimate, setFeeEstimate] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [preflight, setPreflight] = useState(null)

  const [isSending, setIsSending] = useState(false)
  const [txResult, setTxResult] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [chainStatus, setChainStatus] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [recentRecipients, setRecentRecipients] = useState([])
  const [showInviteQr, setShowInviteQr] = useState(false)
  const [showSigningModal, setShowSigningModal] = useState(false)

  const amountRef = useRef(amount)
  const lastNotifiedRecipient = useRef('')

  const selectedCountry = FX_FROM_KES[country] || FX_FROM_KES.Kenya
  const liveRateKes = priceInsight?.midPriceKes ?? TOKENS.mallcoin.basePriceKes
  const liveRate = liveRateKes * (selectedCountry.rate || 1)

  const amountValue = useMemo(() => {
    const n = Number(amount)
    return Number.isFinite(n) && n > 0 ? n : 0
  }, [amount])

  const fiatValue = useMemo(() => amountValue * liveRate, [amountValue, liveRate])

  const gasFeeDisplay = feeEstimate?.feeDisplay ?? null
  const gasDenom = feeEstimate?.feeDisplayDenom || appConfig.chain.displayDenom

  const canEstimateFee =
    recipientState.status === 'valid' &&
    amountValue > 0 &&
    recipient.trim() !== wallet?.address

  const loadWalletData = useCallback(async () => {
    setIsLoading(true)
    try {
      const savedWallet = loadWallet()
      if (!savedWallet) {
        navigate('/wallet/create')
        return
      }

      setWallet(savedWallet)
      setRecentRecipients(getRecentRecipients())

      const ctx = await fetchSendContext(savedWallet.address)
      setBalance(Number(ctx.balance.availableDisplay || 0))
      setLockedBalance(Number(ctx.balance.balanceDisplay || 0) - Number(ctx.balance.availableDisplay || 0))
      setGasBalance(ctx.gas)
      setPriceInsight(buildPriceInsight(ctx.price))

      const toParam = searchParams.get('to')
      const amountParam = searchParams.get('amount')
      if (toParam) setRecipient(toParam)
      if (amountParam) setAmount(String(amountParam))
    } catch (error) {
      toast.error('Failed to load wallet data')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }, [navigate, searchParams])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWalletData()
  }, [loadWalletData])

  useEffect(() => {
    const loadChainStatus = async () => {
      try {
        const response = await fetch(`${appConfig.apiBase}/api/health`)
        if (!response.ok) throw new Error('health unavailable')
        const data = await response.json()
        setChainStatus(data?.chain || null)
      } catch {
        setChainStatus(null)
      }
    }
    loadChainStatus()
    const timer = setInterval(loadChainStatus, 15000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    amountRef.current = amount
  }, [amount])

  const handleAmountChange = (value) => {
    setAmount(value)
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) {
      setFiatAmount(n > 0 ? (n * liveRate).toFixed(2) : '')
    } else {
      setFiatAmount('')
    }
  }

  const handleFiatChange = (value) => {
    setFiatAmount(value)
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0 && liveRate > 0) {
      setAmount(n > 0 ? (n / liveRate).toFixed(DECIMALS) : '')
    }
  }

  const setPercentOfBalance = (pct) => {
    const max = Math.max(0, balance)
    const next = pct >= 1 ? max : max * pct
    handleAmountChange(next > 0 ? next.toFixed(DECIMALS) : '')
  }

  useEffect(() => {
    const trimmed = recipient.trim()
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecipientState({ status: 'idle', info: null })
      return
    }

    if (trimmed === wallet?.address) {
      setRecipientState({
        status: 'invalid',
        info: { message: 'Cannot send to your own address' },
      })
      return
    }

    if (!isAddressFormatValid(trimmed)) {
      setRecipientState({
        status: 'invalid',
        info: { message: `Invalid ${appConfig.chain.prefix} address format` },
      })
      return
    }

    let cancelled = false
    setRecipientState({ status: 'checking', info: null })

    const timer = setTimeout(async () => {
      try {
        const info = await validateRecipient(trimmed)
        if (cancelled) return
        if (!info.formatValid || !info.valid) {
          setRecipientState({
            status: 'invalid',
            info: {
              ...info,
              message: info.message || 'This address is invalid.',
            },
          })
          if (lastNotifiedRecipient.current !== trimmed) {
            lastNotifiedRecipient.current = trimmed
            toast.error('Invalid recipient address', { id: 'recipient-invalid' })
          }
        } else if (!info.exists) {
          setRecipientState({
            status: 'unavailable',
            info: {
              ...info,
              message:
                'No MLCNS wallet on Mallchain for this address. Invite them to join, then send again.',
            },
          })
          if (lastNotifiedRecipient.current !== trimmed) {
            lastNotifiedRecipient.current = trimmed
            toast.error('Recipient wallet not available on chain', { id: 'recipient-unavailable' })
            setShowInviteQr(true)
          }
        } else {
          lastNotifiedRecipient.current = ''
          setRecipientState({
            status: 'valid',
            info: {
              ...info,
              exists: true,
            },
          })
        }
      } catch {
        if (!cancelled) {
          setRecipientState({
            status: 'invalid',
            info: { message: 'Could not verify address on chain' },
          })
        }
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [recipient, wallet?.address])

  useEffect(() => {
    if (!canEstimateFee) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeeEstimate(null)
      return
    }

    let cancelled = false
    setFeeLoading(true)

    const timer = setTimeout(async () => {
      try {
        const est = await simulateTransfer({
          fromAddress: wallet.address,
          toAddress: recipient.trim(),
          amountMlcns: amountValue,
          memo,
        })
        if (cancelled) return
        setPreflight(est)
        setFeeEstimate(est.feeEstimate)
      } catch {
        if (!cancelled) setFeeEstimate(null)
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }, 600)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [canEstimateFee, wallet, recipient, amountValue, memo])

  const validateForm = () => {
    if (!recipient.trim()) {
      toast.error('Enter a recipient address')
      return false
    }
    if (recipientState.status === 'unavailable') {
      toast.error('Recipient must create a wallet first — use Invite QR below')
      setShowInviteQr(true)
      return false
    }
    if (recipientState.status !== 'valid') {
      toast.error('Enter a valid recipient address with an on-chain wallet')
      return false
    }
    if (!amountValue || amountValue <= 0) {
      toast.error('Enter a valid amount')
      return false
    }
    if (amountValue > balance) {
      toast.error(`Insufficient ${SYMBOL} balance`)
      return false
    }
    if (preflight && !preflight.ok) {
      toast.error(preflight.issues[0]?.message || 'Cannot send this transfer')
      return false
    }
    if (gasBalance && !gasBalance.sufficient && (!gasFeeDisplay || gasFeeDisplay > gasBalance.display)) {
      toast.error(`Add ${gasDenom} for network gas (use Wallet faucet in dev)`)
      return false
    }
    return true
  }

  const handleStartReview = () => {
    if (!validateForm()) return
    if (!wallet?.address) {
      toast.error('Wallet required')
      return
    }
    // Show signing modal instead of proceeding directly
    setShowConfirm(true)
  }

  const handleSendWithMnemonic = async (mnemonic) => {
    if (!validateForm()) return

    setIsSending(true)
    try {
      // Use secure signer with mnemonic (key never stored, only in-memory during signing)
      await withSigningKey(mnemonic, async (privateKeyHex) => {
        const result = await transferMlcns({
          privateKeyHex,
          fromAddress: wallet.address,
          toAddress: recipient.trim(),
          amountMlcns: amountValue,
          memo: memo.slice(0, 256),
        })

        saveRecentRecipient(recipient.trim())
        setTxResult({
          success: true,
          txHash: result.txHash,
          amount: amountValue,
          recipient: recipient.trim(),
          fiat: fiatValue,
        })
      })

      setShowConfirm(false)
    } catch (e) {
      toast.error(e.message || 'Transfer failed')
    } finally {
      setIsSending(false)
    }
  }

  const handleSend = async () => {
    if (!validateForm()) return
    setShowConfirm(false)
    setShowSigningModal(true)
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied')
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
      </div>
    )
  }

  if (txResult?.success) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-3xl border border-emerald-500/30 bg-slate-900/80 p-8 text-center"
        >
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white mb-2">Transfer sent</h2>
          <p className="text-slate-400 text-sm mb-6">MLCNS moved on-chain via MsgTransferMallcoin</p>
          <div className="space-y-3 rounded-2xl bg-slate-800/80 p-5 text-left text-sm">
            <Row label="Amount" value={`${Number(txResult.amount).toFixed(6)} ${SYMBOL}`} />
            <Row label="Fiat (est.)" value={`${selectedCountry.symbol}${Number(txResult.fiat).toFixed(2)}`} />
            <Row label="To" value={txResult.recipient} mono />
            {txResult.fee != null && (
              <Row label="Gas paid" value={`~${Number(txResult.fee).toFixed(6)} ${gasDenom}`} />
            )}
            <div className="flex justify-between items-center gap-2">
              <span className="text-slate-400">Tx hash</span>
              <button
                type="button"
                onClick={() => copyToClipboard(txResult.txHash)}
                className="font-mono text-cyan-400 text-xs truncate max-w-[200px]"
              >
                {txResult.txHash.slice(0, 16)}…
              </button>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Link
              to="/wallet/transactions"
              className="flex-1 py-3 rounded-xl bg-slate-700 font-semibold text-center"
            >
              History
            </Link>
            <button
              type="button"
              onClick={() => {
                setTxResult(null)
                setRecipient('')
                setAmount('')
                setMemo('')
              }}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold"
            >
              Send again
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/wallet" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-3">
            <ArrowLeft className="w-4 h-4" /> Wallet
          </Link>
          <h1 className="text-4xl font-black text-white">
            Send <span className="text-cyan-400">{SYMBOL}</span>
          </h1>
          <p className="text-slate-400 mt-2 max-w-xl">
            Wallet-to-wallet Mallcoins on Mallchain. Fees are paid in {gasDenom}; the full amount
            reaches the recipient in {SYMBOL}.
          </p>
        </div>
        <PriceBadge insight={priceInsight} country={selectedCountry} liveRate={liveRate} liveRateKes={liveRateKes} />
      </div>

      {preflight?.issues?.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <ul className="text-sm text-amber-100 space-y-1">
            {preflight.issues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-6">
          <BalanceHeader
            balance={balance}
            locked={lockedBalance}
            gasBalance={gasBalance}
            gasDenom={gasDenom}
            fiatSymbol={selectedCountry.symbol}
            fiatValue={balance * liveRate}
            onRefresh={loadWalletData}
          />

          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Amount ({SYMBOL})</label>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.000000"
                className="w-full bg-transparent text-4xl font-black text-white outline-none"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {[0.25, 0.5, 0.75, 1].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercentOfBalance(pct)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 text-slate-200 hover:bg-cyan-500/20 hover:text-cyan-300"
                  >
                    {pct === 1 ? 'MAX' : `${pct * 100}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Local currency</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  {Object.keys(FX_FROM_KES).map((c) => (
                    <option key={c} value={c}>
                      {FX_FROM_KES[c].flag} {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">
                  Amount in {selectedCountry.code}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={fiatAmount}
                  onChange={(e) => handleFiatChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                />
              </div>
            </div>
            <p className="mt-2 text-right text-slate-400 text-sm">
              ≈ {selectedCountry.symbol}
              {fiatValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <RecipientField
            recipient={recipient}
            setRecipient={setRecipient}
            recipientState={recipientState}
            recentRecipients={recentRecipients}
            prefix={appConfig.chain.prefix}
            senderAddress={wallet?.address}
            amountValue={amountValue}
            showInviteQr={showInviteQr}
            onToggleInviteQr={() => setShowInviteQr((v) => !v)}
            onCloseInviteQr={() => setShowInviteQr(false)}
          />

          <div>
            <label className="text-sm text-slate-400 mb-1 block">Memo (optional)</label>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value.slice(0, 256))}
              placeholder="Payment reference, order ID…"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">{memo.length}/256</p>
          </div>

          <FeeAndNetworkRow
            feeLoading={feeLoading}
            gasFeeDisplay={gasFeeDisplay}
            gasDenom={gasDenom}
            amountValue={amountValue}
            chainStatus={chainStatus}
          />

          <button
            type="button"
            onClick={handleStartReview}
            disabled={isSending || !amountValue || recipientState.status !== 'valid'}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SendIcon className="w-5 h-5" />
            Review transfer
          </button>
        </section>

        <aside className="space-y-4">
          <SessionSummary
            wallet={wallet}
            amountValue={amountValue}
            fiatValue={fiatValue}
            fiatSymbol={selectedCountry.symbol}
            recipient={recipient}
            recipientState={recipientState}
            feeEstimate={feeEstimate}
            gasDenom={gasDenom}
            liveRateKes={liveRateKes}
            priceInsight={priceInsight}
          />
          <QuickLinks navigate={navigate} />
        </aside>
      </div>

      <AnimatePresence>
        {showConfirm && (
          <ConfirmModal
            amountValue={amountValue}
            fiatValue={fiatValue}
            fiatSymbol={selectedCountry.symbol}
            symbol={SYMBOL}
            recipient={recipient}
            memo={memo}
            gasFeeDisplay={gasFeeDisplay}
            gasDenom={gasDenom}
            preflight={preflight}
            isSending={isSending}
            onCancel={() => setShowConfirm(false)}
            onConfirm={handleSend}
          />
        )}
      </AnimatePresence>

      <SecureSigningModal
        isOpen={showSigningModal}
        onClose={() => setShowSigningModal(false)}
        title="Sign Transfer"
        description="Enter your recovery phrase to sign this transfer and confirm on-chain."
        onSign={handleSendWithMnemonic}
        isLoading={isSending}
      />
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <div className={`flex justify-between gap-2 ${mono ? 'flex-col' : ''}`}>
      <span className="text-slate-400">{label}</span>
      <span className={`text-white font-medium ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</span>
    </div>
  )
}

function PriceBadge({ insight, country, liveRate, liveRateKes }) {
  if (!insight) return null
  const up = insight.momentumPct >= 0
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm min-w-[200px]">
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        <Sparkles className="w-4 h-4 text-purple-400" />
        Live MLCNS price
      </div>
      <p className="text-lg font-bold text-white">
        1 {SYMBOL} = {country.symbol}
        {liveRate.toFixed(4)}
      </p>
      <p className="text-xs text-slate-500">Mid {liveRateKes.toFixed(4)} KES · Buy {insight.buyPriceKes.toFixed(4)}</p>
      <p className={`text-xs mt-1 flex items-center gap-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {up ? '+' : ''}
        {insight.momentumPct.toFixed(2)}% vs base ({insight.basePriceKes} KES)
      </p>
    </div>
  )
}

function BalanceHeader({ balance, locked, gasBalance, gasDenom, fiatSymbol, fiatValue, onRefresh }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-500">Available</p>
        <p className="text-3xl font-black text-white mt-1">
          {balance.toFixed(6)} <span className="text-cyan-400">{SYMBOL}</span>
        </p>
        <p className="text-slate-500 text-sm mt-1">
          ≈ {fiatSymbol}
          {fiatValue.toFixed(2)}
          {locked > 0.000001 && (
            <span className="text-amber-400/90"> · {locked.toFixed(4)} locked</span>
          )}
        </p>
        {gasBalance && (
          <p className={`text-xs mt-2 flex items-center gap-1 ${gasBalance.sufficient ? 'text-slate-500' : 'text-amber-400'}`}>
            <Fuel className="w-3 h-3" />
            Gas: {gasBalance.display.toFixed(4)} {gasDenom}
            {!gasBalance.sufficient && ' — low, fund wallet for fees'}
          </p>
        )}
      </div>
      <button type="button" onClick={onRefresh} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700">
        <RefreshCw className="w-5 h-5 text-slate-400" />
      </button>
    </div>
  )
}

function RecipientField({
  recipient,
  setRecipient,
  recipientState,
  recentRecipients,
  prefix,
  senderAddress,
  amountValue,
  showInviteQr,
  onToggleInviteQr,
  onCloseInviteQr,
}) {
  const isError =
    recipientState.status === 'invalid' || recipientState.status === 'unavailable'

  return (
    <div
      className={`rounded-2xl border p-4 transition-all duration-300 ${
        isError
          ? 'border-red-500 bg-red-950/30 shadow-[0_0_28px_rgba(239,68,68,0.55)] ring-2 ring-red-500/50'
          : recipientState.status === 'valid'
            ? 'border-emerald-500/30 bg-slate-800/30'
            : 'border-slate-700 bg-slate-800/20'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-sm font-medium text-slate-300">Recipient</label>
        <button
          type="button"
          onClick={onToggleInviteQr}
          title={showInviteQr ? 'Hide invite QR' : 'Invite someone to join Mallchain'}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
            showInviteQr
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-700 text-slate-200 border border-slate-600 hover:border-cyan-500/50 hover:text-cyan-300'
          }`}
        >
          {showInviteQr ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showInviteQr ? 'Close invite' : 'Invite'}
        </button>
      </div>

      <input
        type="text"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder={`${prefix}1…`}
        className={`w-full rounded-xl border px-4 py-3 font-mono text-sm text-white bg-slate-900/80 outline-none transition-colors ${
          isError
            ? 'border-red-500 focus:border-red-400 focus:ring-2 focus:ring-red-500/30'
            : 'border-slate-700 focus:border-cyan-500/50'
        }`}
      />

      {recentRecipients.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {recentRecipients.map((r) => (
            <button
              key={r.address}
              type="button"
              onClick={() => setRecipient(r.address)}
              className="text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-600 text-slate-300 hover:border-cyan-500/50"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <RecipientValidation state={recipientState} onOpenInvite={onToggleInviteQr} />

      <AnimatePresence>
        {showInviteQr && senderAddress && (
          <InviteQrPanel
            senderAddress={senderAddress}
            amountValue={amountValue}
            onClose={onCloseInviteQr}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function InviteQrPanel({ senderAddress, amountValue, onClose }) {
  const inviteUrl = buildInviteJoinUrl(senderAddress, { amountMlcns: amountValue })

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl)
    toast.success('Invite link copied')
  }

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Mallchain',
          text: 'Create your wallet so I can send you Mallcoins (MLCNS).',
          url: inviteUrl,
        })
        return
      } catch {
        /* fall through */
      }
    }
    copyLink()
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-4 rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/10 to-slate-900/80 p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-cyan-400" />
              Invite to Mallchain
            </p>
            <p className="text-sm text-slate-400 mt-1">
              They scan the QR, create a wallet, then you can send MLCNS to their new address.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="rounded-2xl bg-white p-3 shrink-0">
            <QRCodeSVG id="send-invite-qr" value={inviteUrl} size={160} level="M" includeMargin />
          </div>
          <div className="flex-1 w-full space-y-3 text-sm">
            <p className="text-slate-500">Invite link</p>
            <p className="font-mono text-xs text-slate-300 break-all bg-slate-800/80 rounded-lg p-3">
              {inviteUrl}
            </p>
            {amountValue > 0 && (
              <p className="text-cyan-300/90">
                Suggested amount after they join: {amountValue.toFixed(6)} {SYMBOL}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 border border-slate-600 hover:border-cyan-500/40"
              >
                <Copy className="w-4 h-4" /> Copy
              </button>
              <button
                type="button"
                onClick={shareLink}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
              >
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function RecipientValidation({ state, onOpenInvite }) {
  if (state.status === 'idle') return null

  const styles = {
    checking: {
      border: 'border-amber-500/40',
      bg: 'bg-amber-500/10',
      icon: Loader2,
      spin: true,
      title: 'Checking address…',
      glow: false,
    },
    valid: {
      border: 'border-emerald-500/40',
      bg: 'bg-emerald-500/10',
      icon: CheckCircle2,
      title: 'Recipient verified',
      glow: false,
    },
    unavailable: {
      border: 'border-red-500/60',
      bg: 'bg-red-500/15',
      icon: XCircle,
      title: 'Wallet not available',
      glow: true,
    },
    invalid: {
      border: 'border-red-500/60',
      bg: 'bg-red-500/15',
      icon: XCircle,
      title: 'Invalid address',
      glow: true,
    },
  }

  const cfg = styles[state.status] || styles.invalid
  const Icon = cfg.icon

  return (
    <div
      className={`mt-3 flex gap-3 rounded-xl border p-3 ${cfg.border} ${cfg.bg} ${
        cfg.glow ? 'shadow-[0_0_16px_rgba(239,68,68,0.4)]' : ''
      }`}
    >
      <Icon
        className={`w-5 h-5 shrink-0 ${
          cfg.spin
            ? 'animate-spin text-amber-400'
            : state.status === 'valid'
              ? 'text-emerald-400'
              : 'text-red-400'
        }`}
      />
      <div className="text-sm flex-1">
        <p className="font-medium text-white">{cfg.title}</p>
        <p className="text-slate-400 mt-0.5">
          {state.info?.message ||
            (state.status === 'valid'
              ? `On-chain balance: ${state.info?.recipientBalance ?? 0} ${SYMBOL}`
              : '')}
        </p>
        {(state.status === 'unavailable' || state.status === 'invalid') && onOpenInvite && (
          <button
            type="button"
            onClick={onOpenInvite}
            className="mt-2 text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Open invite QR
          </button>
        )}
      </div>
    </div>
  )
}

function FeeAndNetworkRow({ feeLoading, gasFeeDisplay, gasDenom, amountValue, chainStatus }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Fuel className="w-3 h-3" /> Network fee (gas)
        </p>
        <p className="text-lg font-bold text-white mt-1">
          {feeLoading ? (
            <Loader2 className="w-5 h-5 animate-spin inline" />
          ) : gasFeeDisplay != null ? (
            `~${gasFeeDisplay.toFixed(6)} ${gasDenom}`
          ) : amountValue > 0 ? (
            'Enter recipient to estimate'
          ) : (
            '—'
          )}
        </p>
        <p className="text-xs text-slate-500 mt-1">Paid in {gasDenom}, not deducted from {SYMBOL} sent</p>
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Globe className="w-3 h-3" /> Recipient receives
        </p>
        <p className="text-lg font-bold text-cyan-300 mt-1">
          {amountValue > 0 ? `${amountValue.toFixed(6)} ${SYMBOL}` : '—'}
        </p>
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
          <Clock3 className="w-3 h-3" />
          Block {chainStatus?.latestHeight ?? '…'}
        </p>
      </div>
    </div>
  )
}

function SessionSummary({
  wallet,
  amountValue,
  fiatValue,
  fiatSymbol,
  recipient,
  recipientState,
  feeEstimate,
  gasDenom,
  liveRateKes,
  priceInsight,
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5 text-cyan-400" />
        <h3 className="font-bold">Transfer summary</h3>
      </div>
      <SummaryRow label="From" value={wallet?.address} mono />
      <SummaryRow label="To" value={recipient || '—'} mono />
      <SummaryRow label="MLCNS" value={amountValue > 0 ? amountValue.toFixed(6) : '—'} />
      <SummaryRow label="Fiat (est.)" value={amountValue > 0 ? `${fiatSymbol}${fiatValue.toFixed(2)}` : '—'} />
      <SummaryRow
        label="Rate"
        value={priceInsight ? `${liveRateKes.toFixed(4)} KES / ${SYMBOL}` : '—'}
      />
      <SummaryRow
        label="Gas (est.)"
        value={feeEstimate ? `~${feeEstimate.feeDisplay.toFixed(6)} ${gasDenom}` : '—'}
      />
      <SummaryRow
        label="Recipient status"
        value={
          recipientState.status === 'valid'
            ? 'On-chain wallet'
            : recipientState.status === 'unavailable'
              ? 'Not available'
              : recipientState.status === 'invalid'
                ? 'Invalid'
                : recipientState.status
        }
      />
    </div>
  )
}

function SummaryRow({ label, value, mono }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm text-white mt-0.5 ${mono ? 'font-mono text-xs break-all' : 'font-semibold'}`}>
        {value}
      </p>
    </div>
  )
}

function QuickLinks({ navigate }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs text-slate-500 mb-3">Quick actions</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => navigate('/wallet/receive')}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-800 text-sm"
        >
          <QrCode className="w-4 h-4 text-cyan-400" /> Receive
        </button>
        <button
          type="button"
          onClick={() => navigate('/wallet/transactions')}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-800 text-sm"
        >
          <History className="w-4 h-4 text-cyan-400" /> History
        </button>
      </div>
    </div>
  )
}

function ConfirmModal({
  amountValue,
  fiatValue,
  fiatSymbol,
  symbol,
  recipient,
  memo,
  gasFeeDisplay,
  gasDenom,
  preflight,
  isSending,
  onCancel,
  onConfirm,
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
      >
        <h3 className="text-xl font-black text-white">Confirm transfer</h3>
        <p className="text-slate-400 text-sm mt-1">This signs and broadcasts on Mallchain.</p>
        <div className="mt-5 space-y-3 text-sm">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-slate-500">You send</p>
            <p className="text-2xl font-black text-white">
              {amountValue.toFixed(6)} {symbol}
            </p>
            <p className="text-slate-400">≈ {fiatSymbol}{fiatValue.toFixed(2)}</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-slate-500">To</p>
            <p className="font-mono text-xs text-white break-all">{recipient}</p>
          </div>
          {memo && (
            <div className="rounded-xl bg-slate-800 p-4">
              <p className="text-slate-500">Memo</p>
              <p className="text-white">{memo}</p>
            </div>
          )}
          <div className="flex justify-between rounded-xl bg-slate-800 px-4 py-3">
            <span className="text-slate-500">Gas (est.)</span>
            <span className="font-semibold">
              {gasFeeDisplay != null ? `~${gasFeeDisplay.toFixed(6)} ${gasDenom}` : '—'}
            </span>
          </div>
          {preflight?.ok === false && (
            <p className="text-amber-400 text-xs">{preflight.issues[0]?.message}</p>
          )}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-slate-600 font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSending || preflight?.ok === false}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold disabled:opacity-50"
          >
            {isSending ? 'Signing…' : 'Confirm & send'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

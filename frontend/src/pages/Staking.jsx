import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  TrendingUp,
  Clock,
  Award,
  Users,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Loader,
  ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { loadWallet } from '../core/wallet/walletUtils'
import SecureSigningModal from '../components/SecureSigningModal'
import { withSigningKey } from '../core/wallet/secureSigner'
import {
  fetchValidators,
  fetchStakingSummary,
  stakeTokens,
  unstakeTokens,
  claimStakingRewards,
  displayDenom,
} from '../core/staking/stakingApi'
import { appConfig } from '../config/app'

export default function Staking() {
  const [loading, setLoading] = useState(true)
  const [validators, setValidators] = useState([])
  const [summary, setSummary] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [selectedValidator, setSelectedValidator] = useState('')
  const [stakeAmount, setStakeAmount] = useState('')
  const [unstakeAmount, setUnstakeAmount] = useState('')
  const [activeTab, setActiveTab] = useState('stake')
  const [busy, setBusy] = useState(false)
  const [showSigningModal, setShowSigningModal] = useState(false)
  const [pendingOperation, setPendingOperation] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const w = loadWallet()
      setWallet(w)
      const [valRes, sum] = await Promise.all([
        fetchValidators(),
        w?.address ? fetchStakingSummary(w.address) : null,
      ])
      setValidators(valRes.validators || [])
      setSummary(sum)
      if (!selectedValidator && valRes.validators?.[0]) {
        setSelectedValidator(valRes.validators[0].operatorAddress || valRes.validators[0].id)
      }
    } catch (e) {
      toast.error(e.message || 'Failed to load staking')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const staked = summary?.totalStaked ?? 0
  const pendingRewards = summary?.pendingRewards ?? 0
  const liquid = summary?.liquidBalance ?? 0

  const primaryDelegation = summary?.delegations?.[0]

  const handleStake = async () => {
    if (!wallet?.address) {
      toast.error('Wallet required')
      return
    }
    const amount = parseFloat(stakeAmount)
    if (!amount || amount <= 0) return toast.error('Enter a valid amount')
    if (!selectedValidator) return toast.error('Select a validator')
    if (amount > liquid) return toast.error(`Insufficient liquid ${displayDenom}`)

    // Store operation and show signing modal instead of accessing private key
    setPendingOperation({
      type: 'stake',
      params: {
        delegatorAddress: wallet.address,
        validatorAddress: selectedValidator,
        amountDisplay: amount,
      }
    })
    setShowSigningModal(true)
  }

  const handleUnstake = async () => {
    if (!wallet?.address) {
      toast.error('Wallet required')
      return
    }
    const amount = parseFloat(unstakeAmount)
    const validator = selectedValidator || primaryDelegation?.validatorAddress
    if (!amount || amount <= 0) return toast.error('Enter a valid amount')
    if (!validator) return toast.error('Select a validator with stake')

    // Store operation and show signing modal instead of accessing private key
    setPendingOperation({
      type: 'unstake',
      params: {
        delegatorAddress: wallet.address,
        validatorAddress: validator,
        amountDisplay: amount,
      }
    })
    setShowSigningModal(true)
  }

  const handleClaim = async () => {
    if (!wallet?.address) return toast.error('Wallet required')
    const validatorsWithRewards = (summary?.rewardsByValidator || [])
      .filter((r) => r.rewardDisplay > 0)
      .map((r) => r.validatorAddress)
    if (!validatorsWithRewards.length) return toast.error('No rewards to claim')

    // Store operation and show signing modal instead of accessing private key
    setPendingOperation({
      type: 'claim',
      params: {
        delegatorAddress: wallet.address,
        validatorAddresses: validatorsWithRewards,
      }
    })
    setShowSigningModal(true)
  }

  const handleSignOperation = async (mnemonic) => {
    if (!pendingOperation) return

    setBusy(true)
    try {
      // Use secure signer with mnemonic (key never stored, only in-memory during signing)
      await withSigningKey(mnemonic, async (privateKeyHex) => {
        const params = {
          ...pendingOperation.params,
          privateKeyHex
        }

        let result
        if (pendingOperation.type === 'stake') {
          result = await stakeTokens(params)
        } else if (pendingOperation.type === 'unstake') {
          result = await unstakeTokens(params)
        } else if (pendingOperation.type === 'claim') {
          result = await claimStakingRewards(params)
        }

        toast.success(`${pendingOperation.type.charAt(0).toUpperCase() + pendingOperation.type.slice(1)} successful · ${result.txHash.slice(0, 12)}…`)
      })

      // Clear state
      setStakeAmount('')
      setUnstakeAmount('')
      setPendingOperation(null)
      await load()
    } catch (e) {
      toast.error(e.message || `${pendingOperation.type} failed`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-black text-white mb-2">Staking</h1>
        <p className="text-slate-400">
          Delegate {displayDenom} to validators, earn rewards, and increase governance voting power.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<TrendingUp className="w-6 h-6 text-green-400" />} label="Staked" value={`${staked.toFixed(4)} ${displayDenom}`} />
        <StatCard icon={<Award className="w-6 h-6 text-yellow-400" />} label="Pending rewards" value={`${pendingRewards.toFixed(6)} ${displayDenom}`} />
        <StatCard icon={<Clock className="w-6 h-6 text-blue-400" />} label="Unbonding" value={`${(summary?.unbondingTotal ?? 0).toFixed(4)} ${displayDenom}`} />
        <StatCard icon={<Users className="w-6 h-6 text-purple-400" />} label="Validators" value={validators.length} />
      </div>

      {!wallet && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-amber-100 text-sm">
            <Link to="/wallet/create" className="underline">Create a wallet</Link> to stake. You need liquid{' '}
            {displayDenom} for gas and delegation.
          </p>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {['stake', 'unstake', 'rewards'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-xl font-medium capitalize ${
              activeTab === tab
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
        <Link
          to="/staking/validators"
          className="ml-auto px-5 py-2.5 rounded-xl text-sm text-slate-300 border border-slate-700 hover:bg-slate-800 flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" /> Validator explorer
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-5">
          {activeTab === 'stake' && (
            <>
              <h3 className="text-lg font-bold">Stake</h3>
              <p className="text-slate-500 text-sm">Available: {liquid.toFixed(4)} {displayDenom}</p>
              <input
                type="number"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="Amount"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-white"
              />
              <select
                value={selectedValidator}
                onChange={(e) => setSelectedValidator(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-white"
              >
                {validators.map((v) => (
                  <option key={v.operatorAddress || v.id} value={v.operatorAddress || v.id}>
                    {v.name} · {v.commission}% fee
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !wallet}
                onClick={handleStake}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold disabled:opacity-50"
              >
                {busy ? <Loader className="w-5 h-5 mx-auto animate-spin" /> : 'Delegate'}
              </button>
            </>
          )}

          {activeTab === 'unstake' && (
            <>
              <h3 className="text-lg font-bold">Unstake</h3>
              <p className="text-slate-500 text-sm">Staked: {staked.toFixed(4)} {displayDenom}</p>
              <input
                type="number"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
                placeholder="Amount"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-white"
              />
              <p className="text-xs text-amber-200/90">Unbonding period applies per chain params (typically ~21 days).</p>
              <button
                type="button"
                disabled={busy || !wallet}
                onClick={handleUnstake}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 font-semibold disabled:opacity-50"
              >
                Undelegate
              </button>
            </>
          )}

          {activeTab === 'rewards' && (
            <>
              <h3 className="text-lg font-bold">Rewards</h3>
              <p className="text-3xl font-black">{pendingRewards.toFixed(6)}</p>
              <p className="text-slate-500 text-sm">{displayDenom}</p>
              <button
                type="button"
                disabled={busy || !wallet || pendingRewards <= 0}
                onClick={handleClaim}
                className="w-full py-3 rounded-xl bg-green-600 font-semibold disabled:opacity-50"
              >
                Claim all
              </button>
            </>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold">Your delegations</h2>
          {loading ? (
            <Loader className="w-8 h-8 animate-spin text-slate-500 mx-auto" />
          ) : !summary?.delegations?.length ? (
            <p className="text-slate-500">No active delegations.</p>
          ) : (
            summary.delegations.map((d) => (
              <div
                key={d.validatorAddress}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex justify-between items-center"
              >
                <div>
                  <p className="font-mono text-sm text-slate-400 truncate max-w-xs">
                    {d.validatorAddress}
                  </p>
                  <p className="text-white font-bold mt-1">
                    {d.amountDisplay.toFixed(4)} {displayDenom}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedValidator(d.validatorAddress)
                    setActiveTab('unstake')
                  }}
                  className="text-cyan-400 text-sm hover:underline"
                >
                  Manage
                </button>
              </div>
            ))
          )}

          <h2 className="text-xl font-bold pt-4">Top validators</h2>
          {validators.slice(0, 5).map((v) => (
            <div
              key={v.operatorAddress || v.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedValidator(v.operatorAddress || v.id)}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedValidator(v.operatorAddress || v.id)}
              className={`rounded-2xl border p-4 cursor-pointer ${
                selectedValidator === (v.operatorAddress || v.id)
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-slate-800 bg-slate-900/70'
              }`}
            >
              <div className="flex justify-between">
                <div>
                  <p className="font-bold text-white">{v.name}</p>
                  <p className="text-slate-500 text-sm">{v.commission}% commission</p>
                </div>
                <p className="text-green-400 font-bold">{v.totalStaked?.toLocaleString()} {displayDenom}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Secure Signing Modal */}
      <SecureSigningModal
        isOpen={showSigningModal}
        onClose={() => {
          setShowSigningModal(false)
          setPendingOperation(null)
        }}
        title={`Sign ${pendingOperation?.type || 'Transaction'}`}
        description={`Enter your recovery phrase to sign this ${pendingOperation?.type || 'transaction'} and confirm on-chain.`}
        onSign={handleSignOperation}
        isLoading={busy}
      />
    </div>
  )
}

function StatCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-slate-400 text-sm">{label}</p>
          <p className="text-lg font-black text-white">{value}</p>
        </div>
      </div>
    </div>
  )
}

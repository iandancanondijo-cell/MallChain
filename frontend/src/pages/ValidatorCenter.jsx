import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Sparkles, Search, Award, ArrowRight, Loader, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../core/store/authStore'
import { fetchValidatorLeaderboard, submitValidatorApplication, getMyValidatorApplication } from '../core/validators/validatorApi'

export default function ValidatorCenter() {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [validators, setValidators] = useState([])
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({
    applicantAddress: user?.address || '',
    validatorAddress: '',
    moniker: '',
    website: '',
    details: '',
    selfDelegationAmount: '',
    denom: 'stake',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const list = await fetchValidatorLeaderboard()
        setValidators(list)
      } catch (error) {
        toast.error(error.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return validators
    return validators.filter((validator) => {
      return (
        validator.name?.toLowerCase().includes(term) ||
        validator.operatorAddress?.toLowerCase().includes(term) ||
        validator.website?.toLowerCase().includes(term)
      )
    })
  }, [query, validators])

  const summary = useMemo(() => {
    const total = filtered.length
    const avgUptime = total
      ? Math.round(filtered.reduce((sum, v) => sum + (v.uptime || 0), 0) / total)
      : 0
    const topScore = filtered.reduce((max, v) => Math.max(max, v.reputationScore || 0), 0)
    return { total, avgUptime, topScore }
  }, [filtered])

  const [myApplication, setMyApplication] = useState(null)

  useEffect(() => {
    if (!user?.address) return
    ;(async () => {
      try {
        const app = await getMyValidatorApplication(user.address)
        setMyApplication(app)
      } catch (e) {
        // ignore - no application yet
      }
    })()
  }, [user?.address])

  const hasPendingApplication = myApplication?.status === 'pending'

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.applicantAddress || !form.moniker) {
      return toast.error('Please provide your wallet address and validator name.')
    }

    try {
      setSubmitting(true)
      await submitValidatorApplication(form)
      toast.success('Validator application submitted!')
      setMyApplication({ ...form, status: 'pending', submittedAt: new Date() })
      setForm({
        applicantAddress: '',
        validatorAddress: '',
        moniker: '',
        website: '',
        details: '',
        selfDelegationAmount: '',
        denom: 'stake',
      })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-sm text-cyan-400 uppercase tracking-[0.2em]">
              Validator Center
            </p>
            <h1 className="text-4xl font-black text-white">
              Build trust with validator reputation and leaderboards
            </h1>
            <p className="mt-3 text-slate-400 max-w-2xl">
              View bonded validators, compare performance metrics, and apply to become a Mallchain validator.
              This is the first step toward decentralized network governance and staking rewards.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20">
            <div className="flex items-center gap-3 text-slate-300 mb-4">
              <Shield className="w-6 h-6 text-cyan-400" />
              <span className="font-semibold text-white">Validator reputation</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-950/80 p-4">
                <p className="text-sm text-slate-500">Validators</p>
                <p className="text-3xl font-bold text-white">{summary.total}</p>
              </div>
              <div className="rounded-2xl bg-slate-950/80 p-4">
                <p className="text-sm text-slate-500">Top score</p>
                <p className="text-3xl font-bold text-white">{summary.topScore}</p>
              </div>
              <div className="rounded-2xl bg-slate-950/80 p-4">
                <p className="text-sm text-slate-500">Avg. uptime</p>
                <p className="text-3xl font-bold text-white">{summary.avgUptime}%</p>
              </div>
              <div className="rounded-2xl bg-slate-950/80 p-4">
                <p className="text-sm text-slate-500">Live ranking</p>
                <p className="text-3xl font-bold text-white">{filtered.length}</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-semibold text-white">Validator leaderboard</h2>
              <p className="text-sm text-slate-500">Ranked by uptime, stake share, and commission.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or address"
                className="w-full min-w-[220px] rounded-2xl border border-slate-700 bg-slate-950/90 py-2.5 pl-12 pr-4 text-sm text-white outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader className="w-10 h-10 animate-spin text-cyan-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/80 p-12 text-center text-slate-500">
                No validators found.
              </div>
            ) : (
              filtered.map((validator, index) => (
                <motion.div
                  key={validator.operatorAddress || index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: index * 0.02 }}
                  className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-cyan-300 uppercase tracking-[0.2em]">
                        <Shield className="w-4 h-4" />
                        Reputation #{index + 1}
                      </div>
                      <h3 className="text-xl font-semibold text-white mt-2">{validator.name}</h3>
                      <p className="mt-2 text-sm text-slate-500 break-words">{validator.operatorAddress}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-slate-400">
                      <span className="rounded-2xl bg-slate-800 px-3 py-2">Uptime {validator.uptime}%</span>
                      <span className="rounded-2xl bg-slate-800 px-3 py-2">Stake {validator.totalStaked} MLCNS</span>
                      <span className="rounded-2xl bg-slate-800 px-3 py-2">Comm. {validator.commission}%</span>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
                    <div className="rounded-2xl bg-slate-900/90 p-3">
                      <p className="text-slate-500">Reputation score</p>
                      <p className="text-lg font-semibold text-white">{validator.reputationScore}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-900/90 p-3">
                      <p className="text-slate-500">Missed blocks</p>
                      <p className="text-lg font-semibold text-white">{validator.missedBlocks}</p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Award className="w-6 h-6 text-amber-400" />
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {hasPendingApplication ? 'Application Status' : 'Apply to become a validator'}
                </h2>
                <p className="text-sm text-slate-500">
                  {hasPendingApplication
                    ? 'Your application is pending review.'
                    : 'Submit your application and get reviewed by network operators.'}
                </p>
              </div>
            </div>
            {hasPendingApplication ? (
              <div className="rounded-2xl bg-slate-950/80 p-6 text-center">
                <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                <p className="text-slate-300">
                  Your validator application has been submitted and is awaiting approval.
                  You will be notified once it is reviewed.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm text-slate-300">Wallet address</label>
                  <input
                    name="applicantAddress"
                    value={form.applicantAddress}
                    onChange={handleChange}
                    placeholder="mall1..."
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-white outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300">Validator name</label>
                  <input
                    name="moniker"
                    value={form.moniker}
                    onChange={handleChange}
                    placeholder="Mallchain Validator"
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-white outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300">Details / description</label>
                  <textarea
                    name="details"
                    value={form.details}
                    onChange={handleChange}
                    placeholder="Why should the network choose you?"
                    rows="4"
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-white outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-slate-300">Validator address (optional)</label>
                    <input
                      name="validatorAddress"
                      value={form.validatorAddress}
                      onChange={handleChange}
                      placeholder="mallvaloper..."
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-300">Self-delegation</label>
                    <input
                      name="selfDelegationAmount"
                      value={form.selfDelegationAmount}
                      onChange={handleChange}
                      placeholder="1000000"
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit application'}
                  <ArrowRight className="w-4 h-4" />
                </button>
                {!localStorage.getItem('token') && (
                  <p className="text-xs text-slate-500">Sign in to submit your validator application.</p>
                )}
              </form>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-3 text-slate-400 mb-4">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <span className="text-sm uppercase tracking-[0.2em]">Why validators matter</span>
            </div>
            <ul className="space-y-3 text-slate-300 text-sm">
              <li className="rounded-2xl bg-slate-950/80 p-4">
                <strong className="text-white">Decentralized consensus</strong> — more validators means stronger network security and trust.
              </li>
              <li className="rounded-2xl bg-slate-950/80 p-4">
                <strong className="text-white">Performance transparency</strong> — reputation scores surface uptime, earned trust, and stake share.
              </li>
              <li className="rounded-2xl bg-slate-950/80 p-4">
                <strong className="text-white">Ecosystem participation</strong> — validator applications connect operators with governance and rewards.
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
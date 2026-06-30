import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Loader, CheckCircle, AlertCircle, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../core/store/authStore'
import { getMyValidatorApplication } from '../core/validators/validatorApi'

export default function MyValidatorCenter() {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [application, setApplication] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!user?.address) return
    ;(async () => {
      setChecking(true)
      try {
        const app = await getMyValidatorApplication(user.address)
        setApplication(app)
      } catch (e) {
        toast.error(e.message)
      } finally {
        setLoading(false)
        setChecking(false)
      }
    })()
  }, [user?.address])

  const statusConfig = {
    approved: {
      icon: <CheckCircle className="w-12 h-12 text-green-400" />,
      title: 'Validator Approved',
      message: 'Your application has been approved. You are now a Mallchain validator.',
      tone: 'text-green-400',
    },
    pending: {
      icon: <AlertCircle className="w-12 h-12 text-amber-400" />,
      title: 'Application Pending',
      message: 'Your validator application is under review. You will be notified once approved.',
      tone: 'text-amber-400',
    },
    rejected: {
      icon: <AlertCircle className="w-12 h-12 text-rose-400" />,
      title: 'Application Rejected',
      message: application?.reviewNotes || 'Your validator application was not approved at this time.',
      tone: 'text-rose-400',
    },
  }

  const status = application?.status || 'pending'

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm text-cyan-400 uppercase tracking-[0.2em]">My Validator Center</p>
        <h1 className="text-4xl font-black text-white mt-2">Validator Status</h1>
        <p className="mt-3 text-slate-400">
          View your validator application status and manage your validator operations.
        </p>
      </motion.div>

      {loading || checking ? (
        <div className="flex justify-center py-20">
          <Loader className="w-10 h-10 animate-spin text-cyan-500" />
        </div>
      ) : !application ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-center">
          <Shield className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No Application Found</h3>
          <p className="text-slate-400 mb-4">
            You have not submitted a validator application yet.
          </p>
          <a
            href="/validator-center"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Apply to Become a Validator
            <Wallet className="w-4 h-4" />
          </a>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8"
        >
          <div className="flex flex-col items-center text-center">
            {statusConfig[status]?.icon}
            <h2 className={`mt-4 text-2xl font-bold ${statusConfig[status]?.tone}`}>
              {statusConfig[status]?.title}
            </h2>
            <p className="mt-2 text-slate-400 max-w-lg">
              {statusConfig[status]?.message}
            </p>

            {application.moniker && (
              <div className="mt-6 grid grid-cols-2 gap-4 w-full max-w-md">
                <div className="rounded-2xl bg-slate-950/80 p-4">
                  <p className="text-slate-500 text-sm">Validator Name</p>
                  <p className="font-semibold text-white mt-1">{application.moniker}</p>
                </div>
                <div className="rounded-2xl bg-slate-950/80 p-4">
                  <p className="text-slate-500 text-sm">Status</p>
                  <p className="font-semibold text-white mt-1 capitalize">{application.status}</p>
                </div>
                {application.selfDelegationAmount && (
                  <div className="rounded-2xl bg-slate-950/80 p-4">
                    <p className="text-slate-500 text-sm">Self-Delegation</p>
                    <p className="font-semibold text-white mt-1">
                      {Number(application.selfDelegationAmount) / 1e6} MLCNS
                    </p>
                  </div>
                )}
                {application.website && (
                  <div className="rounded-2xl bg-slate-950/80 p-4">
                    <p className="text-slate-500 text-sm">Website</p>
                    <a
                      href={application.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-cyan-400 mt-1 truncate block"
                    >
                      {application.website}
                    </a>
                  </div>
                )}
              </div>
            )}

            {status === 'approved' && (
              <div className="mt-8 space-y-4">
                <h3 className="text-lg font-semibold text-white">Validator Operations</h3>
                <div className="flex flex-wrap gap-3 justify-center">
                  <a
                    href="/staking"
                    className="rounded-xl bg-cyan-500/20 border border-cyan-500/30 px-5 py-2.5 text-cyan-300 font-medium hover:bg-cyan-500/30"
                  >
                    View Staking Dashboard
                  </a>
                  <a
                    href="/explorer"
                    className="rounded-xl bg-slate-800 px-5 py-2.5 text-slate-300 font-medium hover:bg-slate-700"
                  >
                    Explorer
                  </a>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
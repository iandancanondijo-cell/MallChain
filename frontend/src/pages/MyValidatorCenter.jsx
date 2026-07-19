import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Loader, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../core/store/authStore'
import { getMyValidatorApplication } from '../core/validators/validatorApi'

export default function MyValidatorCenter() {
  const user = useAuthStore(s => s.user)
  const [loading, setLoading] = useState(true)
  const [application, setApplication] = useState(null)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    if (!user.address) { setLoading(false); return }
    ;(async () => {
      try {
        const app = await getMyValidatorApplication(user.address)
        setApplication(app)
      } catch (e) {
        toast.error(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [user])

  const STATUS = {
    approved: { icon: <CheckCircle className="w-12 h-12 text-emerald-400"/>, title: 'Validator Approved', tone: 'text-emerald-400',
      msg: 'Your application has been approved. You are now a Mallchain validator.' },
    pending:  { icon: <AlertCircle className="w-12 h-12 text-amber-400"/>,   title: 'Application Pending',  tone: 'text-amber-400',
      msg: 'Your validator application is under review. You will be notified once approved.' },
    rejected: { icon: <AlertCircle className="w-12 h-12 text-rose-400"/>,    title: 'Application Rejected', tone: 'text-rose-400',
      msg: null },
  }

  const status = application?.status || 'pending'
  const cfg    = STATUS[status] || STATUS.pending

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8 px-4">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <p className="text-xs text-cyan-400 uppercase tracking-widest">My Validator Center</p>
        <h1 className="text-4xl font-black text-white mt-2">Validator Status</h1>
        <p className="mt-2 text-slate-400">View your validator application status and operations.</p>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-10 h-10 animate-spin text-cyan-500"/></div>
      ) : !user ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-center space-y-4">
          <Shield className="w-12 h-12 text-slate-600 mx-auto"/>
          <p className="text-white font-semibold">Sign in to view your validator status</p>
          <Link to="/login" className="inline-block px-6 py-2.5 rounded-xl bg-cyan-500 text-black font-semibold text-sm hover:bg-cyan-400">Sign In</Link>
        </div>
      ) : !application ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-center space-y-4">
          <Shield className="w-12 h-12 text-slate-600 mx-auto"/>
          <h3 className="text-xl font-bold text-white">No Application Found</h3>
          <p className="text-slate-400">You have not submitted a validator application yet.</p>
          <Link to="/validator-center"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 text-black font-semibold hover:bg-cyan-400">
            Apply to Become a Validator
          </Link>
        </div>
      ) : (
        <motion.div initial={{opacity:0,scale:0.98}} animate={{opacity:1,scale:1}}
          className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
          <div className="flex flex-col items-center text-center gap-4">
            {cfg.icon}
            <h2 className={`text-2xl font-bold ${cfg.tone}`}>{cfg.title}</h2>
            <p className="text-slate-400 max-w-lg">
              {status === 'rejected' ? (application.reviewNotes || 'Your application was not approved at this time.') : cfg.msg}
            </p>

            {application.moniker && (
              <div className="grid grid-cols-2 gap-4 w-full max-w-md mt-4">
                {[
                  { label: 'Validator Name', value: application.moniker },
                  { label: 'Status', value: application.status },
                  application.selfDelegationAmount && { label: 'Self-Delegation', value: `${Number(application.selfDelegationAmount)/1e6} MLCNS` },
                  application.website && { label: 'Website', value: application.website, href: application.website },
                ].filter(Boolean).map(item => (
                  <div key={item.label} className="rounded-2xl bg-slate-950/80 p-4">
                    <p className="text-slate-500 text-sm">{item.label}</p>
                    {item.href ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-cyan-400 mt-1 truncate block">{item.value}</a>
                    ) : (
                      <p className="font-semibold text-white mt-1 capitalize">{item.value}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {status === 'approved' && (
              <div className="flex gap-3 flex-wrap justify-center mt-4">
                <Link to="/staking" className="px-5 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-medium hover:bg-cyan-500/30">
                  Staking Dashboard
                </Link>
                <Link to="/explorer" className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700">
                  Explorer
                </Link>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

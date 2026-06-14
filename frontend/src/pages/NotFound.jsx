import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, ArrowLeft } from 'lucide-react'

/**
 * 404 page — shown when no route matches.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center"
      >
        <div className="text-8xl font-black text-slate-700 mb-4">404</div>
        <h1 className="text-3xl font-black text-white mb-3">
          Page not found
        </h1>
        <p className="text-slate-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-6 rounded-xl hover:opacity-90 transition-all"
          >
            <Home className="w-5 h-5" />
            Dashboard
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-white font-medium py-3 px-6 rounded-xl hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Go back
          </button>
        </div>
      </motion.div>
    </div>
  )
}

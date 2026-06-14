import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotifications } from '../hooks/useRealtime'
import { toast } from 'sonner'

const NOTIFICATION_ICONS: Record<string, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️'
}

const NOTIFICATION_COLORS: Record<string, string> = {
  success: 'from-green-500/20 to-green-600/20 border-green-400/30',
  error: 'from-red-500/20 to-red-600/20 border-red-400/30',
  warning: 'from-yellow-500/20 to-yellow-600/20 border-yellow-400/30',
  info: 'from-blue-500/20 to-blue-600/20 border-blue-400/30'
}

export function NotificationCenter() {
  const notifications = useNotifications()

  useEffect(() => {
    notifications.forEach((notification) => {
      // Use sonner toast for display
      toast[notification.type as keyof typeof toast](
        `${notification.title}: ${notification.message}`
      )
    })
  }, [notifications])

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      <AnimatePresence>
        {notifications.slice(0, 3).map((notif, idx) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 20, y: -20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ delay: idx * 0.1 }}
            className={`p-4 rounded-lg border bg-gradient-to-r ${
              NOTIFICATION_COLORS[notif.type] || NOTIFICATION_COLORS.info
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0">
                {NOTIFICATION_ICONS[notif.type] || NOTIFICATION_ICONS.info}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm">
                  {notif.title}
                </p>
                {notif.message && (
                  <p className="text-xs text-slate-200 mt-1 truncate">
                    {notif.message}
                  </p>
                )}
                {notif.metadata?.txHash && (
                  <p className="text-xs text-slate-400 mt-2">
                    TX: {notif.metadata.txHash.slice(0, 12)}...
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default NotificationCenter

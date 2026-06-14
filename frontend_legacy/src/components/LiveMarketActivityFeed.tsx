import { motion, AnimatePresence } from 'framer-motion'
import { useLiveMarketFeed } from '../hooks/useRealtime'

const EVENT_ICONS: Record<string, string> = {
  purchase: '🛍️',
  swap: '🔄',
  stake: '💰',
  unstake: '📤',
  governance: '🏛️',
  crosschain: '🌉'
}

const EVENT_COLORS: Record<string, string> = {
  purchase: 'from-blue-500/20 to-blue-600/20',
  swap: 'from-purple-500/20 to-purple-600/20',
  stake: 'from-green-500/20 to-green-600/20',
  unstake: 'from-orange-500/20 to-orange-600/20',
  governance: 'from-yellow-500/20 to-yellow-600/20',
  crosschain: 'from-pink-500/20 to-pink-600/20'
}

export function LiveMarketActivityFeed({ limit = 10 }) {
  const events = useLiveMarketFeed(limit)

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        Waiting for market activity...
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {events.map((event, idx) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ delay: idx * 0.05 }}
            className={`p-3 rounded-lg border border-slate-700 bg-gradient-to-r ${
              EVENT_COLORS[event.type] || 'from-slate-700/20 to-slate-600/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-xl">
                  {EVENT_ICONS[event.type] || '📊'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate capitalize">
                    {formatEventTitle(event)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatEventDetails(event)}
                  </p>
                </div>
              </div>
              <div className="text-right ml-2">
                <p className="text-xs text-slate-400">
                  {formatTime(event.timestamp)}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function formatEventTitle(event: any): string {
  switch (event.type) {
    case 'purchase':
      return 'Purchase'
    case 'swap':
      return 'Token Swap'
    case 'stake':
      return 'Staking'
    case 'unstake':
      return 'Unstaking'
    case 'governance':
      return 'Governance Vote'
    case 'crosschain':
      return 'Cross-Chain Transfer'
    default:
      return event.type
  }
}

function formatEventDetails(event: any): string {
  switch (event.type) {
    case 'purchase':
      return `${event.data.amount} ${event.data.item} @ $${event.data.price}`
    case 'swap':
      return `${event.data.tokenAIn} → ${event.data.tokenBOut}`
    case 'stake':
      return `${event.data.amount} to ${event.data.validator?.slice(0, 12)}...`
    case 'governance':
      return `Proposal #${event.data.proposalId}: ${event.data.voteOption}`
    case 'crosschain':
      return `${event.data.amount} to ${event.data.targetChain}`
    default:
      return JSON.stringify(event.data)
  }
}

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`

  return new Date(timestamp).toLocaleTimeString()
}

export default LiveMarketActivityFeed

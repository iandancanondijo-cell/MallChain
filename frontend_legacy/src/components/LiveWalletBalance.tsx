import { motion } from 'framer-motion'
import { useLiveWallet, useRealtimeStatus } from '../hooks/useRealtime'

export function LiveWalletBalance({ address }: { address: string }) {
  const walletData = useLiveWallet(address)
  const { isConnected } = useRealtimeStatus()

  if (!walletData) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-4 rounded-lg bg-slate-800 border border-slate-700"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-slate-400">Balance</p>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-slate-500">
              {isConnected ? 'live' : 'offline'}
            </span>
          </div>
        </div>
        <p className="text-slate-400">Loading balance...</p>
      </motion.div>
    )
  }

  const mlcoinBalance = walletData.balances?.find(
    (b: any) => b.denom === 'umal'
  )
  const balance = mlcoinBalance
    ? Number(mlcoinBalance.amount) / 1000000
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-400/20"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-400">Mallcoin Balance</p>
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-2 h-2 rounded-full bg-green-500"
          />
          <span className="text-xs text-green-400">live</span>
        </div>
      </div>

      <div className="text-2xl font-bold text-white mb-1">
        {balance.toFixed(2)} MLCOIN
      </div>

      <p className="text-xs text-slate-500">
        Updated: {new Date(walletData.timestamp).toLocaleTimeString()}
      </p>

      {walletData.balances && walletData.balances.length > 1 && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <p className="text-xs text-slate-400 mb-2">Other Balances:</p>
          <div className="space-y-1">
            {walletData.balances
              .filter((b: any) => b.denom !== 'umal')
              .map((balance: any, idx: number) => (
                <div
                  key={idx}
                  className="flex justify-between text-xs text-slate-400"
                >
                  <span>{balance.denom}</span>
                  <span>{Number(balance.amount) / 1000000}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default LiveWalletBalance

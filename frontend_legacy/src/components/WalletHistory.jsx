export default function WalletHistory({ txs = [] }) {
  return (
    <div className="space-y-3">
      {txs.map(tx => (
        <div key={tx.hash} className="p-3 bg-slate-800 rounded-md border border-slate-700">
          <div className="flex justify-between">
            <div className="text-sm text-slate-300">{tx.hash}</div>
            <div className="text-sm text-slate-400">{tx.status}</div>
          </div>
          <div className="text-xs text-slate-500">Block {tx.block_height}</div>
        </div>
      ))}
    </div>
  )
}

import { Code2, Construction } from 'lucide-react'

export default function Contracts() {
  return (
    <div className="max-w-3xl mx-auto py-16 px-4 text-center space-y-8">
      <div className="w-20 h-20 rounded-3xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto">
        <Code2 size={36} className="text-cyan-400" />
      </div>
      <div>
        <h1 className="text-4xl font-black text-white">Smart Contracts</h1>
        <p className="text-slate-400 mt-3 max-w-lg mx-auto">
          Deploy, manage, and interact with smart contracts on the Mallchain network.
        </p>
      </div>

      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-8 flex flex-col items-center gap-4">
        <Construction size={32} className="text-amber-400" />
        <h2 className="text-xl font-bold text-amber-300">Under Development</h2>
        <p className="text-amber-200/70 text-sm max-w-md">
          Contract deployment and interaction tools are being built. CosmWasm integration
          will enable full smart contract support on Mallchain.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
        {[
          { title: 'Deploy Contracts', desc: 'Upload and instantiate CosmWasm contracts' },
          { title: 'Execute Messages', desc: 'Send transactions to contract endpoints' },
          { title: 'Query State', desc: 'Read on-chain contract state in real time' },
        ].map(f => (
          <div key={f.title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 opacity-50">
            <h3 className="font-semibold text-white text-sm mb-1">{f.title}</h3>
            <p className="text-slate-500 text-xs">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

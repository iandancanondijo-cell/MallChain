export default function Features() {
  return (
    <section className="bg-slate-950 py-20 px-6">
      <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-3 text-white">
        <div className="rounded-3xl bg-white/5 p-8 border border-white/10">
          <h2 className="text-xl font-black mb-3">Secure Payments</h2>
          <p className="text-slate-400">Buy and sell with crypto payments backed by on-chain settlement and wallet protection.</p>
        </div>
        <div className="rounded-3xl bg-white/5 p-8 border border-white/10">
          <h2 className="text-xl font-black mb-3">Marketplace Analytics</h2>
          <p className="text-slate-400">Track listings, transaction volume, and token flows with real-time dashboards.</p>
        </div>
        <div className="rounded-3xl bg-white/5 p-8 border border-white/10">
          <h2 className="text-xl font-black mb-3">Wallet Integrations</h2>
          <p className="text-slate-400">Easily connect your wallet, manage orders, and store favorites in one place.</p>
        </div>
      </div>
    </section>
  );
}


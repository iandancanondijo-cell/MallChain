export default function Stats() {
  return (
    <section className="bg-slate-900 py-20 px-6">
      <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3 text-white">
        <div className="rounded-3xl bg-white/5 p-8 border border-white/10">
          <p className="text-5xl font-black">100K+</p>
          <p className="mt-3 text-slate-400">Verified listings</p>
        </div>
        <div className="rounded-3xl bg-white/5 p-8 border border-white/10">
          <p className="text-5xl font-black">2M+</p>
          <p className="mt-3 text-slate-400">Transactions processed</p>
        </div>
        <div className="rounded-3xl bg-white/5 p-8 border border-white/10">
          <p className="text-5xl font-black">50+</p>
          <p className="mt-3 text-slate-400">Trusted partners</p>
        </div>
      </div>
    </section>
  );
}


import { useState, useEffect } from "react";
import {
  DollarSign, TrendingUp, ArrowUpRight,
  Download, History, Wallet
} from 'lucide-react';
import { getCreatorStats, getCreatorHistory } from "../../api/task.api";
import { useUserStore } from "../../store/userStore";

export default function Earn() {
  const { user } = useUserStore();
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, h] = await Promise.all([
          getCreatorStats(),
          getCreatorHistory()
        ]);
        setStats(s);
        setHistory(h || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalEarnings = user?.mallPoints || 0;

  return (
    <div className="pb-20 animate-fade-in text-white">
      <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight mb-2">Earnings & Wallet</h1>
          <p className="text-slate-500 font-medium">Track your income and withdraw funds.</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-black font-black hover:bg-slate-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95">
          <Download className="w-5 h-5" /> Withdraw Funds
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-green-500/20 to-green-600/5 border border-green-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-[50px] rounded-full"></div>
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-400 mb-4">
              <DollarSign className="w-6 h-6" />
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Total Earnings</p>
            <h2 className="text-4xl font-black text-white">{totalEarnings.toLocaleString()} PTS</h2>
          </div>
        </div>

        <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/5">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white mb-4">
            <TrendingUp className="w-6 h-6" />
          </div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">This Month</p>
          <h2 className="text-4xl font-black text-white">+{stats?.monthly || 0} PTS</h2>
        </div>

        <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/5">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white mb-4">
            <Wallet className="w-6 h-6" />
          </div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Pending Clearance</p>
          <h2 className="text-4xl font-black text-white">{stats?.pending || 0} PTS</h2>
        </div>
      </div>

      {/* Transaction History */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5">
        <h3 className="text-xl font-black text-white mb-6 flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" /> Recent Activity
        </h3>

        <div className="space-y-4">
          {history.length > 0 ? history.map((item, i) => (
            <div key={i} className="flex justify-between items-center p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.type === 'withdrawal' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                  }`}>
                  {item.type === 'withdrawal' ? <ArrowUpRight className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{item.description}</p>
                  <p className="text-xs text-slate-500">{new Date(item.date).toLocaleDateString()}</p>
                </div>
              </div>
              <span className={`font-black ${item.type === 'withdrawal' ? 'text-slate-400' : 'text-green-400'}`}>
                {item.type === 'withdrawal' ? '-' : '+'}{item.amount} PTS
              </span>
            </div>
          )) : (
            <div className="text-center py-10 text-slate-500">No transaction history</div>
          )}
        </div>
      </div>
    </div>
  );
}

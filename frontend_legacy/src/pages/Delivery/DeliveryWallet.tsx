import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAgentEarnings, getDeliveryWallet } from '../../api';
import type { AgentEarnings } from '../../api/delivery.api';
import {
  Wallet, TrendingUp, Calendar, ArrowUpRight,
  ArrowDownRight, CreditCard, Clock
} from 'lucide-react';


export default function DeliveryWallet() {
  const [earnings, setEarnings] = useState<AgentEarnings | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [earningsData, walletData] = await Promise.all([
          getAgentEarnings(),
          getDeliveryWallet()
        ]);
        setEarnings(earningsData);
        setWallet(walletData);
      } catch (e) {
        console.error('Failed to load wallet data', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          My <span className="text-green-400">Wallet</span>
        </h1>
        <p className="text-slate-500 font-medium mt-1">Track your earnings and manage withdrawals.</p>
      </div>

      {/* Main Balance Card */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-green-500/10 to-transparent relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-green-500/20 blur-[80px]"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-green-500/20 flex items-center justify-center">
              <Wallet className="w-7 h-7 text-green-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Available Balance</p>
              <p className="text-4xl font-black text-white">KES {(earnings?.available || wallet?.available || 0).toLocaleString()}</p>
            </div>
          </div>

          <div className="flex gap-4 mt-6">
            <Link
              to="/wallet/withdraw"
              className="flex-1 py-4 rounded-2xl bg-white text-black font-black text-center hover:bg-slate-100 transition-all"
            >
              Withdraw
            </Link>
            <Link
              to="/wallet"
              className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black text-center hover:bg-white/10 transition-all"
            >
              Full Wallet
            </Link>
          </div>
        </div>
      </div>

      {/* Earnings Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Today</p>
              <p className="text-2xl font-black text-green-400">KES {(earnings?.today || 0).toLocaleString()}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">{earnings?.todayDeliveries || 0} deliveries</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">This Week</p>
              <p className="text-2xl font-black text-blue-400">KES {(earnings?.week || 0).toLocaleString()}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">{earnings?.weekDeliveries || 0} deliveries</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">This Month</p>
              <p className="text-2xl font-black text-purple-400">KES {(earnings?.month || 0).toLocaleString()}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">{earnings?.monthDeliveries || 0} deliveries</p>
        </div>
      </div>

      {/* Pending & Total */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Pending</p>
              <p className="text-2xl font-black text-yellow-400">KES {(earnings?.pending || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">All-Time Earnings</p>
              <p className="text-2xl font-black text-indigo-400">KES {(earnings?.total || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
        <h3 className="text-lg font-black text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link to="/wallet/transactions" className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-center">
            <ArrowUpRight className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-white">History</p>
          </Link>
          <Link to="/wallet/withdraw" className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-center">
            <ArrowDownRight className="w-6 h-6 text-orange-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-white">Withdraw</p>
          </Link>
          <Link to="/delivery/tasks" className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-center">
            <TrendingUp className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-white">Earn More</p>
          </Link>
          <Link to="/delivery" className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-center">
            <Wallet className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-white">Dashboard</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

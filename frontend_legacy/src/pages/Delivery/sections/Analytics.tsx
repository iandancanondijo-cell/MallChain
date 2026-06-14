import { useEffect, useState } from 'react';
import { getAgentStats, getAgentEarnings } from '../../../api';
import type { AgentStats, AgentEarnings } from '../../../api/delivery.api';
import { TrendingUp, Star, Package, Clock, CheckCircle2, XCircle, DollarSign } from 'lucide-react';

export default function Analytics() {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [earnings, setEarnings] = useState<AgentEarnings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, earningsData] = await Promise.all([
          getAgentStats(),
          getAgentEarnings()
        ]);
        setStats(statsData);
        setEarnings(earningsData);
      } catch (e) {
        console.error('Failed to load analytics', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          Performance <span className="text-indigo-400">Analytics</span>
        </h1>
        <p className="text-slate-500 font-medium mt-1">Track your delivery performance and earnings.</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-3xl font-black text-white">{stats?.totalCompleted ?? 0}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Total Delivered</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
          </div>
          <p className="text-3xl font-black text-white">{stats?.successRate ?? 100}%</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Success Rate</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
            <Star className="w-6 h-6 text-yellow-400" />
          </div>
          <p className="text-3xl font-black text-white">{(stats?.rating ?? 5.0).toFixed(1)}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Rating</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-6 h-6 text-purple-400" />
          </div>
          <p className="text-3xl font-black text-green-400">KES {(earnings?.total ?? 0).toLocaleString()}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Total Earned</p>
        </div>
      </div>

      {/* Earnings Breakdown */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5">
        <h3 className="text-xl font-black text-white mb-6">Earnings Breakdown</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-green-500/5 border border-green-500/10">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Today</p>
            <p className="text-2xl font-black text-green-400">KES {(earnings?.today ?? 0).toLocaleString()}</p>
            <p className="text-sm text-slate-500 mt-1">{earnings?.todayDeliveries ?? 0} deliveries</p>
          </div>

          <div className="p-6 rounded-2xl bg-blue-500/5 border border-blue-500/10">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">This Week</p>
            <p className="text-2xl font-black text-blue-400">KES {(earnings?.week ?? 0).toLocaleString()}</p>
            <p className="text-sm text-slate-500 mt-1">{earnings?.weekDeliveries ?? 0} deliveries</p>
          </div>

          <div className="p-6 rounded-2xl bg-purple-500/5 border border-purple-500/10">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">This Month</p>
            <p className="text-2xl font-black text-purple-400">KES {(earnings?.month ?? 0).toLocaleString()}</p>
            <p className="text-sm text-slate-500 mt-1">{earnings?.monthDeliveries ?? 0} deliveries</p>
          </div>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5">
        <h3 className="text-xl font-black text-white mb-6">Activity Summary</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-indigo-400" />
              <span className="text-white font-medium">Active Tasks</span>
            </div>
            <span className="text-xl font-black text-indigo-400">{stats?.activeTasks ?? 0}</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-orange-400" />
              <span className="text-white font-medium">Today's Deliveries</span>
            </div>
            <span className="text-xl font-black text-orange-400">{stats?.todayCompleted ?? 0}</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <span className="text-white font-medium">Today's Earnings</span>
            </div>
            <span className="text-xl font-black text-green-400">KES {(stats?.todayEarnings ?? 0).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getAgentEarnings, getAgentHistory } from '../../../api';
import type { AgentEarnings } from '../../../api/delivery.api';
import { DollarSign, TrendingUp, Calendar, ArrowUpRight, Package } from 'lucide-react';

export default function Earnings() {
  const [earnings, setEarnings] = useState<AgentEarnings | null>(null);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [earningsData, historyData] = await Promise.all([
          getAgentEarnings(),
          getAgentHistory(1, 5, 'delivered')
        ]);
        setEarnings(earningsData);
        setRecentTasks(historyData.tasks || []);
      } catch (e) {
        console.error('Failed to load earnings', e);
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
          My <span className="text-green-400">Earnings</span>
        </h1>
        <p className="text-slate-500 font-medium mt-1">Track your income from deliveries.</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 bg-gradient-to-br from-green-500/10 to-transparent">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
          </div>
          <p className="text-3xl font-black text-green-400">KES {(earnings?.today ?? 0).toLocaleString()}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Today</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <p className="text-3xl font-black text-white">KES {(earnings?.week ?? 0).toLocaleString()}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">This Week</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-purple-400" />
            </div>
          </div>
          <p className="text-3xl font-black text-white">KES {(earnings?.month ?? 0).toLocaleString()}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">This Month</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-indigo-400" />
            </div>
          </div>
          <p className="text-3xl font-black text-white">KES {(earnings?.total ?? 0).toLocaleString()}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">All Time</p>
        </div>
      </div>

      {/* Delivery Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <Package className="w-8 h-8 text-green-400 mx-auto mb-3" />
          <p className="text-2xl font-black text-white">{earnings?.todayDeliveries ?? 0}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Today's Deliveries</p>
        </div>
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <Package className="w-8 h-8 text-blue-400 mx-auto mb-3" />
          <p className="text-2xl font-black text-white">{earnings?.weekDeliveries ?? 0}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Week's Deliveries</p>
        </div>
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <Package className="w-8 h-8 text-purple-400 mx-auto mb-3" />
          <p className="text-2xl font-black text-white">{earnings?.monthDeliveries ?? 0}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Month's Deliveries</p>
        </div>
      </div>

      {/* Recent Earnings */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5">
        <h3 className="text-xl font-black text-white mb-6">Recent Earnings</h3>

        {recentTasks.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No recent deliveries</p>
        ) : (
          <div className="space-y-3">
            {recentTasks.map((task) => (
              <div key={task._id || task.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Delivery #{(task._id || task.id)?.slice(-6).toUpperCase()}</p>
                    <p className="text-xs text-slate-500">
                      {task.deliveredAt ? new Date(task.deliveredAt).toLocaleDateString() : 'Completed'}
                    </p>
                  </div>
                </div>
                <p className="text-lg font-black text-green-400">+KES {task.agentPayout || task.fee || 0}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

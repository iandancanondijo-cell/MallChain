import { useEffect, useState } from 'react';
import { getAgentStats } from '../../../api';
import type { AgentStats } from '../../../api/delivery.api';
import { TrendingUp, Star, Package, Target, CheckCircle2, Clock, Award } from 'lucide-react';

export default function Performance() {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAgentStats();
        setStats(data);
      } catch (e) {
        console.error('Failed to load performance stats', e);
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

  const progressBars = [
    { label: 'Success Rate', value: stats?.successRate ?? 100, max: 100, color: 'bg-green-500' },
    { label: 'Daily Goal', value: stats?.goalProgress ?? 0, max: 100, color: 'bg-indigo-500' },
    { label: 'Rating', value: ((stats?.rating ?? 5) / 5) * 100, max: 100, color: 'bg-yellow-500' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          My <span className="text-indigo-400">Performance</span>
        </h1>
        <p className="text-slate-500 font-medium mt-1">Track your delivery metrics and achievements.</p>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-3xl font-black text-white">{stats?.totalCompleted ?? 0}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Completed</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <TrendingUp className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
          <p className="text-3xl font-black text-white">{stats?.successRate ?? 100}%</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Success</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <Star className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <p className="text-3xl font-black text-white">{(stats?.rating ?? 5.0).toFixed(1)}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Rating</p>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-center">
          <Clock className="w-10 h-10 text-orange-400 mx-auto mb-3" />
          <p className="text-3xl font-black text-white">{stats?.todayCompleted ?? 0}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Today</p>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5">
        <h3 className="text-xl font-black text-white mb-6">Performance Metrics</h3>

        <div className="space-y-6">
          {progressBars.map((bar) => (
            <div key={bar.label}>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-bold text-slate-400">{bar.label}</span>
                <span className="text-sm font-black text-white">{bar.value.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${bar.color} transition-all duration-500`}
                  style={{ width: `${bar.value}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Goal */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-indigo-500/10 to-transparent">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
            <Target className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">Daily Goal Progress</h3>
            <p className="text-slate-500 text-sm">Complete {stats?.dailyGoal ?? 10} deliveries for bonus rewards</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all duration-500"
              style={{ width: `${stats?.goalProgress ?? 0}%` }}
            ></div>
          </div>
          <span className="text-lg font-black text-indigo-400">
            {stats?.todayCompleted ?? 0} / {stats?.dailyGoal ?? 10}
          </span>
        </div>

        {(stats?.deliveriesRemaining ?? 0) > 0 && (
          <p className="mt-4 text-sm text-slate-400">
            <Award className="w-4 h-4 inline mr-1 text-yellow-400" />
            {stats?.deliveriesRemaining} more deliveries to earn +50 MallPoints!
          </p>
        )}
      </div>
    </div>
  );
}

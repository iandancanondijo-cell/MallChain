import { useEffect, useState } from "react";
import {
  Clock,
  MapPin,
  ChevronRight,
  Navigation,
  Package,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Wifi,
  WifiOff,
  Star
} from 'lucide-react';
import { Link } from "react-router-dom";
import { getDeliveryTasks, getAgentStats, toggleAgentOnline } from "../../../api";
import StatCard from "../../../components/dashboard/StatCard";
import type { DeliveryTask } from "../../../types";
import type { AgentStats } from "../../../api/delivery.api";

export default function ActiveTasks() {
  const [tasks, setTasks] = useState<DeliveryTask[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingOnline, setTogglingOnline] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [taskData, statsData] = await Promise.all([
          getDeliveryTasks(),
          getAgentStats()
        ]);
        setTasks(taskData.filter(task => task.status !== 'delivered' && task.status !== 'cancelled'));
        setStats(statsData);
      } catch (e) {
        console.error("Failed to load delivery data", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleToggleOnline() {
    if (!stats || togglingOnline) return;
    setTogglingOnline(true);
    try {
      const result = await toggleAgentOnline(!stats.online);
      setStats(prev => prev ? { ...prev, online: result.online } : null);
    } catch (e) {
      console.error("Failed to toggle online status", e);
    } finally {
      setTogglingOnline(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
            Delivery <span className="text-indigo-400">Command Center</span>
          </h1>
          <p className="text-slate-500 font-medium">Manage your active assignments and real-time tracking.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Online Status Badge */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${stats?.online ? 'bg-green-500/10 border border-green-500/20' : 'bg-slate-500/10 border border-slate-500/20'}`}>
            {stats?.online ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-slate-400" />
            )}
            <span className={`text-xs font-black uppercase tracking-widest ${stats?.online ? 'text-green-400' : 'text-slate-400'}`}>
              {stats?.online ? 'Online' : 'Offline'}
            </span>
          </div>
          <Link
            to="/delivery/tasks"
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-black font-black hover:bg-slate-100 transition-all active:scale-[0.98]"
          >
            <Navigation className="w-5 h-5" />
            Available Jobs
          </Link>
        </div>
      </div>

      {/* Stats Overview - All Dynamic */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="Active Drops"
          value={stats?.activeTasks ?? 0}
          icon={Package}
          color="blue"
        />
        <StatCard
          title="Success Rate"
          value={`${stats?.successRate ?? 100}%`}
          icon={ShieldCheck}
          color="green"
        />
        <StatCard
          title="Today's Earnings"
          value={`KES ${(stats?.todayEarnings ?? 0).toLocaleString()}`}
          icon={TrendingUp}
          color="amber"
        />
        <StatCard
          title="Rating"
          value={`${(stats?.rating ?? 5.0).toFixed(1)} ★`}
          icon={Star}
          color="purple"
        />
      </div>

      {/* Tasks Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-black text-white tracking-tight">Current Assignments</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {tasks.length > 0 ? tasks.map((task) => (
              <Link
                key={task.id || task._id}
                to={`/delivery/tasks/${task.id || task._id}`}
                className="glass-dark p-6 rounded-[2rem] border border-white/5 hover:border-indigo-500/30 transition-all group relative overflow-hidden"
              >
                <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-all"></div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                      <Package className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white">#{(task.id || task._id || '').slice(-8).toUpperCase()}</span>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                          {task.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-xs font-bold truncate max-w-[200px]">
                          {task.pickupLocation?.address || task.pickupAddress || 'Pickup location'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 px-4 border-l border-white/5 md:ml-auto">
                    <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Pay</p>
                      <p className="text-lg font-black text-white">KES {task.agentPayout || task.rewardAmount || task.fee || 0}</p>
                    </div>
                    <div className="flex items-center gap-2 text-indigo-400 group-hover:translate-x-1 transition-transform">
                      <span className="text-xs font-black uppercase tracking-widest">Detail</span>
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </Link>
            )) : (
              <div className="glass-dark rounded-[2.5rem] py-20 flex flex-col items-center gap-4 text-center border border-white/5">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                  <CheckCircle2 className="w-8 h-8 text-slate-700" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">All Clear!</h3>
                  <p className="text-slate-500 text-sm font-medium mt-1">No active deliveries at the moment.</p>
                </div>
                <Link
                  to="/delivery/tasks"
                  className="mt-4 px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black text-white hover:bg-white/10 transition-all uppercase tracking-widest"
                >
                  Grab a Job
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Stats / Info - Dynamic */}
        <div className="lg:col-span-4 space-y-8">
          <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-indigo-500/5 to-transparent relative overflow-hidden">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-indigo-500/10 blur-[60px]"></div>
            <h3 className="text-xl font-black text-white mb-6 tracking-tight">Daily Goal</h3>

            <div className="space-y-6 relative z-10">
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-500">Deliveries Progress</span>
                  <span className="text-indigo-400">{stats?.todayCompleted ?? 0} / {stats?.dailyGoal ?? 10}</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all duration-500"
                    style={{ width: `${stats?.goalProgress ?? 0}%` }}
                  ></div>
                </div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                  {stats?.deliveriesRemaining ? `Deliver ${stats.deliveriesRemaining} more to earn +50 MallPoints` : 'Daily goal reached! 🎉'}
                </p>
              </div>

              <button
                onClick={handleToggleOnline}
                disabled={togglingOnline}
                className={`w-full py-4 rounded-2xl text-xs font-black tracking-widest uppercase transition-all disabled:opacity-50 ${stats?.online
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                    : 'bg-white text-black hover:bg-slate-100'
                  }`}
              >
                {togglingOnline ? 'UPDATING...' : stats?.online ? 'GO OFFLINE' : 'GO ONLINE'}
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
            <h3 className="text-sm font-black text-slate-400 mb-4 uppercase tracking-widest">Performance</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Total Completed</span>
                <span className="text-lg font-black text-white">{stats?.totalCompleted ?? 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Today</span>
                <span className="text-lg font-black text-white">{stats?.todayCompleted ?? 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Total Earnings</span>
                <span className="text-lg font-black text-green-400">KES {(stats?.totalEarnings ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

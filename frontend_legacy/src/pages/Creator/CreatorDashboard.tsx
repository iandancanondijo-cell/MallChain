import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Zap, Plus, LayoutDashboard, Target,
  DollarSign, TrendingUp, CheckCircle2,
  ChevronRight, Play, MessageCircle
} from 'lucide-react';
import { useUserStore } from "../../store/userStore";
import { getCreatorTasks, getCreatorStats } from "../../api/task.api";
import StatCard from "../../components/dashboard/StatCard";
import type { Task } from "../../types";
import { socket } from "../../services/socket";
import { toast } from "sonner";

export default function CreatorDashboard() {
  const { user } = useUserStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState({
    totalEarnings: 0,
    completedTasks: 0,
    activeTasks: 0,
    rating: 4.9
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [loadedTasks, loadedStats] = await Promise.all([
          getCreatorTasks(),
          getCreatorStats()
        ]);
        setTasks(loadedTasks);

        const safeStats = loadedStats || {};
        setStats({
          totalEarnings: safeStats.totalEarnings || user?.mallPoints || 0,
          completedTasks: safeStats.completedTasks || 0,
          activeTasks: safeStats.activeTasks || loadedTasks.length || 0,
          rating: safeStats.rating || 4.9
        });
      } catch (e) {
        console.error("Failed to load dashboard data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();

    // Socket events (connection is now handled globally in userStore)
    const token = localStorage.getItem('authToken');
    if (token) {
      socket.on('stats:update', (newStats) => {
        setStats(prev => ({ ...prev, ...newStats }));
        toast.info("Dashboard stats updated");
      });
    }

    return () => {
      socket.off('stats:update');
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">
            Creator Studio
          </h1>
          <p className="text-slate-500 font-medium">Manage your tasks, track earnings, and grow your portfolio.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/chat"
            className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all border border-white/5"
            title="Messages"
          >
            <MessageCircle className="w-5 h-5" />
          </Link>
          <Link
            to="/creator/tasks/new"
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-black font-black hover:bg-slate-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Create New Task
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Earnings"
          value={`PTS ${(stats?.totalEarnings || 0).toLocaleString()}`}
          icon={DollarSign}
          color="purple"
          trend={{ value: '15%', isPositive: true }}
        />
        <StatCard
          title="Tasks Completed"
          value={stats.completedTasks}
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          title="Active Tasks"
          value={stats.activeTasks}
          icon={Zap}
          color="amber"
        />
        <StatCard
          title="Creator Rating"
          value={stats.rating}
          icon={Target}
          color="blue"
          trend={{ value: 'Top 5%', isPositive: true }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content: Active Tasks */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-purple-400" />
              Your Active Tasks
            </h2>
            <Link to="/creator/tasks" className="text-xs font-bold text-purple-400 hover:text-white uppercase tracking-widest flex items-center gap-1 group">
              View All <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="space-y-4">
            {tasks.length > 0 ? tasks.slice(0, 5).map(task => (
              <div key={task._id || task.id} className="group p-6 rounded-[2rem] bg-white/5 border border-white/5 hover:border-purple-500/30 transition-all relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[50px] rounded-full group-hover:bg-purple-500/10 transition-colors"></div>

                <div className="relative z-10 flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-purple-400 shrink-0">
                    <Zap className="w-8 h-8" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${task.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                        task.status === 'active' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-amber-500/10 text-amber-400'
                        }`}>
                        {task.status || 'Active'}
                      </span>
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{task.platform}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white truncate">{task.title}</h3>
                    <p className="text-sm text-slate-400 truncate mt-1 max-w-md">{task.description}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xl font-black text-white">{task.reward} PTS</span>
                    <Link
                      to={`/creator/tasks/${task._id || task.id}`}
                      className="px-5 py-2 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-purple-50 transition-all flex items-center gap-2"
                    >
                      Manage <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            )) : (
              <div className="p-12 rounded-[2.5rem] bg-white/5 border border-white/5 text-center">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Zap className="w-10 h-10 text-slate-600" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">No active tasks</h3>
                <p className="text-slate-500 mb-6 max-w-sm mx-auto">Create your first task or pick one from the available pool to start earning.</p>
                <Link to="/creator/tasks/new" className="px-8 py-3 rounded-2xl bg-purple-500 text-white font-bold hover:bg-purple-600 transition-all">
                  Create Task
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Recommended & Actions */}
        <div className="lg:col-span-4 space-y-8">
          {/* Quick Stats */}
          <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-6">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" /> Performance
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 font-medium">Success Rate</span>
                <span className="text-white font-bold">98%</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-[98%] bg-green-500 rounded-full"></div>
              </div>

              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-slate-400 font-medium">Response Time</span>
                <span className="text-white font-bold">2.4 hrs</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-[85%] bg-blue-500 rounded-full"></div>
              </div>
            </div>
          </div>

          {/* Academy / Tips */}
          <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-purple-500/10 to-transparent relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/20 blur-[60px] rounded-full group-hover:scale-150 transition-transform duration-700"></div>
            <div className="relative z-10">
              <div className="mb-4 w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                <Play className="w-5 h-5 fill-white" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">Creator Academy</h3>
              <p className="text-xs text-slate-300 font-medium leading-relaxed mb-6">
                Learn how to optimize your tasks and earn 3x more points with our advanced guide.
              </p>
              <button className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest backdrop-blur-md transition-all border border-white/10">
                Watch Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

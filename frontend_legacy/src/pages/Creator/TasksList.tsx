import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCreatorTasks } from '../../api/task.api';
import type { Task } from '../../types';
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  Loader2,
  PlusCircle,
  TrendingUp,
  Users,
  Filter,
  Search
} from 'lucide-react';
import { toast } from 'sonner';

export default function CreatorTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'paused'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    setLoading(true);
    try {
      const data = await getCreatorTasks();
      setTasks(data);
    } catch (error: any) {
      toast.error('Failed to load tasks');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const filteredTasks = tasks.filter(task => {
    const matchesFilter = filter === 'all' || task.status === filter;
    const matchesSearch = task.title?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: tasks.length,
    active: tasks.filter(t => t.status === 'active').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    totalBudget: tasks.reduce((sum, t) => sum + (t.budget || 0), 0)
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="pb-20 animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">My Tasks</h1>
          <p className="text-slate-400 font-medium">Manage and track your campaigns</p>
        </div>
        <Link
          to="/creator/tasks/new"
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-black hover:bg-indigo-500 hover:text-white transition-all"
        >
          <PlusCircle className="w-5 h-5" />
          Create Task
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Total Tasks</p>
              <p className="text-3xl font-black text-white mt-2">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-indigo-400" />
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Active</p>
              <p className="text-3xl font-black text-white mt-2">{stats.active}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Completed</p>
              <p className="text-3xl font-black text-white mt-2">{stats.completed}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Total Budget</p>
              <p className="text-3xl font-black text-white mt-2">{stats.totalBudget}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-amber-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-medium focus:border-indigo-500/50 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'completed', 'paused'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === status
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks Grid */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
            <Clock className="w-8 h-8 text-slate-600" />
          </div>
          <h3 className="text-xl font-black text-white">No tasks found</h3>
          <p className="text-slate-500 mt-2 max-w-xs">
            {searchQuery ? 'Try adjusting your search' : 'Create your first task to get started'}
          </p>
          {!searchQuery && (
            <Link
              to="/creator/tasks/new"
              className="mt-6 px-6 py-3 rounded-xl bg-indigo-500 text-white font-bold hover:bg-indigo-600 transition-all"
            >
              Create Task
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredTasks.map((task) => (
            <Link
              key={task._id || task.id}
              to={`/creator/tasks/${task._id || task.id}`}
              className="group bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6 hover:border-indigo-500/30 transition-all hover:-translate-y-1 duration-300"
            >
              {/* Status Badge */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${task.status === 'active'
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : task.status === 'completed'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                >
                  {task.status}
                </span>
                <span className="text-xs font-bold text-slate-500">{task.platform}</span>
              </div>

              {/* Task Title */}
              <h3 className="text-lg font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors line-clamp-2">
                {task.title}
              </h3>

              {/* Description */}
              {task.description && (
                <p className="text-sm text-slate-500 mb-4 line-clamp-2">{task.description}</p>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Budget</p>
                  <p className="text-lg font-black text-white mt-1">{task.budget || task.reward || 0}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Completed</p>
                  <p className="text-lg font-black text-white mt-1">{task.completedCount || 0}</p>
                </div>
              </div>

              {/* Progress Bar */}
              {task.totalSlots && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
                    <span>Progress</span>
                    <span>{Math.round(((task.completedCount || 0) / task.totalSlots) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                      style={{ width: `${Math.min(((task.completedCount || 0) / task.totalSlots) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

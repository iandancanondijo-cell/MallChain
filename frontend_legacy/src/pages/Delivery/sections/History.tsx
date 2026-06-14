import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAgentHistory } from '../../../api';
import type { AgentHistoryResponse } from '../../../api/delivery.api';
import { Package, MapPin, Clock, ChevronRight, CheckCircle2, XCircle, ChevronLeft } from 'lucide-react';

export default function History() {
  const [data, setData] = useState<AgentHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    loadHistory();
  }, [page, filter]);

  async function loadHistory() {
    setLoading(true);
    try {
      const result = await getAgentHistory(page, 10, filter || undefined);
      setData(result);
    } catch (e) {
      console.error('Failed to load history', e);
    } finally {
      setLoading(false);
    }
  }

  const statusColors: Record<string, string> = {
    'delivered': 'bg-green-500/10 text-green-400',
    'failed': 'bg-red-500/10 text-red-400',
    'cancelled': 'bg-red-500/10 text-red-400',
  };

  const statusIcons: Record<string, any> = {
    'delivered': CheckCircle2,
    'failed': XCircle,
    'cancelled': XCircle,
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Delivery <span className="text-indigo-400">History</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">View your past deliveries and performance.</p>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {['', 'delivered', 'failed', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => { setFilter(status); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === status
                ? 'bg-indigo-500 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
            >
              {status || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      )}

      {/* Empty State */}
      {!loading && (!data?.tasks || data.tasks.length === 0) && (
        <div className="glass-dark rounded-[2.5rem] py-20 flex flex-col items-center gap-4 text-center border border-white/5">
          <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <Clock className="w-10 h-10 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">No History Yet</h3>
            <p className="text-slate-500 text-sm font-medium mt-2">
              Complete some deliveries to see your history here.
            </p>
          </div>
          <Link
            to="/delivery/tasks"
            className="mt-4 px-8 py-3 rounded-xl bg-white text-black text-xs font-black hover:bg-slate-100 transition-all uppercase tracking-widest"
          >
            Find Jobs
          </Link>
        </div>
      )}

      {/* History List */}
      {!loading && data?.tasks && data.tasks.length > 0 && (
        <div className="space-y-4">
          {data.tasks.map((task) => {
            const taskId = task._id || task.id || '';
            const StatusIcon = statusIcons[task.status] || Package;

            return (
              <Link
                key={taskId}
                to={`/delivery/tasks/${taskId}`}
                className="glass-dark p-6 rounded-[2rem] border border-white/5 hover:border-indigo-500/30 transition-all group flex items-center gap-6"
              >
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center flex-shrink-0">
                  <StatusIcon className={`w-7 h-7 ${task.status === 'delivered' ? 'text-green-400' : 'text-red-400'}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-sm font-black text-white">#{taskId.slice(-8).toUpperCase()}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusColors[task.status] || 'bg-slate-500/10 text-slate-400'}`}>
                      {task.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs font-medium truncate">
                      {task.dropoffLocation?.address || 'Completed delivery'}
                    </span>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-black text-green-400">+KES {task.agentPayout || task.fee || 0}</p>
                  <p className="text-xs text-slate-500">
                    {task.deliveredAt ? new Date(task.deliveredAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <span className="text-sm font-bold text-slate-400">
            Page {page} of {data.pagination.pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data.pagination.pages, p + 1))}
            disabled={page >= data.pagination.pages}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

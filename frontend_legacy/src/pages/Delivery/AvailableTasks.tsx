import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeliveryTasks, acceptTask } from '../../api';
import type { DeliveryTask } from '../../types';
import { MapPin, Package, Clock, DollarSign, ChevronRight, Loader2 } from 'lucide-react';

export default function AvailableTasks() {
  const [tasks, setTasks] = useState<DeliveryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const taskList = await getDeliveryTasks();
      // Filter to show only unassigned tasks
      setTasks(taskList.filter(t => t.status === 'unassigned'));
    } catch (e: any) {
      setError(e.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptTask(taskId: string) {
    setAccepting(taskId);
    try {
      await acceptTask(taskId);
      setTasks(prev => prev.filter(t => (t._id || t.id) !== taskId));
    } catch (e: any) {
      alert(e.message || 'Could not accept task');
    } finally {
      setAccepting(null);
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Available <span className="text-green-400">Jobs</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">Pick up deliveries near you and start earning.</p>
        </div>
        <button
          onClick={loadTasks}
          className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black text-white hover:bg-white/10 transition-all uppercase tracking-widest"
        >
          Refresh Jobs
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-center">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!error && tasks.length === 0 && (
        <div className="glass-dark rounded-[2.5rem] py-20 flex flex-col items-center gap-4 text-center border border-white/5">
          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
            <Package className="w-10 h-10 text-green-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">No Jobs Available</h3>
            <p className="text-slate-500 text-sm font-medium mt-2 max-w-md">
              All deliveries have been claimed. Check back soon or turn on notifications to get alerted when new jobs are posted.
            </p>
          </div>
          <Link
            to="/delivery"
            className="mt-4 px-8 py-3 rounded-xl bg-white text-black text-xs font-black hover:bg-slate-100 transition-all uppercase tracking-widest"
          >
            Back to Dashboard
          </Link>
        </div>
      )}

      {/* Tasks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tasks.map(task => {
          const taskId = task._id || task.id || '';
          const isAccepting = accepting === taskId;

          return (
            <div
              key={taskId}
              className="glass-dark p-6 rounded-[2rem] border border-white/5 hover:border-green-500/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                    <Package className="w-7 h-7 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Order</p>
                    <p className="text-lg font-black text-white">#{taskId.slice(-8).toUpperCase()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Payout</p>
                  <p className="text-2xl font-black text-green-400">KES {task.agentPayout || task.fee || 0}</p>
                </div>
              </div>

              {/* Locations */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pickup</p>
                    <p className="text-sm font-bold text-white">{task.pickupLocation?.address || 'Location pending'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Dropoff</p>
                    <p className="text-sm font-bold text-white">{task.dropoffLocation?.address || 'Location pending'}</p>
                  </div>
                </div>
              </div>

              {/* Meta Info */}
              <div className="flex items-center gap-4 mb-6 text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-bold">~{task.expectedDurationSec ? Math.round(task.expectedDurationSec / 60) : 20} min</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs font-bold">Fee: KES {task.fee || 0}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleAcceptTask(taskId)}
                  disabled={isAccepting}
                  className="flex-1 py-4 rounded-2xl bg-green-500 text-white font-black text-sm hover:bg-green-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAccepting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    'ACCEPT JOB'
                  )}
                </button>
                <Link
                  to={`/delivery/tasks/${taskId}`}
                  className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black text-sm hover:bg-white/10 transition-all flex items-center gap-2"
                >
                  Details
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

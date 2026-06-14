import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getDeliveryTask, pickupTask, deliverTask, rateDelivery } from '../../api';
import type { DeliveryTask } from '../../types';
import {
  MapPin, Package, Clock, User, Phone, CheckCircle2,
  ArrowLeft, Camera, Star, Loader2, Navigation
} from 'lucide-react';

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<DeliveryTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [showRating, setShowRating] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadTask();
  }, [id]);

  async function loadTask() {
    setLoading(true);
    try {
      const data = await getDeliveryTask(id!);
      setTask(data);
      if (data.status === 'delivered') {
        setShowRating(true);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }

  async function handlePickup() {
    if (!task) return;
    setActionLoading('pickup');
    try {
      await pickupTask(task._id || task.id!);
      await loadTask();
    } catch (e: any) {
      alert(e.message || 'Failed to confirm pickup');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeliver() {
    if (!task) return;
    setActionLoading('deliver');
    try {
      await deliverTask(task._id || task.id!);
      await loadTask();
    } catch (e: any) {
      alert(e.message || 'Failed to confirm delivery');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRate() {
    if (!task) return;
    setActionLoading('rate');
    try {
      await rateDelivery({ taskId: task._id || task.id!, role: 'agent', rating });
      navigate('/delivery');
    } catch (e: any) {
      alert(e.message || 'Failed to submit rating');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="text-center py-20">
        <div className="text-red-400 mb-4">{error || 'Task not found'}</div>
        <Link to="/delivery" className="text-indigo-400 hover:underline">Back to Dashboard</Link>
      </div>
    );
  }

  const taskId = task._id || task.id || '';
  const statusColors: Record<string, string> = {
    'unassigned': 'bg-slate-500/10 text-slate-400',
    'assigned': 'bg-blue-500/10 text-blue-400',
    'accepted': 'bg-indigo-500/10 text-indigo-400',
    'enroute_pickup': 'bg-yellow-500/10 text-yellow-400',
    'picked_up': 'bg-orange-500/10 text-orange-400',
    'enroute_dropoff': 'bg-purple-500/10 text-purple-400',
    'delivered': 'bg-green-500/10 text-green-400',
    'failed': 'bg-red-500/10 text-red-400',
    'cancelled': 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-white">Task #{taskId.slice(-8).toUpperCase()}</h1>
          <p className="text-slate-500 text-sm font-medium">Delivery Details</p>
        </div>
        <span className={`ml-auto px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${statusColors[task.status] || 'bg-slate-500/10 text-slate-400'}`}>
          {task.status?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Payout Card */}
      <div className="glass-dark p-8 rounded-[2rem] border border-white/5 text-center">
        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Your Payout</p>
        <p className="text-5xl font-black text-green-400">KES {task.agentPayout || task.fee || 0}</p>
      </div>

      {/* Locations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Pickup</p>
              <p className="text-white font-bold">{task.pickupLocation?.address || 'Location not set'}</p>
            </div>
          </div>
          <a
            href={`https://maps.google.com/?q=${task.pickupLocation?.lat},${task.pickupLocation?.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-indigo-400 hover:underline"
          >
            <Navigation className="w-4 h-4" />
            Open in Maps
          </a>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Dropoff</p>
              <p className="text-white font-bold">{task.dropoffLocation?.address || 'Location not set'}</p>
            </div>
          </div>
          <a
            href={`https://maps.google.com/?q=${task.dropoffLocation?.lat},${task.dropoffLocation?.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-indigo-400 hover:underline"
          >
            <Navigation className="w-4 h-4" />
            Open in Maps
          </a>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
        {task.status === 'accepted' || task.status === 'enroute_pickup' ? (
          <button
            onClick={handlePickup}
            disabled={actionLoading === 'pickup'}
            className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-lg hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {actionLoading === 'pickup' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            CONFIRM PICKUP
          </button>
        ) : task.status === 'picked_up' || task.status === 'enroute_dropoff' ? (
          <button
            onClick={handleDeliver}
            disabled={actionLoading === 'deliver'}
            className="w-full py-4 rounded-2xl bg-green-500 text-white font-black text-lg hover:bg-green-600 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {actionLoading === 'deliver' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            CONFIRM DELIVERY
          </button>
        ) : task.status === 'delivered' && showRating ? (
          <div className="space-y-4">
            <p className="text-center text-white font-bold">Rate this delivery</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className={`p-2 rounded-lg transition-all ${rating >= star ? 'text-yellow-400' : 'text-slate-600'}`}
                >
                  <Star className="w-8 h-8" fill={rating >= star ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <button
              onClick={handleRate}
              disabled={actionLoading === 'rate'}
              className="w-full py-4 rounded-2xl bg-indigo-500 text-white font-black hover:bg-indigo-600 transition-all disabled:opacity-50"
            >
              {actionLoading === 'rate' ? 'Submitting...' : 'SUBMIT RATING'}
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
            <p className="text-white font-bold">Delivery Complete</p>
            <p className="text-slate-500 text-sm">This task has been completed.</p>
          </div>
        )}
      </div>

      {/* Back Link */}
      <Link
        to="/delivery"
        className="block text-center py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}

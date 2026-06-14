import { useEffect, useState } from 'react';
import { getAgentStats } from '../../../api';
import type { AgentStats } from '../../../api/delivery.api';
import { Star, ThumbsUp, MessageSquare } from 'lucide-react';

export default function Ratings() {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAgentStats();
        setStats(data);
      } catch (e) {
        console.error('Failed to load ratings', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  const rating = stats?.rating ?? 5.0;
  const stars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          My <span className="text-yellow-400">Ratings</span>
        </h1>
        <p className="text-slate-500 font-medium mt-1">Your customer feedback and ratings.</p>
      </div>

      {/* Main Rating Card */}
      <div className="glass-dark p-10 rounded-[2.5rem] border border-white/5 text-center bg-gradient-to-br from-yellow-500/10 to-transparent">
        <div className="flex items-center justify-center gap-2 mb-4">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`w-10 h-10 ${star <= stars ? 'text-yellow-400' : star === stars + 1 && hasHalf ? 'text-yellow-400/50' : 'text-slate-700'}`}
              fill={star <= stars ? 'currentColor' : 'none'}
            />
          ))}
        </div>
        <p className="text-5xl font-black text-white mb-2">{rating.toFixed(1)}</p>
        <p className="text-sm text-slate-500">Based on {stats?.totalCompleted ?? 0} completed deliveries</p>
      </div>

      {/* Rating Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-green-500/10 flex items-center justify-center">
            <ThumbsUp className="w-7 h-7 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-green-400">{stats?.successRate ?? 100}%</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Positive Reviews</p>
          </div>
        </div>

        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <MessageSquare className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-blue-400">{stats?.totalCompleted ?? 0}</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Reviews</p>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5">
        <h3 className="text-xl font-black text-white mb-4">Tips to Improve Ratings</h3>
        <ul className="space-y-3 text-slate-400">
          <li className="flex items-start gap-3">
            <Star className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <span>Always communicate with customers about delivery status</span>
          </li>
          <li className="flex items-start gap-3">
            <Star className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <span>Handle packages with care and professionalism</span>
          </li>
          <li className="flex items-start gap-3">
            <Star className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <span>Be punctual and reliable with your deliveries</span>
          </li>
          <li className="flex items-start gap-3">
            <Star className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <span>Maintain a clean and presentable appearance</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

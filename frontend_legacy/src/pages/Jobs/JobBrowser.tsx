import { useEffect, useState } from 'react';
import { getJobs, JobListing as JobType } from '../../api/job.api';
import {
  Activity,
  Search,
  MapPin,
  Briefcase,
  Zap,
  Filter,
  ArrowRight,
  SearchCode,
  Clock,
  LayoutGrid,
  List
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function JobBrowser() {
  const [jobs, setJobs] = useState<JobType[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    type: '',
  });

  const navigate = useNavigate();

  // 🔥 debounced search
  useEffect(() => {
    const t = setTimeout(fetchJobs, 300);
    return () => clearTimeout(t);
  }, [filters.search, filters.category, filters.type]);

  async function fetchJobs() {
    try {
      setLoading(true);
      setJobs(await getJobs(filters));
    } catch {
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  const categories = [
    'Tech',
    'Marketing',
    'Design',
    'Sales',
    'Customer Service',
    'Writing',
    'Translation',
  ];

  const types = ['Full-time', 'Part-time', 'Contract', 'Remote'];

  return (
    <div className="space-y-12 animate-fade-in pb-32">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-black text-white tracking-tight">Job Marketplace</h1>
            <div className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase tracking-widest">
              Live Feed
            </div>
          </div>
          <p className="text-slate-400 font-medium">Explore verified opportunities across the distributed network.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 min-w-[140px]">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Listings</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-black text-white">{jobs.length}</span>
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>
          <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 min-w-[140px] hidden md:block">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Network Status</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-black text-white">99.9%</span>
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
            </div>
          </div>
        </div>
      </div>

      {/* COMPACT ACTION BAR */}
      <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-3 flex flex-col md:flex-row items-center gap-4 shadow-2xl">
        <div className="flex-1 relative flex items-center w-full">
          <Search className="absolute left-5 text-slate-600 w-4 h-4" />
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search listings..."
            className="w-full h-12 pl-12 pr-6 bg-white/5 border border-white/10 rounded-xl text-[11px] font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 outline-none transition-all uppercase tracking-widest"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-3 px-6 h-12 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest border ${showFilters || filters.category || filters.type
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/30'
              : 'bg-white/5 text-slate-500 border-white/5 hover:bg-white/10'
              }`}
          >
            <Filter className="w-3.5 h-3.5" /> Filter {filters.category || filters.type ? `(Active)` : ''}
          </button>

          <div className="h-12 p-1 bg-white/5 rounded-xl border border-white/5 flex items-center">
            <button
              onClick={() => setViewMode('grid')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${viewMode === 'grid' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${viewMode === 'list' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => navigate('/jobs/create')}
            className="h-12 px-8 rounded-xl bg-white text-black font-black text-[9px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all active:scale-95 shadow-xl whitespace-nowrap"
          >
            Post a Job
          </button>
        </div>
      </div>

      {/* EXPANDABLE FILTER CABINET */}
      {showFilters && (
        <div className="max-w-6xl mx-auto mt-6 p-10 bg-[#0a0a0a] border border-white/10 rounded-[3.5rem] shadow-[0_60px_120px_rgba(0,0,0,0.9)] animate-in fade-in slide-in-from-top-4 duration-500 z-50">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600 block pl-1 italic">
                  Domain Matrix
                </label>
                {filters.category && (
                  <button onClick={() => setFilters(f => ({ ...f, category: '' }))} className="text-[9px] font-black text-purple-400 uppercase tracking-widest hover:text-white transition-colors">Reset</button>
                )}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFilters((f) => ({ ...f, category: f.category === c ? '' : c }))}
                    className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all italic ${filters.category === c
                      ? 'bg-white text-black shadow-[0_0_40px_rgba(255,255,255,0.2)] scale-105'
                      : 'bg-white/2 text-slate-500 hover:bg-white/5 hover:text-white border border-white/5'
                      }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600 block pl-1 italic">
                  Engagement Protocol
                </label>
                {filters.type && (
                  <button onClick={() => setFilters(f => ({ ...f, type: '' }))} className="text-[9px] font-black text-purple-400 uppercase tracking-widest hover:text-white transition-colors">Reset</button>
                )}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {types.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilters((f) => ({ ...f, type: f.type === t ? '' : t }))}
                    className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border italic ${filters.type === t
                      ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_30px_rgba(168,85,247,0.4)] scale-105'
                      : 'bg-white/2 border-white/5 text-slate-500 hover:bg-white/5 hover:text-white'
                      }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BROWSER GRID / LIST */}
      <section className="px-4 md:px-12 xl:px-0 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.5em] flex items-center gap-4">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            Live Flux ({jobs.length} Results)
          </h2>
        </div>

        {loading ? (
          <div className={`grid gap-10 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-80 rounded-[4rem] bg-white/2 border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className={`grid gap-10 lg:gap-12 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {jobs.map((job) => (
              <article
                key={job._id}
                onClick={() => navigate(`/jobs/${job._id}`)}
                className={`group relative cursor-pointer overflow-hidden rounded-[2rem] bg-slate-950/40 backdrop-blur-xl border border-white/5 transition-all duration-500 hover:border-indigo-500/50 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] active:scale-[0.98] ${viewMode === 'grid' ? 'flex flex-col h-full' : 'flex flex-row p-6 items-center gap-8'
                  }`}
              >
                {/* Background Glow - Subtle & System Aligned */}
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                {/* Status Overlay */}
                <div className="absolute top-4 right-4 z-20">
                  {job.premium && (
                    <div className="flex items-center gap-1.5 rounded-full bg-indigo-500 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-white shadow-lg border border-white/10 italic">
                      <Zap className="h-2 w-2 fill-white" /> Priority
                    </div>
                  )}
                </div>

                {/* Card Content - Compact & Refined */}
                <div className={`flex-1 p-6 space-y-4 ${viewMode === 'list' ? 'p-0' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className={`font-black text-white italic group-hover:text-indigo-400 transition-colors tracking-tight leading-tight ${viewMode === 'grid' ? 'text-xl' : 'text-2xl'
                        }`}>
                        {job.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-400 transition-colors">
                          {job.employer.fullName || job.employer.username}
                        </p>
                      </div>
                    </div>

                    <div className={`shrink-0 w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:border-indigo-500/30`}>
                      {job.employer.avatar ? (
                        <img src={job.employer.avatar} alt="" className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <Briefcase className="w-4 h-4 text-slate-600 group-hover:text-indigo-400" />
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[8px] font-black uppercase tracking-widest">
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-slate-500 group-hover:text-slate-400 transition-colors">
                      <MapPin className="w-3 h-3 text-indigo-500" /> {job.location}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-slate-500 group-hover:text-slate-400 transition-colors">
                      <Clock className="w-3 h-3 text-emerald-500" /> {job.jobType}
                    </span>
                  </div>

                  <p className={`text-slate-500 leading-relaxed font-medium transition-colors group-hover:text-slate-400 ${viewMode === 'grid' ? 'text-xs line-clamp-2' : 'text-sm line-clamp-2 max-w-2xl'
                    }`}>
                    {job.description}
                  </p>

                  <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                    <div>
                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Yield</p>
                      <p className="text-xl font-black text-white tracking-tighter">
                        <span className="text-indigo-400 italic text-[10px] mr-1">KSH</span>
                        {job.salaryRange.min.toLocaleString()}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-indigo-500 group-hover:border-indigo-500 transition-all duration-500">
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </div>

                {/* Bottom Highlight Bar - Consistent with StatCard */}
                <div className="absolute bottom-0 left-0 h-[1.5px] bg-indigo-500/50 w-full scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
              </article>
            ))}
          </div>
        )}

        {!loading && jobs.length === 0 && (
          <div className="p-40 text-center rounded-[5rem] bg-white/[0.01] border border-dashed border-white/10 flex flex-col items-center justify-center space-y-8">
            <div className="relative">
              <div className="absolute inset-0 bg-purple-500/20 blur-[60px] animate-pulse" />
              <div className="relative w-24 h-24 bg-[#0a0a0a] border border-white/10 rounded-full flex items-center justify-center">
                <SearchCode className="text-slate-800 w-12 h-12" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-4xl font-black text-white uppercase italic tracking-tighter">Null Result Vector</h3>
              <p className="text-slate-600 font-bold text-xl uppercase tracking-widest opacity-60">The grid remains empty. Adjust your query.</p>
            </div>
            <button
              onClick={() => setFilters({ search: '', category: '', type: '' })}
              className="px-12 py-5 bg-white text-black rounded-3xl font-black uppercase text-[10px] tracking-widest hover:bg-purple-600 hover:text-white transition-all active:scale-95"
            >
              Reset Grid Parameters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

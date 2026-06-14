import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getJobDetail, applyForJob, confirmJobDone, releasePayment, JobListing as JobType } from '../../api/job.api';
import { useUserStore } from '../../store/userStore';
import {
    ArrowLeft, MapPin, Briefcase, Calendar,
    DollarSign, Zap, ShieldCheck, Share2,
    CheckCircle, Globe, Send, Loader2, FileText,
    Settings, Clock, CreditCard, Star, Building2
} from 'lucide-react';
import { toast } from 'sonner';

export default function JobDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useUserStore();
    const [job, setJob] = useState<JobType | null>(null);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [showApplyForm, setShowApplyForm] = useState(false);

    const [form, setForm] = useState({
        coverLetter: '',
        resumeUrl: '',
        expectedSalary: 0
    });

    useEffect(() => {
        if (id) fetchJob();
    }, [id]);

    async function fetchJob() {
        try {
            const data = await getJobDetail(id!);
            setJob(data);
        } catch (e) {
            toast.error("Job not found");
            navigate('/jobs');
        } finally {
            setLoading(false);
        }
    }

    async function handleApply(e: React.FormEvent) {
        e.preventDefault();
        if (!id) return;

        try {
            setApplying(true);
            await applyForJob(id, form);
            toast.success("Application submitted successfully!");
            setShowApplyForm(false);
            fetchJob(); // Refresh to show applied status if needed
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to apply");
        } finally {
            setApplying(false);
        }
    }

    async function handleConfirmDone() {
        if (!id) return;
        try {
            setApplying(true);
            await confirmJobDone(id);
            toast.success("Job marked as completed!");
            fetchJob();
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to mark as done");
        } finally {
            setApplying(false);
        }
    }

    async function handleReleasePayment() {
        if (!id) return;
        try {
            setApplying(true);
            await releasePayment(id);
            toast.success("Payment released to applicant!");
            fetchJob();
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to release payment");
        } finally {
            setApplying(false);
        }
    }

    if (loading) {
        return (
            <div className="h-screen flex flex-col items-center justify-center text-white space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Loading job details...</p>
            </div>
        );
    }

    if (!job) return null;

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20 p-4 md:p-6 lg:p-0">
            {/* Nav & Action Bar */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/jobs')}
                    className="group flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-all font-black uppercase tracking-widest text-[10px]">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Jobs
                </button>
                <div className="flex items-center gap-3">
                    <button className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5">
                        <Share2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
                <div className="space-y-8">
                    {/* JOB HEADER CARD */}
                    <div className="relative overflow-hidden bg-[#0a0a0a] rounded-[2rem] border border-white/5 p-8 md:p-10">
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row gap-6 items-start">
                                <div className="shrink-0">
                                    <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                                        {job.employer.avatar ? (
                                            <img src={job.employer.avatar} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <Building2 className="w-8 h-8 text-slate-600" />
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400">
                                                Open Position
                                            </span>
                                            {job.premium && (
                                                <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-[9px] font-black uppercase tracking-[0.2em]">
                                                    <Zap className="w-3 h-3 fill-current" /> Featured
                                                </span>
                                            )}
                                        </div>
                                        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight break-words">
                                            {job.title}
                                        </h1>
                                    </div>

                                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-slate-400 font-bold text-xs uppercase tracking-widest">
                                        <span className="flex items-center gap-2 break-all">
                                            <Star className="w-4 h-4 text-amber-500 fill-current shrink-0" />
                                            <span className="truncate">{job.employer.fullName || job.employer.username}</span>
                                        </span>
                                        <span className="flex items-center gap-2 break-all">
                                            <MapPin className="w-4 h-4 text-slate-600 shrink-0" />
                                            <span className="truncate">{job.location}</span>
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <Briefcase className="w-4 h-4 text-slate-600" /> {job.jobType}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* JOB DETAILS */}
                    <div className="grid grid-cols-1 gap-8">
                        <section className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-8 md:p-10 space-y-10">
                            <div className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                                        <FileText className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <h2 className="text-xl font-black text-white uppercase tracking-tight">
                                        Job Description
                                    </h2>
                                </div>
                                <div className="prose prose-invert max-w-none">
                                    <p className="text-slate-400 leading-relaxed text-base whitespace-pre-wrap font-medium break-words">
                                        {job.description}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-6 pt-6 border-t border-white/5">
                                <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
                                    <Zap className="text-emerald-500 w-5 h-5" /> Required Skills
                                </h2>
                                <div className="flex flex-wrap gap-3">
                                    {job.skillsRequired.map(skill => (
                                        <div key={skill} className="group px-5 py-3 bg-white/5 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/10 hover:text-white hover:border-indigo-500/30 transition-all cursor-default flex items-center gap-2 break-words">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 group-hover:scale-125 transition-transform shrink-0" />
                                            <span className="break-all">{skill}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                {/* SIDEBAR ANALYSIS & ACTION */}
                <aside className="space-y-8">
                    <div className="sticky top-24 space-y-8">
                        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-8 relative overflow-hidden">
                            <div className="space-y-8">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] pl-1">Salary Range</p>
                                    <div className="text-3xl font-black text-white tracking-tight flex items-baseline gap-2">
                                        <span className="text-emerald-500 text-xl uppercase">KSH</span>
                                        {job.salaryRange.max > 0
                                            ? `${job.salaryRange.min.toLocaleString()} - ${job.salaryRange.max.toLocaleString()}`
                                            : job.salaryRange.min.toLocaleString()
                                        }
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3">
                                    {[
                                        { icon: Calendar, label: "Posted", value: new Date(job.createdAt).toLocaleDateString() },
                                        { icon: Zap, label: "Category", value: job.category },
                                        { icon: Globe, label: "Location", value: job.location }
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 group hover:bg-white/10 transition-all">
                                            <div className="flex items-center gap-3">
                                                <item.icon className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.label}</span>
                                            </div>
                                            <span className="text-xs font-black text-white uppercase">{item.value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* DYNAMIC ACTION STATES */}
                                <div className="pt-4">
                                    {(() => {
                                        const employerId = typeof job.employer === 'string' ? job.employer : (job.employer as any)?._id;
                                        const currentUserId = user?._id || user?.id;
                                        const isOwner = employerId && currentUserId && employerId === currentUserId;

                                        if ((job as any).paymentStatus === 'paid') {
                                            return (
                                                <div className="p-8 bg-emerald-500/10 rounded-[2.5rem] border border-emerald-500/20 text-center space-y-4">
                                                    <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                                        <CheckCircle className="w-7 h-7 text-emerald-400" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-black text-white uppercase tracking-[0.2em]">Job Completed</p>
                                                        <p className="text-[10px] text-emerald-400/60 font-black uppercase tracking-widest">Payment Released</p>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        if ((job as any).paymentStatus === 'escrowed') {
                                            return (
                                                <div className="space-y-6">
                                                    <div className="p-5 bg-indigo-500/10 rounded-3xl border border-indigo-500/20 flex items-center gap-4">
                                                        <div className="relative">
                                                            <div className="w-3 h-3 bg-indigo-500 rounded-full animate-ping absolute inset-0" />
                                                            <Clock className="w-5 h-5 text-indigo-400 relative z-10" />
                                                        </div>
                                                        <p className="text-[10px] font-black text-white uppercase tracking-widest">Work in Progress • Funds Secured</p>
                                                    </div>

                                                    {isOwner ? (
                                                        <button
                                                            onClick={handleReleasePayment}
                                                            disabled={applying}
                                                            className="w-full py-5 rounded-xl bg-white text-black font-black text-sm uppercase tracking-[0.2em] hover:bg-indigo-600 hover:text-white transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50">
                                                            {applying ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                                                            Release Payment
                                                        </button>
                                                    ) : (job as any).hiredUser === currentUserId ? (
                                                        <button
                                                            onClick={handleConfirmDone}
                                                            disabled={applying}
                                                            className="w-full py-5 rounded-xl bg-indigo-600 text-white font-black text-sm uppercase tracking-[0.2em] hover:bg-indigo-500 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50">
                                                            {applying ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                                                            Mark as Complete
                                                        </button>
                                                    ) : (
                                                        <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 text-center">
                                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Position Filled</p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }

                                        if (!showApplyForm && !isOwner) {
                                            return (
                                                <button
                                                    onClick={() => setShowApplyForm(true)}
                                                    className="w-full py-5 rounded-xl bg-indigo-600 text-white font-black text-sm uppercase tracking-[0.2em] hover:bg-indigo-500 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3">
                                                    Apply for Position <ArrowLeft className="w-4 h-4 rotate-180" />
                                                </button>
                                            );
                                        }

                                        if (!showApplyForm && isOwner) {
                                            return (
                                                <button
                                                    onClick={() => navigate('/jobs/manage')}
                                                    className="w-full py-5 rounded-xl bg-white/5 border border-white/10 text-white font-black text-sm uppercase tracking-[0.2em] hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                                                    Manage Listing <Settings className="w-5 h-5" />
                                                </button>
                                            );
                                        }

                                        return (
                                            <form onSubmit={handleApply} className="space-y-8 animate-fade-in">
                                                <div className="space-y-5">
                                                    <div>
                                                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-3 pl-1">Expected Salary (KSH)</label>
                                                        <div className="relative group">
                                                            <DollarSign className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                                                            <input
                                                                type="number"
                                                                required
                                                                value={form.expectedSalary}
                                                                onChange={e => setForm(prev => ({ ...prev, expectedSalary: Number(e.target.value) }))}
                                                                className="w-full h-14 bg-white/5 border border-white/5 rounded-xl pl-12 pr-6 text-white text-sm font-bold focus:outline-none focus:border-indigo-500/40 transition-all placeholder:text-slate-700"
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-3 pl-1">Resume URL</label>
                                                        <input
                                                            type="url"
                                                            required
                                                            placeholder="https://..."
                                                            value={form.resumeUrl}
                                                            onChange={e => setForm(prev => ({ ...prev, resumeUrl: e.target.value }))}
                                                            className="w-full h-14 bg-white/5 border border-white/5 rounded-xl px-6 text-white text-sm font-bold focus:outline-none focus:border-indigo-500/40 transition-all placeholder:text-slate-700"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-3 pl-1">Cover Letter</label>
                                                        <textarea
                                                            rows={4}
                                                            value={form.coverLetter}
                                                            onChange={e => setForm(prev => ({ ...prev, coverLetter: e.target.value }))}
                                                            className="w-full bg-white/5 border border-white/5 rounded-xl p-6 text-white text-sm font-bold focus:outline-none focus:border-indigo-500/40 transition-all resize-none placeholder:text-slate-700"
                                                            placeholder="Why are you a good fit for this role?"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    <button
                                                        type="submit"
                                                        disabled={applying}
                                                        className="w-full py-5 rounded-xl bg-indigo-600 text-white font-black text-sm uppercase tracking-[0.2em] hover:bg-indigo-500 shadow-xl disabled:opacity-50 flex items-center justify-center gap-3 transition-all active:scale-95">
                                                        {applying ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-4 h-4" /> Submit Application</>}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowApplyForm(false)}
                                                        className="w-full py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </form>
                                        );
                                    })()}
                                </div>

                                <div className="pt-6 border-t border-white/5 flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                        <ShieldCheck className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-white font-black uppercase tracking-widest leading-relaxed">Secure Escrow Service</p>
                                        <p className="text-[9px] text-slate-600 font-bold leading-relaxed uppercase">
                                            Funds are held securely until job completion. Dispute resolution available.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

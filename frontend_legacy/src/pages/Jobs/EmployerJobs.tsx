import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEmployerJobs, hireApplicant, releasePayment, JobListing } from '../../api/job.api';
import {
    Briefcase, Users, DollarSign,
    CheckCircle, Clock, Loader2, UserCheck,
    CreditCard, FileText
} from 'lucide-react';
import { toast } from 'sonner';

export default function EmployerJobs() {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<JobListing[]>([]);
    const [activeTab, setActiveTab] = useState<'listings' | 'active'>('listings');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        fetchJobs();
    }, []);

    async function fetchJobs() {
        try {
            const data = await getEmployerJobs();
            setJobs(data);
        } catch (e) {
            toast.error("Failed to load your jobs");
        } finally {
            setLoading(false);
        }
    }

    const recruitmentListings = jobs.filter(j => j.status === 'open');
    const activeJobs = jobs.filter(j => j.status === 'closed' || (j as any).paymentStatus === 'escrowed' || (j as any).paymentStatus === 'paid');

    async function handleHire(jobId: string, appId: string) {
        try {
            setActionLoading(`hire-${appId}`);
            await hireApplicant(jobId, appId);
            toast.success("Applicant hired and funds locked in escrow!");
            fetchJobs();
            setActiveTab('active'); // Switch to active jobs view after hiring
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to hire applicant");
        } finally {
            setActionLoading(null);
        }
    }

    async function handleReleasePayment(jobId: string) {
        try {
            setActionLoading(`pay-${jobId}`);
            await releasePayment(jobId);
            toast.success("Payment released to the applicant!");
            fetchJobs();
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to release payment");
        } finally {
            setActionLoading(null);
        }
    }

    if (loading) return <div className="h-screen flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;

    const displayJobs = activeTab === 'listings' ? recruitmentListings : activeJobs;

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-black text-white mb-2">Employer Console</h1>
                    <p className="text-slate-400 font-medium tracking-wide">Manage your listings, applicants, and secure payments.</p>
                </div>
                <button
                    onClick={() => navigate('/jobs/create')}
                    className="px-6 py-3 bg-white text-black rounded-xl font-black hover:bg-slate-200 transition-all shadow-xl active:scale-95 flex items-center gap-2"
                >
                    <Briefcase className="w-5 h-5" /> Post New Job
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 p-1.5 bg-[#0a0a0a] rounded-2xl border border-white/5 w-fit">
                <button
                    onClick={() => setActiveTab('listings')}
                    className={`px-8 py-3 rounded-xl text-sm font-black transition-all ${activeTab === 'listings' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                >
                    Recruitment Listings ({recruitmentListings.length})
                </button>
                <button
                    onClick={() => setActiveTab('active')}
                    className={`px-8 py-3 rounded-xl text-sm font-black transition-all ${activeTab === 'active' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                >
                    Active Jobs ({activeJobs.length})
                </button>
            </div>

            {displayJobs.length === 0 ? (
                <div className="bg-[#0a0a0a] rounded-[2.5rem] border border-white/5 p-20 text-center space-y-6">
                    <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto">
                        <Briefcase className="w-10 h-10 text-slate-600" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-white">{activeTab === 'listings' ? 'No recruitment listings' : 'No active jobs'}</h2>
                        <p className="text-slate-500 max-w-sm mx-auto">
                            {activeTab === 'listings'
                                ? "You haven't posted any jobs yet. Start by creating your first opportunity."
                                : "You don't have any hired candidates or ongoing contracts at the moment."}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-6">
                    {displayJobs.map(job => (
                        <div key={job._id} className="bg-[#0a0a0a] rounded-[2.5rem] border border-white/5 p-8 hover:border-white/10 transition-all shadow-2xl relative overflow-hidden group">
                            {/* Status Badge */}
                            <div className="absolute top-8 right-8">
                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${job.status === 'open' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                    'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                    }`}>
                                    {job.status === 'open' ? 'Open for applications' : (job as any).paymentStatus === 'escrowed' ? 'In Progress' : 'Completed'}
                                </span>
                            </div>

                            <div className="flex flex-col md:flex-row gap-8">
                                <div className="flex-1 space-y-6">
                                    <div className="space-y-2">
                                        <h2 className="text-2xl font-black text-white group-hover:text-purple-400 transition-colors cursor-pointer" onClick={() => navigate(`/jobs/${job._id}`)}>{job.title}</h2>
                                        <div className="flex items-center gap-4 text-sm font-bold text-slate-500">
                                            <span className="flex items-center gap-1.5"><DollarSign className="w-4 h-4" /> {job.salaryRange.min.toLocaleString()} - {job.salaryRange.max.toLocaleString()}</span>
                                            <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {job.applicants.length} Applicants</span>
                                        </div>
                                    </div>

                                    {/* Applicants Section */}
                                    {job.status === 'open' && job.applicants.length > 0 && (
                                        <div className="space-y-4 pt-4 border-t border-white/5">
                                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Recent Applicants</h3>
                                            <div className="grid gap-3">
                                                {job.applicants.map((app: any) => (
                                                    <div key={app._id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group/app">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 font-bold">
                                                                    {app.applicant.fullName[0]}
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-bold text-white">{app.applicant.fullName}</p>
                                                                    <div className="flex items-center gap-3">
                                                                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Bid: KSH {app.expectedSalary?.toLocaleString() || 'Market'}</p>
                                                                        {app.resumeUrl && (
                                                                            <a
                                                                                href={app.resumeUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="flex items-center gap-1 text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest"
                                                                            >
                                                                                <FileText className="w-3 h-3" /> View CV
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {app.coverLetter && (
                                                                <div className="mt-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                                                                    <p className="text-[10px] text-slate-400 leading-relaxed italic">"{app.coverLetter}"</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col items-end gap-2">
                                                            <button
                                                                disabled={!!actionLoading}
                                                                onClick={() => handleHire(job._id, app._id)}
                                                                className="px-6 py-2 bg-purple-500 text-white rounded-xl text-xs font-black hover:bg-purple-600 transition-all shadow-lg shadow-purple-500/10 disabled:opacity-50 flex items-center gap-2"
                                                            >
                                                                {actionLoading === `hire-${app._id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                                                                Hire Candidate
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Hired Section */}
                                    {job.status === 'closed' && (job as any).paymentStatus === 'escrowed' && (
                                        <div className="p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400">
                                                    <Clock className="w-6 h-6 animate-pulse" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-white">Work in Progress</p>
                                                    <p className="text-[10px] text-indigo-400 font-medium uppercase tracking-widest">Funds Locked in Escrow</p>
                                                </div>
                                            </div>
                                            <button
                                                disabled={!!actionLoading}
                                                onClick={() => handleReleasePayment(job._id)}
                                                className="px-6 py-3 bg-white text-black rounded-xl font-black text-sm hover:bg-slate-200 transition-all flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {actionLoading === `pay-${job._id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                                                Release Payment
                                            </button>
                                        </div>
                                    )}

                                    {/* Paid Section */}
                                    {(job as any).paymentStatus === 'paid' && (
                                        <div className="p-6 bg-green-500/5 rounded-3xl border border-green-500/10 flex items-center gap-4">
                                            <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center text-green-400">
                                                <CheckCircle className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white">Project Successfully Completed</p>
                                                <p className="text-[10px] text-green-400 font-medium uppercase tracking-widest">Payment Released</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

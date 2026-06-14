import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createJob } from '../../api/job.api';
import {
    DollarSign,
    Calendar, Tag, FileText, ArrowLeft,
    X, ChevronRight, ShieldCheck,
    Zap, Target, Globe,
    Briefcase, Settings
} from 'lucide-react';
import { toast } from 'sonner';

export default function CreateJob() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [skills, setSkills] = useState<string[]>([]);
    const [skillInput, setSkillInput] = useState('');

    const [form, setForm] = useState({
        title: '',
        description: '',
        category: 'Tech',
        location: 'Remote',
        salaryRange: {
            min: 0,
            max: 0,
        },
        jobType: 'Full-time' as const,
        deadline: ''
    });

    const categories = ['Tech', 'Marketing', 'Design', 'Sales', 'Customer Service', 'Writing', 'Translation', 'Other'];

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (skills.length === 0) return toast.error("Please add at least one skill");

        try {
            setLoading(true);
            await createJob({ ...form, skillsRequired: skills });
            toast.success("Job listing created successfully!");
            navigate('/jobs');
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to create job");
        } finally {
            setLoading(false);
        }
    }

    function addSkill() {
        if (!skillInput.trim()) return;
        if (skills.includes(skillInput.trim())) return setSkillInput('');
        setSkills([...skills, skillInput.trim()]);
        setSkillInput('');
    }

    function removeSkill(s: string) {
        setSkills(skills.filter(x => x !== s));
    }

    return (
        <div className="pb-20 animate-fade-in space-y-12">
            {/* Header / Navigation */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/jobs')}
                            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 hover:text-white transition-all mr-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <h1 className="text-4xl font-black text-white tracking-tight">Post a New Job</h1>
                    </div>
                    <p className="text-slate-400 font-medium ml-12">Specify your requirements to find the best talent across the network.</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase tracking-widest">
                    <Briefcase className="w-3.5 h-3.5" /> Recruitment Form
                </div>
            </div>

            {/* Main Form Card */}
            <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden group hover:border-white/10 transition-all">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none" />

                <form onSubmit={handleSubmit} className="relative z-10 space-y-12">
                    {/* CORE DETAILS */}
                    <div className="space-y-8">
                        <div className="flex items-center gap-3 text-indigo-400">
                            <Settings className="w-4 h-4" />
                            <h2 className="text-xs font-black uppercase tracking-[0.3em]">Core Parameters</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Job Title</label>
                                <div className="relative group">
                                    <Target className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
                                    <input
                                        type="text" required placeholder="e.g. Senior Frontend Engineer"
                                        value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Category</label>
                                <div className="relative">
                                    <Tag className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                                    <select
                                        value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                                        className="w-full appearance-none bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-10 text-white text-sm font-medium focus:border-indigo-500/50 outline-none transition-all cursor-pointer"
                                    >
                                        {categories.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                                    </select>
                                    <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none rotate-90" />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Job Location</label>
                                <div className="relative group">
                                    <Globe className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
                                    <input
                                        type="text" required placeholder="e.g. Remote or Nairobi, Kenya"
                                        value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Job Type</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {['Full-time', 'Contract'].map(t => (
                                        <button
                                            key={t} type="button"
                                            onClick={() => setForm({ ...form, jobType: t as any })}
                                            className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${form.jobType === t
                                                ? 'bg-white text-black border-white shadow-xl shadow-white/5'
                                                : 'bg-white/5 border-white/5 text-slate-500 hover:text-white hover:border-white/10'
                                                }`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SALARY & BUDGET */}
                    <div className="pt-8 border-t border-white/5 space-y-8">
                        <div className="flex items-center gap-3 text-emerald-400">
                            <DollarSign className="w-4 h-4" />
                            <h2 className="text-xs font-black uppercase tracking-[0.3em]">Compensation</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Minimum Salary (KES)</label>
                                <input
                                    type="number" required placeholder="0"
                                    value={form.salaryRange.min} onChange={e => setForm({ ...form, salaryRange: { ...form.salaryRange, min: Number(e.target.value) } })}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-sm font-medium focus:border-emerald-500/50 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Maximum Salary (KES)</label>
                                <input
                                    type="number" required placeholder="0"
                                    value={form.salaryRange.max} onChange={e => setForm({ ...form, salaryRange: { ...form.salaryRange, max: Number(e.target.value) } })}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-sm font-medium focus:border-emerald-500/50 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* DESCRIPTION & SKILLS */}
                    <div className="pt-8 border-t border-white/5 space-y-8">
                        <div className="flex items-center gap-3 text-teal-400">
                            <FileText className="w-4 h-4" />
                            <h2 className="text-xs font-black uppercase tracking-[0.3em]">Job Description & Requirements</h2>
                        </div>

                        <div className="space-y-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Detailed Description</label>
                                <textarea
                                    required rows={6}
                                    placeholder="Describe the roles, responsibilities, and qualifications..."
                                    value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-[2rem] p-6 text-white text-sm font-medium leading-relaxed focus:border-teal-500/50 outline-none transition-all resize-none"
                                />
                            </div>

                            <div className="space-y-6">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Required Skills</label>
                                <div className="flex gap-4">
                                    <input
                                        type="text" placeholder="Add a skill (e.g. React, Python)"
                                        value={skillInput} onChange={e => setSkillInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                                        className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-sm font-medium focus:border-teal-500/50 outline-none transition-all"
                                    />
                                    <button
                                        type="button" onClick={addSkill}
                                        className="px-6 rounded-2xl bg-white text-black font-black uppercase text-[10px] tracking-widest hover:bg-teal-500 hover:text-white transition-all active:scale-95"
                                    >
                                        Add
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {skills.map(s => (
                                        <div key={s} className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl text-[10px] font-bold flex items-center gap-3 hover:border-teal-500/50 transition-all">
                                            {s}
                                            <button type="button" onClick={() => removeSkill(s)} className="text-slate-500 hover:text-white">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* DEADLINE & SUBMIT */}
                    <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-end justify-between gap-8">
                        <div className="w-full md:max-w-xs space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Application Deadline</label>
                            <div className="relative">
                                <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                                <input
                                    type="date" required
                                    value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium focus:border-indigo-500/50 outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="w-full md:w-fit flex flex-col gap-4">
                            <button
                                type="submit" disabled={loading}
                                className="px-12 py-5 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] hover:bg-indigo-600 hover:text-white transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-3 active:scale-95"
                            >
                                {loading ? "Creating listing..." : "Create Job Listing"}
                                {!loading && <Zap className="w-4 h-4 fill-current" />}
                            </button>
                            <div className="flex items-center justify-center gap-2 text-[9px] font-black text-slate-600 uppercase tracking-widest">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Encrypted Transmission Active
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

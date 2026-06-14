import { useState, useEffect } from "react";
import { adminApi } from "../../api";
import {
    LayoutList,
    Briefcase,
    Video,
    CheckCircle,
    XCircle,
    Loader2,
    Eye,
    Trash2
} from "lucide-react";
import { toast } from "sonner";

export default function ContentManager() {
    const [activeTab, setActiveTab] = useState<'jobs' | 'tasks'>('jobs');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [activeTab]);

    async function loadData() {
        setLoading(true);
        try {
            if (activeTab === 'jobs') {
                const data = await adminApi.getAdminJobs();
                setItems(data);
            } else {
                const data = await adminApi.getPendingTasks();
                setItems(data);
            }
        } catch (error) {
            toast.error(`Failed to load ${activeTab}`);
        } finally {
            setLoading(false);
        }
    }

    async function handleJobAction(id: string, action: 'approve' | 'reject' | 'delete') {
        if (!confirm(`Are you sure you want to ${action} this job?`)) return;
        setActionLoading(id);
        try {
            if (action === 'approve') await adminApi.approveJob(id);
            if (action === 'reject') await adminApi.rejectJob(id);
            if (action === 'delete') await adminApi.deleteJob(id);
            toast.success(`Job ${action}d successfully`);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Action failed");
        } finally {
            setActionLoading(null);
        }
    }

    async function handleTaskAction(id: string, action: 'approve' | 'reject') {
        if (!confirm(`Are you sure you want to ${action} this task?`)) return;
        setActionLoading(id);
        try {
            if (action === 'approve') {
                // Should prompt for rate overriding in real app, using defaults for now
                await adminApi.approveTask(id, { pricePerCompletion: 10, maxCompletions: 100 });
            }
            if (action === 'reject') await adminApi.rejectTask(id, "Admin rejection");
            toast.success(`Task ${action}d successfully`);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Action failed");
        } finally {
            setActionLoading(null);
        }
    }

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white">Content Moderation</h1>
                    <p className="text-slate-400 font-medium">Review and control platform listings.</p>
                </div>

                <div className="flex bg-[#0a0a0a] rounded-xl p-1 border border-white/5">
                    <button
                        onClick={() => setActiveTab('jobs')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'jobs' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'
                            }`}
                    >
                        <Briefcase className="w-4 h-4" /> Posted Jobs
                    </button>
                    <button
                        onClick={() => setActiveTab('tasks')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'tasks' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'
                            }`}
                    >
                        <Video className="w-4 h-4" /> Creator Tasks
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="h-[40vh] flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>
            ) : items.length === 0 ? (
                <div className="bg-[#0a0a0a] rounded-[2rem] border border-white/5 p-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto">
                        <CheckCircle className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="text-xl font-bold text-white">All Caught Up!</h3>
                    <p className="text-slate-500">No {activeTab} pending review at the moment.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {items.map(item => (
                        <div key={item._id} className="bg-[#0a0a0a] rounded-[2rem] border border-white/5 p-6 hover:border-white/10 transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-white line-clamp-1">{item.title}</h3>
                                    <p className="text-xs text-slate-500 font-medium">By {item.creator?.name || item.employer?.name || "Unknown"}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${item.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                        item.status === 'open' || item.status === 'published' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                            'bg-white/5 text-slate-500 border-white/10'
                                    }`}>
                                    {item.status}
                                </span>
                            </div>

                            <p className="text-sm text-slate-400 line-clamp-3 mb-6 bg-white/5 p-4 rounded-xl">
                                {item.description}
                            </p>

                            <div className="flex gap-2 mt-auto">
                                {activeTab === 'jobs' ? (
                                    <>
                                        {item.status === 'open' ? (
                                            <button
                                                onClick={() => handleJobAction(item._id, 'reject')}
                                                disabled={!!actionLoading}
                                                className="flex-1 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                                            >
                                                Unpublish
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleJobAction(item._id, 'approve')}
                                                    disabled={!!actionLoading}
                                                    className="flex-1 py-3 bg-green-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg shadow-green-500/20"
                                                >
                                                    {actionLoading === item._id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Approve"}
                                                </button>
                                                <button
                                                    onClick={() => handleJobAction(item._id, 'delete')}
                                                    disabled={!!actionLoading}
                                                    className="w-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => handleTaskAction(item._id, 'approve')}
                                            disabled={!!actionLoading}
                                            className="flex-1 py-3 bg-green-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg shadow-green-500/20"
                                        >
                                            {actionLoading === item._id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Publish"}
                                        </button>
                                        <button
                                            onClick={() => handleTaskAction(item._id, 'reject')}
                                            disabled={!!actionLoading}
                                            className="flex-1 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                                        >
                                            Reject
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

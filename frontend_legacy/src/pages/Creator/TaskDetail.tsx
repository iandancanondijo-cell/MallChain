import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft, Calendar, DollarSign, ExternalLink,
    Upload, CheckCircle, Clock, MessageCircle
} from 'lucide-react';
import { getTask, submitTask } from "../../api/task.api";
import type { Task } from "../../types";
import { toast } from "sonner";

export default function TaskDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [task, setTask] = useState<Task | null>(null);
    const [loading, setLoading] = useState(true);
    const [file, setFile] = useState<File | null>(null);
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        async function load() {
            if (!id) return;
            try {
                const data = await getTask(id);
                setTask(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

    async function handleSubmit() {
        if (!task || !id) return;

        setSubmitting(true);
        const formData = new FormData();
        formData.append('taskId', id);
        formData.append('description', description);
        if (file) {
            formData.append('file', file);
        }

        try {
            await submitTask(formData);
            toast.success('Task submitted successfully!');
            navigate('/creator/dashboard');
        } catch (e) {
            console.error(e);
            toast.error('Submission failed');
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) return <div className="h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-purple-500"></div></div>;
    if (!task) return <div className="text-center py-20 text-white">Task not found</div>;

    return (
        <div className="max-w-4xl mx-auto pb-20 animate-fade-in text-white">
            <button
                onClick={() => navigate(-1)}
                className="mb-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest"
            >
                <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Task Info */}
                <div className="lg:col-span-2 space-y-8">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black uppercase tracking-widest border border-purple-500/30">
                                {task.platform}
                            </span>
                            <span className="px-3 py-1 rounded-full bg-white/5 text-slate-400 text-xs font-black uppercase tracking-widest border border-white/5">
                                {task.action}
                            </span>
                        </div>
                        <h1 className="text-3xl font-black tracking-tight mb-4">{task.title}</h1>
                        <p className="text-slate-400 leading-relaxed text-lg">{task.description}</p>
                    </div>

                    <div className="bg-white/5 border border-white/5 rounded-[2rem] p-8 space-y-6">
                        <div className="space-y-4">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-purple-500" />
                                Requirements
                            </h3>
                            <ul className="space-y-3">
                                {/* Static requirement for now or parse from description */}
                                <li className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2"></div>
                                    <span className="text-slate-300 text-sm leading-relaxed">
                                        Click the link below and perform the action ({task.action || 'view'}).
                                    </span>
                                </li>
                            </ul>
                        </div>
                        <a
                            href={task.link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 font-bold uppercase tracking-widest text-xs mt-4"
                        >
                            Open Task Link <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>

                    {/* Chat with Creator Button (Only if not owner) */}
                    <div className="flex gap-4">
                        <button
                            onClick={() => navigate(`/chat/${(task.creator as any)?._id || (task.creator as any)?.id}`)}
                            className="flex-1 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all font-bold text-white flex items-center justify-center gap-2"
                        >
                            <MessageCircle className="w-5 h-5 text-purple-400" />
                            Message Creator
                        </button>
                    </div>

                    {/* Submission Form */}
                    {task.status !== 'completed' && (
                        <div className="glass-dark border border-white/10 rounded-[2rem] p-8 space-y-6">
                            <h3 className="text-xl font-bold flex items-center gap-3">
                                <Upload className="w-5 h-5 text-blue-400" /> Submit Proof
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Description / Notes</label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-purple-500/50 min-h-[100px]"
                                        placeholder="I have completed the task..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Screenshot / File</label>
                                    <input
                                        type="file"
                                        onChange={e => setFile(e.target.files?.[0] || null)}
                                        className="w-full text-slate-400 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-xs file:font-black file:uppercase file:tracking-widest file:bg-white/10 file:text-white hover:file:bg-white/20"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="w-full py-4 rounded-2xl bg-purple-500 text-white font-black hover:bg-purple-600 transition-all disabled:opacity-50"
                            >
                                {submitting ? 'Submitting...' : 'Submit for Review'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Sidebar Info */}
                <div className="space-y-6">
                    <div className="glass-dark border border-white/5 rounded-[2rem] p-8 text-center space-y-2">
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Reward</span>
                        <div className="text-4xl font-black text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                            {task.reward} PTS
                        </div>
                    </div>

                    <div className="glass-dark border border-white/5 rounded-[2rem] p-8 space-y-4">
                        <div className="flex items-center gap-3 text-slate-300">
                            <Calendar className="w-5 h-5 text-slate-500" />
                            <span className="text-sm">Deadline: <span className="font-bold text-white">{(task as any).deadline ? new Date((task as any).deadline).toLocaleDateString() : 'No Deadline'}</span></span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-300">
                            <Clock className="w-5 h-5 text-slate-500" />
                            <span className="text-sm">Status: <span className="font-bold text-white uppercase">{task.status}</span></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

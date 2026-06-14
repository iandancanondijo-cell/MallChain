import { useState, useEffect } from "react";
import { adminApi } from "../../api";
import {
    Search,
    CheckCircle,
    XCircle,
    Loader2,
    User,
    MessageCircle
} from "lucide-react";
import { toast } from "sonner";
import { User as UserType } from "../../types";
import { useNavigate } from "react-router-dom";

export default function UserManagement() {
    const navigate = useNavigate();
    const [users, setUsers] = useState<UserType[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        loadUsers();
    }, []);

    async function loadUsers() {
        try {
            const data = await adminApi.getUsers();
            setUsers(data);
        } catch (error) {
            toast.error("Failed to load users");
        } finally {
            setLoading(false);
        }
    }

    async function handleBan(userId: string, isBanned: boolean) {
        if (!confirm(isBanned ? "Unban this user?" : "Ban this user?")) return;

        setActionLoading(userId);
        try {
            if (isBanned) {
                await adminApi.unbanUser(userId);
                toast.success("User unbanned successfully");
            } else {
                await adminApi.banUser(userId, "Admin action");
                toast.success("User banned successfully");
            }
            await loadUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Action failed");
        } finally {
            setActionLoading(null);
        }
    }

    const filteredUsers = users.filter(u =>
        u.fullName.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.username.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <div className="h-[60vh] flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white">User Management</h1>
                    <p className="text-slate-400 font-medium">Oversee platform accounts and permissions.</p>
                </div>
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full md:w-80 h-10 bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                    />
                </div>
            </div>

            <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white/[0.02] border-b border-white/5">
                                <th className="p-6 text-xs font-black text-slate-500 uppercase tracking-widest text-left">User</th>
                                <th className="p-6 text-xs font-black text-slate-500 uppercase tracking-widest text-left">Role</th>
                                <th className="p-6 text-xs font-black text-slate-500 uppercase tracking-widest text-left">Status</th>
                                <th className="p-6 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredUsers.map(user => (
                                <tr key={user._id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="p-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20 overflow-hidden">
                                                {user.avatar ? (
                                                    <img src={user.avatar} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-5 h-5 text-indigo-400" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white">{user.fullName}</p>
                                                <p className="text-xs text-slate-500 font-medium">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${user.role === 'admin' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                            user.role === 'seller' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                                'bg-white/5 text-slate-400 border-white/10'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="p-6">
                                        {(user as any).banned ? (
                                            <div className="flex items-center gap-2 text-red-400">
                                                <XCircle className="w-4 h-4" />
                                                <span className="text-xs font-bold uppercase tracking-wider">Banned</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-green-400">
                                                <CheckCircle className="w-4 h-4" />
                                                <span className="text-xs font-bold uppercase tracking-wider">Active</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-6 text-right flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => navigate(`/chat/${user._id}`)}
                                            className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all border border-transparent hover:border-emerald-500/20"
                                            title="Send Message"
                                        >
                                            <MessageCircle className="w-4 h-4" />
                                        </button>
                                        {user.role !== 'admin' && (
                                            <button
                                                disabled={!!actionLoading}
                                                onClick={async () => {
                                                    if (!confirm(`Promote ${user.fullName} to Admin? This gives them full access.`)) return;
                                                    setActionLoading(user._id);
                                                    try {
                                                        await adminApi.promoteUser(user._id);
                                                        toast.success("User promoted to Admin!");
                                                        loadUsers();
                                                    } catch (e) {
                                                        toast.error("Failed to promote");
                                                    } finally {
                                                        setActionLoading(null);
                                                    }
                                                }}
                                                className="px-4 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all disabled:opacity-50"
                                            >
                                                {actionLoading === user._id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Make Admin"}
                                            </button>
                                        )}
                                        <button
                                            disabled={!!actionLoading || user.role === 'admin'}
                                            onClick={() => handleBan(user._id, (user as any).banned)}
                                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${(user as any).banned
                                                ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
                                                : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            {actionLoading === user._id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : ((user as any).banned ? 'Unban' : 'Ban')}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

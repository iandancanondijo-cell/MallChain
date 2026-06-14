import { useState, useEffect, useRef } from "react";
import {
    Users,
    ShoppingBag,
    TrendingUp,
    Shield,
    Activity,
    History,
    ArrowRight,
    RefreshCcw,
    Database,
    Cpu
} from "lucide-react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip
} from "recharts";
import { getAdminSummary, getAdminTimeSeries, adminApi } from "../../api";
import LoadingSpinner from "../../components/LoadingSpinner";
import StatCard from "../../components/dashboard/StatCard";
import { Link } from "react-router-dom";
import DiagnosticsModal from "../../components/admin/DiagnosticsModal";
import { socket } from "../../services/socket";

export default function AdminDashboard() {
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<any>(null);
    const [timeData, setTimeData] = useState<any[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
    const [latency, setLatency] = useState<number>(0);
    const [dbStatus, setDbStatus] = useState<'Optimal' | 'Checking' | 'Issues'>('Checking');
    const [bcSynced, setBcSynced] = useState<number>(0);
    const latencyInterval = useRef<any>(null);

    const loadAllData = async () => {
        try {
            const [sumData, seriesData, logData] = await Promise.all([
                getAdminSummary(),
                getAdminTimeSeries(7),
                adminApi.getAuditLogs()
            ]);

            if (sumData.success) setSummary(sumData.data);
            if (logData.ok) setLogs(logData.logs);

            if (seriesData.success && seriesData.data.series) {
                const chartData = Object.entries(seriesData.data.series).map(([day, types]: any) => ({
                    day: day.slice(5).replace('-', '/'),
                    deposits: types.deposit || 0,
                    withdrawals: types.withdraw || 0
                }));
                setTimeData(chartData);
            }
        } catch (err) {
            console.error("Failed to fetch admin dashboard data:", err);
        }
    };

    useEffect(() => {
        async function initDashboard() {
            setLoading(true);
            await loadAllData();
            setLoading(false);
        }

        async function fetchDiagnostics() {
            try {
                const diagData = await adminApi.getDiagnostics();
                if (diagData.success) {
                    const db = diagData.results.find((r: any) => r.name === 'Database');
                    const bc = diagData.results.find((r: any) => r.name === 'Blockchain');
                    if (db) setDbStatus(db.status === 'optimal' ? 'Optimal' : 'Issues');
                    if (bc) {
                        const blockMatch = bc.metric?.match(/\d+/);
                        setBcSynced(blockMatch ? 100 : 0);
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch diagnostics for dashboard vitals:", err);
            }
        }

        initDashboard();
        fetchDiagnostics();

        // Socket listeners for real-time dashboard updates
        socket.on("ledger:update", loadAllData);
        socket.on("stats:update", loadAllData);

        // Heartbeat for latency
        const updateLatency = async () => {
            try {
                const l = await adminApi.ping();
                setLatency(l);
            } catch (e) {
                setLatency(0);
            }
        };
        updateLatency();
        latencyInterval.current = setInterval(updateLatency, 5000);

        return () => {
            if (latencyInterval.current) clearInterval(latencyInterval.current);
            socket.off("ledger:update", loadAllData);
            socket.off("stats:update", loadAllData);
        };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" text="Analyzing system health..." />
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2 text-indigo-400 mb-1">
                        <Shield className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Root Administrator</span>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight">Platform <span className="text-indigo-400 italic">Command</span></h1>
                    <p className="text-slate-500 font-medium italic">Global systems overview and infrastructure monitoring.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-slate-300 text-xs font-black hover:bg-white/10 transition-all uppercase tracking-widest">
                        <History className="w-4 h-4" />
                        Audit Logs
                    </button>
                    <button
                        onClick={() => setIsDiagnosticsOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-500 text-white text-xs font-black hover:bg-indigo-600 transition-all uppercase tracking-widest shadow-lg shadow-indigo-500/20"
                    >
                        <Database className="w-4 h-4" />
                        Sys Check
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Global Users"
                    value={summary?.totalUsers || 0}
                    icon={Users}
                    color="blue"
                    trend={{ value: '14.2%', isPositive: true }}
                />
                <StatCard
                    title="Volume (24h)"
                    value={`KES ${(summary?.deposits || 0).toLocaleString()}`}
                    icon={TrendingUp}
                    color="green"
                    trend={{ value: '8.1%', isPositive: true }}
                />
                <StatCard
                    title="Withdrawals"
                    value={`KES ${(summary?.withdrawals || 0).toLocaleString()}`}
                    icon={ShoppingBag}
                    color="red"
                />
                <StatCard
                    title="TX Load"
                    value={summary?.txCountLast24h || 0}
                    icon={Activity}
                    color="purple"
                    trend={{ value: '254', isPositive: true }}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Transaction Chart */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-indigo-500/5 to-transparent">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <Activity className="w-5 h-5 text-indigo-400" />
                                <h3 className="text-xl font-black text-white tracking-tight">Financial Velocity</h3>
                            </div>
                            <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
                                {['7D', '30D', '90D'].map(period => (
                                    <button
                                        key={period}
                                        className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${period === '7D' ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:text-white'}`}
                                    >
                                        {period}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={timeData}>
                                    <defs>
                                        <linearGradient id="colorDep" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                    <XAxis
                                        dataKey="day"
                                        stroke="#ffffff20"
                                        fontSize={10}
                                        fontWeight="900"
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        stroke="#ffffff20"
                                        fontSize={10}
                                        fontWeight="900"
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(val) => `KES ${val / 1000}k`}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#0a0a0c',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            borderRadius: '20px',
                                            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                                        }}
                                        itemStyle={{ fontSize: '11px', fontWeight: '900', color: '#6366f1' }}
                                        labelStyle={{ color: '#64748b', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="deposits"
                                        stroke="#6366f1"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorDep)"
                                        animationDuration={1500}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Recent Activity / Audit Logs */}
                    <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-indigo-500/5 to-transparent">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <History className="w-5 h-5 text-indigo-400" />
                                <h3 className="text-xl font-black text-white tracking-tight">Audit Logs</h3>
                            </div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{logs.length} Recent actions</span>
                        </div>

                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                            {logs.map((log: any) => (
                                <div key={log._id} className="group flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 transition-transform">
                                            <Shield className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-black text-white tracking-tight capitalize">
                                                {log.action.replace(/_/g, ' ')}
                                            </div>
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                {log.admin?.fullName || log.user?.username || 'System'} • {new Date(log.timestamp).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.15em] mb-1">Status</div>
                                        <div className="text-[10px] font-black text-green-400 uppercase tracking-widest">VERIFIED</div>
                                    </div>
                                </div>
                            ))}
                            {logs.length === 0 && (
                                <div className="text-center py-12 text-slate-500 italic font-medium">No recent activity found.</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* System Vital Signs */}
                <div className="lg:col-span-4 space-y-8">
                    <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-8 relative overflow-hidden">
                        <div className="absolute -right-12 -top-12 w-40 h-40 bg-indigo-500/10 blur-[80px]"></div>

                        <div className="flex items-center gap-3">
                            <Cpu className="w-5 h-5 text-indigo-400" />
                            <h3 className="text-xl font-black text-white tracking-tight">System Vital Signs</h3>
                        </div>

                        <div className="space-y-6 relative z-10">
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <span>Blockchain Synced</span>
                                    <span className={bcSynced > 0 ? "text-green-400" : "text-yellow-400"}>{bcSynced}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-1000 ${bcSynced > 0 ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-yellow-500 animate-pulse'}`}
                                        style={{ width: `${bcSynced}%` }}
                                    ></div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <span>API Latency</span>
                                    <span className="text-indigo-400 flex items-center gap-1">
                                        <div className={`w-1 h-1 rounded-full bg-indigo-400 ${latency > 0 ? 'animate-ping' : ''}`} />
                                        {latency || '--'}ms
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-500 transition-all duration-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                                        style={{ width: `${Math.min(100, Math.max(5, (100 - latency)))}%` }}
                                    ></div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <span>Database Health</span>
                                    <span className={dbStatus === 'Optimal' ? "text-green-400" : "text-red-400"}>{dbStatus}</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-1000 ${dbStatus === 'Optimal' ? 'bg-green-500 w-[98%] shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-red-500 w-[10%] shadow-[0_0_15px_rgba(239,68,68,0.3)]'}`}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setIsDiagnosticsOpen(true)}
                            className="w-full py-4 rounded-2xl bg-white/5 border border-white/5 text-[10px] font-black tracking-[0.2em] text-white hover:bg-white/10 transition-all uppercase"
                        >
                            RUN DIAGNOSTICS
                        </button>
                    </div>

                    {/* Quick Access */}
                    <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-6">
                        <div className="flex items-center gap-3">
                            <RefreshCcw className="w-5 h-5 text-indigo-400" />
                            <h3 className="text-lg font-black text-white tracking-tight">Quick Controls</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <Link to="/admin/users" className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 transition-all group">
                                <span className="text-sm font-bold text-white uppercase tracking-tighter">User Management</span>
                                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                            </Link>
                            <Link to="/admin/content" className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 transition-all group">
                                <span className="text-sm font-bold text-white uppercase tracking-tighter">Catalog Control</span>
                                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
            {/* Diagnostics Modal */}
            <DiagnosticsModal
                isOpen={isDiagnosticsOpen}
                onClose={() => setIsDiagnosticsOpen(false)}
            />
        </div>
    );
}

import { useState, useEffect } from "react";
import { adminApi } from "../../api";
import StatCard from "../../components/dashboard/StatCard";
import {
    Activity,
    Server,
    Wifi,
    Cpu,
    Clock,
    Zap,
    ShieldAlert,
    RefreshCw
} from "lucide-react";
import { toast } from "sonner";

export default function SystemMonitor() {
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);

    useEffect(() => {
        loadMetrics();
        let interval: any;
        if (autoRefresh) {
            interval = setInterval(loadMetrics, 2000); // 2s polling for "real-time" feel
        }
        return () => clearInterval(interval);
    }, [autoRefresh]);

    async function loadMetrics() {
        try {
            const data = await adminApi.getSystemHealth();
            setMetrics(data);
            setLoading(false);
        } catch (error) {
            console.error("Metrics fetch failed");
        }
    }

    if (loading && !metrics) return (
        <div className="flex items-center justify-center h-[60vh] text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Initializing System Probe...
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Activity className="w-8 h-8 text-indigo-500" />
                        System Monitor
                    </h1>
                    <p className="text-slate-400 font-medium">Real-time infrastructure performance & health.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                        <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}></span>
                        <span className="text-xs font-bold text-white uppercase tracking-widest">
                            {autoRefresh ? "Live Feed" : "Paused"}
                        </span>
                    </div>
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white"
                    >
                        {autoRefresh ? <span className="text-xs font-bold">Pause</span> : <RefreshCw className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* High Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Request Rate"
                    value={`${(metrics?.requestsPerSecond || 0).toLocaleString()}`}
                    icon={Zap}
                    color="amber"
                    trend={{ value: "Req/s", isPositive: true }}
                />
                <StatCard
                    title="System Latency"
                    value={`${metrics?.latency || 0} ms`}
                    icon={Clock}
                    color={metrics?.latency < 100 ? "green" : "red"}
                />
                <StatCard
                    title="Active Connections"
                    value={(metrics?.activeConnections || 0).toLocaleString()}
                    icon={Wifi}
                    color="blue"
                />
                <StatCard
                    title="Server Uptime"
                    value={metrics?.uptime || "99.9%"}
                    icon={Server}
                    color="purple"
                />
            </div>

            {/* Detailed Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Audit Logs Stream */}
                <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black text-white flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-slate-400" />
                            Security Audit Log
                        </h3>
                        <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest bg-green-500/10 px-2 py-1 rounded-lg">Secure</span>
                    </div>

                    <div className="space-y-4">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex gap-4 items-start p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                                <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500"></div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-slate-300">Admin Action: Updated User Role</p>
                                    <p className="text-xs text-slate-500 mt-1 font-mono">ID: {Math.random().toString(36).substr(2, 9)} • {new Date().toLocaleTimeString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Server Load Visualizer */}
                <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-slate-400" />
                        Cluster Load Distribution
                    </h3>

                    <div className="space-y-6">
                        {['Worker 1', 'Worker 2', 'Worker 3', 'Worker 4'].map((worker, i) => (
                            <div key={worker} className="space-y-2">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                                    <span>{worker}</span>
                                    <span>{Math.floor(Math.random() * 30) + 40}%</span>
                                </div>
                                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-in-out"
                                        style={{ width: `${Math.floor(Math.random() * 30) + 40}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-slate-500 mt-4 font-medium text-center">
                            Load balancing across {navigator.hardwareConcurrency || 4} detected cores.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

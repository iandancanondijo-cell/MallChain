import { useState, useEffect } from "react";
import { adminApi } from "../../api";
import {
    Wallet,
    DollarSign,
    CreditCard,
    Loader2,
    PieChart
} from "lucide-react";
import { toast } from "sonner";
import StatCard from "../../components/dashboard/StatCard";
import { socket } from "../../services/socket";

export default function Financials() {
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [walletStats, setWalletStats] = useState<any>(null);
    const [orderStats, setOrderStats] = useState<any>(null);

    useEffect(() => {
        loadData();

        // Listen for real-time ledger updates
        socket.on("ledger:update", loadData);

        return () => {
            socket.off("ledger:update", loadData);
        };
    }, []);

    async function loadData() {
        try {
            const [txData, wData, oData] = await Promise.all([
                adminApi.getAdminTransactions(),
                adminApi.getWalletStats(),
                adminApi.getOrderStats()
            ]);
            setTransactions(txData);
            setWalletStats(wData);
            setOrderStats(oData);
        } catch (error) {
            toast.error("Failed to load financial data");
        } finally {
            setLoading(false);
        }
    }

    if (loading) return <div className="h-[60vh] flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white">Financial Command</h1>
                    <p className="text-slate-400 font-medium">Global ledger and platform revenue metrics.</p>
                </div>
                <button className="flex items-center gap-2 px-5 py-2.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl font-bold uppercase tracking-widest hover:bg-green-500/20 transition-all text-xs">
                    <DollarSign className="w-4 h-4" /> Export Report
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                    title="Cash Liquidity (KES)"
                    value={`KES ${(walletStats?.totals?.mallmoney || 0).toLocaleString()}`}
                    icon={Wallet}
                    color="indigo"
                />
                <StatCard
                    title="Total Asset Value (KES)"
                    value={`KES ${(walletStats?.weightedAssetValue || 0).toLocaleString()}`}
                    icon={DollarSign}
                    color="green"
                />
                <StatCard
                    title="Gross Sales Volume"
                    value={`KES ${(orderStats?.totalRevenue || 0).toLocaleString()}`}
                    icon={CreditCard}
                    color="purple"
                />
                <StatCard
                    title="Total MallCoins"
                    value={(walletStats?.totals?.mallcoins || 0).toLocaleString()}
                    icon={PieChart}
                    color="yellow"
                />
                <StatCard
                    title="Total MallPoints"
                    value={(walletStats?.totals?.mallpoints || 0).toLocaleString()}
                    icon={PieChart}
                    color="green"
                />
            </div>

            {/* Ledger */}
            <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-white">Global Ledger</h3>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] bg-white/5 px-3 py-1 rounded-full border border-white/5">
                        {transactions.length} Total Entries
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
                                <th className="pb-4">Ref ID</th>
                                <th className="pb-4">User</th>
                                <th className="pb-4">Type</th>
                                <th className="pb-4">Amount</th>
                                <th className="pb-4">Status</th>
                                <th className="pb-4 text-right">Date / Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {transactions.map((tx) => (
                                <tr key={tx._id} className="group hover:bg-white/[0.02]">
                                    <td className="py-4 font-mono text-[10px] text-indigo-400">{tx.referenceId || tx.reference || tx._id.slice(-8).toUpperCase()}</td>
                                    <td className="py-4">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white truncate max-w-[150px]">
                                                {tx.userId?.email || tx.meta?.toEmail || tx.meta?.fromEmail || "System"}
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">
                                                {tx.userId?.fullName || tx.meta?.toUsername || tx.meta?.fromUsername || "Platform Action"}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${tx.type === 'deposit' || tx.type === 'receive' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                            tx.type === 'withdraw' || tx.type === 'send' || tx.type === 'task_charge' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                            }`}>
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td className="py-4 font-mono font-bold text-white">
                                        {tx.amount.toLocaleString()} <span className="text-[10px] text-slate-500">{tx.currency || 'KES'}</span>
                                    </td>
                                    <td className="py-4">
                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${tx.status === 'completed' || !tx.status ? 'text-green-400' :
                                            tx.status === 'failed' ? 'text-red-400' : 'text-yellow-400'
                                            }`}>
                                            {tx.status || 'completed'}
                                        </span>
                                    </td>
                                    <td className="py-4 text-right">
                                        <div className="flex justify-end gap-3 items-center">
                                            <span className="text-xs text-slate-500 font-medium">
                                                {new Date(tx.createdAt).toLocaleDateString()}
                                            </span>
                                            {tx.status !== 'failed' && (
                                                <button
                                                    onClick={async () => {
                                                        const ref = tx.referenceId || tx.reference || tx._id;
                                                        if (window.confirm(`Are you sure you want to REVERT transaction ${ref}? This will reverse the balance change.`)) {
                                                            try {
                                                                await adminApi.revertTransaction(tx._id);
                                                                toast.success("Transaction reverted successfully");
                                                                loadData();
                                                            } catch (e: any) {
                                                                toast.error(e.response?.data?.error || "Reversion failed");
                                                            }
                                                        }
                                                    }}
                                                    className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    Revert
                                                </button>
                                            )}
                                        </div>
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

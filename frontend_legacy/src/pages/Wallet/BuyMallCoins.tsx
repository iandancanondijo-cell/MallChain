import { useState, useEffect } from 'react';
import { getWallet, buyMallCoins, getBuyPrice } from '../../api/wallet.api';
import { RefreshCw, Coins, Loader2, CheckCircle2, ChevronDown, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function BuyMallCoins() {
    const navigate = useNavigate();
    const [kesBalance, setKesBalance] = useState(0);
    const [amountKES, setAmountKES] = useState('');
    const [buyPrice, setBuyPrice] = useState(0.62);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            const [w, price] = await Promise.all([getWallet(), getBuyPrice()]);
            setKesBalance(w.mallmoney || 0);
            setBuyPrice(price || 0.62);
        } catch (e) {
            console.error(e);
        }
    }

    const mallCoinsToReceive = amountKES ? (Number(amountKES) / buyPrice).toFixed(6) : '0.000000';

    async function handleBuy() {
        if (!amountKES || Number(amountKES) <= 0) return;
        if (Number(amountKES) > kesBalance) {
            toast.error("Insufficient balance. Please deposit funds first.");
            return;
        }

        setLoading(true);
        try {
            const result = await buyMallCoins({ amountKES: Number(amountKES), generateWallet: true });
            setSuccess(true);
            toast.success(result.message || 'MallCoins purchased successfully!');
            await loadData();
            setTimeout(() => navigate('/wallet'), 2000);
        } catch (e: any) {
            toast.error(e.message || "Purchase failed");
        } finally {
            setLoading(false);
        }
    }

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-fade-in">
                <div className="relative">
                    <div className="absolute inset-0 bg-green-500 blur-[40px] opacity-30 animate-pulse"></div>
                    <div className="relative w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(34,197,94,0.4)]">
                        <CheckCircle2 className="w-12 h-12 text-white" />
                    </div>
                </div>
                <h2 className="text-3xl font-black text-white mb-2 italic">PURCHASE SUCCESSFUL!</h2>
                <p className="text-slate-400 font-medium">Your assets have been updated.</p>
                <p className="text-[10px] font-black text-slate-600 mt-12 uppercase tracking-[0.3em] font-mono">Redirecting to Vault...</p>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto space-y-8 animate-fade-in py-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tighter italic">SWAP ASSETS</h1>
                    <p className="text-slate-500 mt-1 font-bold uppercase tracking-widest text-[10px]">Convert KES Balance to MallCoins</p>
                </div>
                <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-2 group">
                    <Coins className="w-4 h-4 text-indigo-400 group-hover:rotate-12 transition-transform" />
                    <span className="text-xs font-black text-slate-300">1 MLCN = KES {buyPrice}</span>
                </div>
            </div>

            <div className="relative group">
                {/* Main Swap Container */}
                <div className="glass-dark p-2 rounded-[2.5rem] border border-white/5 shadow-2xl relative z-10">

                    {/* From Container */}
                    <div className="p-8 rounded-[2rem] bg-white/5 border border-white/5 mb-2 group/input focus-within:bg-white/[0.07] transition-all">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pay With</span>
                            <span className="text-[10px] font-black text-slate-400">Balance: <span className="text-white">KES {kesBalance.toLocaleString()}</span></span>
                        </div>
                        <div className="flex items-center gap-4">
                            <input
                                type="number"
                                value={amountKES}
                                onChange={(e) => setAmountKES(e.target.value)}
                                className="flex-1 bg-transparent text-4xl font-black text-white placeholder-slate-800 outline-none w-full"
                                placeholder="0"
                                autoFocus
                            />
                            <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 rounded-2xl border border-white/10">
                                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <span className="text-[10px] font-bold text-green-400 font-mono">KES</span>
                                </div>
                                <span className="font-black text-white text-sm">MONEY</span>
                                <ChevronDown className="w-4 h-4 text-slate-500" />
                            </div>
                        </div>
                    </div>

                    {/* Swap Divider */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                        <button
                            className="w-12 h-12 bg-slate-900 rounded-2xl border-4 border-slate-950 flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
                            onClick={() => { }}
                        >
                            <ArrowDown className="w-5 h-5 text-indigo-400 group-hover:text-white transition-colors" />
                        </button>
                    </div>

                    {/* To Container */}
                    <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Receive</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 text-4xl font-black text-slate-400 select-none">
                                {mallCoinsToReceive}
                            </div>
                            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
                                <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
                                    <Coins className="w-4 h-4 text-indigo-400" />
                                </div>
                                <span className="font-black text-white text-sm">MLCNS</span>
                                <ChevronDown className="w-4 h-4 text-slate-500" />
                            </div>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="p-2">
                        <button
                            onClick={handleBuy}
                            disabled={loading || !amountKES || Number(amountKES) <= 0 || Number(amountKES) > kesBalance}
                            className="w-full py-6 rounded-[1.8rem] bg-white text-slate-950 font-black hover:bg-indigo-400 hover:text-white transition-all duration-500 disabled:opacity-20 disabled:grayscale flex items-center justify-center gap-3 shadow-xl group overflow-hidden relative"
                        >
                            <div className="absolute inset-0 bg-black/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            {loading ? (
                                <Loader2 className="w-6 h-6 animate-spin relative z-10" />
                            ) : (
                                <>
                                    <RefreshCw className="w-5 h-5 relative z-10 group-hover:rotate-180 transition-transform duration-700" />
                                    <span className="relative z-10 tracking-widest uppercase">CONFIRM EXCHANGE</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Floating Accents */}
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 blur-[80px] rounded-full -z-0"></div>
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/10 blur-[80px] rounded-full -z-0"></div>
            </div>

            {/* Info Rows */}
            <div className="space-y-3 px-4">
                <div className="flex justify-between text-[11px] font-black tracking-widest text-slate-600 uppercase">
                    <span>Exchange Rate</span>
                    <span className="text-slate-400">1 MLCN = {buyPrice} KES</span>
                </div>
                <div className="flex justify-between text-[11px] font-black tracking-widest text-slate-600 uppercase">
                    <span>Service Fee</span>
                    <span className="text-green-500/50">Free (Beta)</span>
                </div>
                <div className="flex justify-between text-[11px] font-black tracking-widest text-slate-600 uppercase">
                    <span>Minimum Swap</span>
                    <span className="text-slate-400">1.00 KES</span>
                </div>
            </div>
        </div>
    );
}

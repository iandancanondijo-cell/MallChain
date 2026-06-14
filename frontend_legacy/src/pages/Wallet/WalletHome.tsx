import { useNavigate } from "react-router-dom";
import { useEffect, useState } from 'react';
import { getWallet, getTransactions } from "../../api/wallet.api";
import type { Wallet, WalletTransaction } from "../../types";
import {
  ArrowUpRight, ArrowDownRight, Send, QrCode, CreditCard,
  RefreshCw, Wallet as WalletIcon, ChevronRight, Coins, Pickaxe
} from 'lucide-react';
import { toast } from "sonner";
import { useWallet } from "../../shared/WalletContext";

export default function WalletHome() {
  const navigate = useNavigate();
  const { walletState } = useWallet();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Only fetch if not already connected via context
      if (!walletState.isConnected) {
        const [walletData, txData] = await Promise.all([
          getWallet(),
          getTransactions()
        ]);
        setWallet(walletData);
        setTransactions(txData || []);
      }
    } catch (e: any) {
      console.error("Failed to fetch wallet data", e);
    } finally { setLoading(false); }
  }

  const quickActions = [
    { label: 'Send', icon: Send, path: '/wallet/send', color: 'bg-orange-500' },
    { label: 'Receive', icon: QrCode, path: '/wallet/receive', color: 'bg-blue-500' },
    { label: 'Deposit', icon: ArrowDownRight, path: '/wallet/deposit', color: 'bg-green-500' },
    { label: 'Withdraw', icon: ArrowUpRight, path: '/wallet/withdraw', color: 'bg-red-500' },
  ];

  const secondaryActions = [
    { label: 'Buy MallCoins', icon: Coins, path: '/wallet/buy-coins' },
    { label: 'Convert Points', icon: RefreshCw, path: '/wallet/convert' },
    { label: 'Cards', icon: CreditCard, path: '/wallet/cards' }, // Placeholder route
    { label: 'Mines', icon: Pickaxe, path: '/wallet/mines' },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">My Wallet</h1>
          <p className="text-slate-500 font-medium mt-1">Manage your digital assets securely.</p>
        </div>
        <div className="hidden md:block">
          <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-black uppercase tracking-widest">
            Active
          </span>
        </div>
      </div>

      {/* 3D Card Display */}
      <div className="relative group perspective-1000 cursor-pointer" onClick={() => navigate('/wallet/connect')}>
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-[2.5rem] blur opacity-20 group-hover:opacity-30 transition-opacity duration-1000"></div>
        <div className="relative h-64 w-full bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-[2.5rem] border border-white/10 p-8 flex flex-col justify-between overflow-hidden shadow-2xl transition-transform duration-500 hover:scale-[1.01]">
          {/* Decorative Background Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 blur-[80px] rounded-full translate-y-1/2 -translate-x-1/2"></div>

          {/* Card Top */}
          <div className="relative z-10 flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 backdrop-blur border border-white/10 flex items-center justify-center">
                <WalletIcon className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-black text-white tracking-wide">AVAS<span className="text-indigo-400">PAY</span></span>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">KES Balance</p>
              <h2 className="text-4xl font-black text-white tracking-tight">KES {(walletState.isConnected ? walletState.balance : wallet?.mallmoney)?.toLocaleString() ?? '0.00'}</h2>
            </div>
          </div>

          {/* Card Bottom */}
          <div className="relative z-10 flex justify-between items-end">
            <div className="flex gap-6">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">MallCoins</p>
                <p className="text-white font-bold">{(walletState.isConnected ? walletState.mallcoins : wallet?.mallcoins)?.toLocaleString() ?? 0} MLCNS</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Points</p>
                <p className="text-white font-bold">{(walletState.isConnected ? walletState.mallpoints : wallet?.mallpoints)?.toLocaleString() ?? 0} PTS</p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-600 font-mono tracking-widest">**** **** 4288</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            className="group flex flex-col items-center gap-3 p-4 rounded-[2rem] bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all"
          >
            <div className={`w-14 h-14 rounded-2xl ${action.color} bg-opacity-10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
              <action.icon className={`w-6 h-6 ${action.color.replace('bg-', 'text-')}`} />
            </div>
            <span className="text-xs font-bold text-slate-400 group-hover:text-white transition-colors">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Secondary Actions Row */}
      <div className="grid grid-cols-2 gap-4">
        {secondaryActions.map((action) => (
          <button
            key={action.label}
            onClick={() => {
              if (action.path.includes('cards')) {
                toast.info("Virtual Cards feature is coming soon!");
                return;
              }
              navigate(action.path);
            }}
            className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-white transition-colors">
              <action.icon className="w-5 h-5" />
            </div>
            <span className="font-bold text-slate-300 group-hover:text-white transition-colors">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-white">Recent Activity</h3>
          <button
            onClick={() => navigate('/wallet/transactions')}
            className="flex items-center gap-1 text-xs font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors"
          >
            View All
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-10 text-slate-500">Loading activity...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-10 text-slate-500">No transactions yet.</div>
          ) : (
            transactions.slice(0, 4).map((tx) => (
              <div key={tx.id || tx._id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-white/5 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tx.type === 'deposit' || tx.type === 'receive'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
                    }`}>
                    {tx.type === 'deposit' || tx.type === 'receive' ? <ArrowDownRight className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                  </div>
                  <div>
                    <p className="font-bold text-white truncate max-w-[150px]">
                      {tx.type === 'send' || tx.type === 'receive'
                        ? (tx.meta?.toEmail || tx.meta?.fromEmail || tx.meta?.toUsername || tx.meta?.fromUsername || tx.type)
                        : tx.type}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500 font-medium">{new Date(tx.createdAt || Date.now()).toLocaleDateString()}</p>
                      <span className="text-[9px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">{tx.referenceId || (tx.id || tx._id || 'UNKNOWN').slice(-8).toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                <span className={`text-lg font-black ${tx.type === 'deposit' || tx.type === 'receive' ? 'text-green-400' : 'text-white'
                  }`}>
                  {tx.type === 'deposit' || tx.type === 'receive' ? '+' : '-'} {tx.amount.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

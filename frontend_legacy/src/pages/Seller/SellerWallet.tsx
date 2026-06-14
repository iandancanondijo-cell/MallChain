import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { walletApi } from '../../api';
import { useUserStore } from '../../store/userStore';
import {
  Wallet,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Coins,
  Loader2,
  Download,
  Upload,
  History,
  CreditCard
} from 'lucide-react';
import { toast } from 'sonner';

export default function SellerWallet() {
  const { user } = useUserStore();
  const [wallet, setWallet] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWalletData();
  }, []);

  async function fetchWalletData() {
    setLoading(true);
    try {
      const [walletData, txData] = await Promise.all([
        walletApi.getWallet(),
        walletApi.getTransactions()
      ]);
      setWallet(walletData);
      setTransactions(txData.slice(0, 10)); // Latest 10 transactions
    } catch (error: any) {
      toast.error('Failed to load wallet data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const mallMoney = wallet?.mallmoney || user?.mallCoins || 0;
  const mallPoints = wallet?.mallpoints || user?.mallPoints || 0;

  return (
    <div className="pb-20 animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Seller Wallet</h1>
          <p className="text-slate-400 font-medium">Manage your earnings and transactions</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/wallet/deposit"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 font-bold hover:bg-green-500/20 transition-all"
          >
            <Upload className="w-5 h-5" />
            Deposit
          </Link>
          <Link
            to="/wallet/withdraw"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold hover:bg-amber-500/20 transition-all"
          >
            <Download className="w-5 h-5" />
            Withdraw
          </Link>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MallMoney Card */}
        <div className="relative bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-[2.5rem] p-8 overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <DollarSign className="w-7 h-7 text-indigo-400" />
              </div>
              <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">MallMoney</span>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-400">Available Balance</p>
              <p className="text-4xl font-black text-white">KES {mallMoney.toLocaleString()}</p>
            </div>
            <div className="mt-6 flex gap-3">
              <Link
                to="/wallet/send"
                className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-all text-center"
              >
                Send
              </Link>
              <Link
                to="/wallet/receive"
                className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-all text-center"
              >
                Receive
              </Link>
            </div>
          </div>
        </div>

        {/* MallPoints Card */}
        <div className="relative bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-[2.5rem] p-8 overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <Coins className="w-7 h-7 text-amber-400" />
              </div>
              <span className="text-xs font-black text-amber-400 uppercase tracking-widest">MallPoints</span>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-400">Reward Points</p>
              <p className="text-4xl font-black text-white">{mallPoints.toLocaleString()}</p>
            </div>
            <div className="mt-6">
              <Link
                to="/wallet/convert"
                className="block w-full py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-all text-center"
              >
                Convert to MallMoney
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">This Month</p>
              <p className="text-2xl font-black text-white mt-1">KES 0</p>
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Total Sales</p>
              <p className="text-2xl font-black text-white mt-1">0</p>
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Pending</p>
              <p className="text-2xl font-black text-white mt-1">KES 0</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-white flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" />
            Recent Transactions
          </h3>
          <Link
            to="/wallet/transactions"
            className="text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View All
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <History className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-500 font-medium">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx._id || tx.id}
                className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.type === 'deposit' || tx.type === 'credit'
                      ? 'bg-green-500/10 border border-green-500/20'
                      : 'bg-red-500/10 border border-red-500/20'
                    }`}>
                    {tx.type === 'deposit' || tx.type === 'credit' ? (
                      <ArrowDownLeft className="w-5 h-5 text-green-400" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{tx.description || tx.type}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(tx.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-black text-sm ${tx.type === 'deposit' || tx.type === 'credit' ? 'text-green-400' : 'text-red-400'
                    }`}>
                    {tx.type === 'deposit' || tx.type === 'credit' ? '+' : '-'}
                    {tx.currency === 'mallpoints' ? `${tx.amount} MP` : `KES ${tx.amount}`}
                  </p>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${tx.status === 'completed' ? 'text-green-400' :
                      tx.status === 'pending' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                    {tx.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getTransactions } from '../../api/wallet.api';
import type { WalletTransaction } from '../../types';
import useTransactionUpdates from '../../hooks/useTransactionUpdates';
import { ArrowUpRight, ArrowDownRight, Clock, Search } from 'lucide-react';

export default function Transactions() {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactions() {
    setLoading(true);
    try {
      const data = await getTransactions();
      setTransactions(data);
    } catch (e) {
      console.error('Failed to load transactions', e);
    } finally {
      setLoading(false);
    }
  }

  useTransactionUpdates(() => {
    loadTransactions();
  });

  const filtered = transactions.filter(t => {
    const matchesSearch = (t.referenceId || '').toLowerCase().includes(filter.toLowerCase()) ||
      (t.id || '').toLowerCase().includes(filter.toLowerCase()) ||
      (t.type || '').toLowerCase().includes(filter.toLowerCase()) ||
      (t.meta?.toEmail || '').toLowerCase().includes(filter.toLowerCase()) ||
      (t.meta?.fromEmail || '').toLowerCase().includes(filter.toLowerCase()) ||
      (t.meta?.toUsername || '').toLowerCase().includes(filter.toLowerCase()) ||
      (t.meta?.fromUsername || '').toLowerCase().includes(filter.toLowerCase());
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    return matchesSearch && matchesType;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Transaction History</h1>
          <p className="text-slate-500 text-sm">View all your wallet activity.</p>
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-indigo-500/50 outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-indigo-500/50 outline-none appearance-none"
          >
            <option value="all" className="bg-slate-900">All Types</option>
            <option value="deposit" className="bg-slate-900">Deposit</option>
            <option value="withdraw" className="bg-slate-900">Withdraw</option>
            <option value="send" className="bg-slate-900">Sent</option>
            <option value="receive" className="bg-slate-900">Received</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-[2rem] border border-white/5">
          <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((tx) => (
            <div key={tx.id || tx._id} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl hover:border-white/10 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tx.type === 'deposit' || tx.type === 'receive' ? 'bg-green-500/10 text-green-400' :
                  tx.type === 'withdraw' || tx.type === 'send' ? 'bg-red-500/10 text-red-400' : 'bg-slate-500/10 text-slate-400'
                  }`}>
                  {tx.type === 'deposit' || tx.type === 'receive' ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-white font-bold">
                    {tx.type === 'send' || tx.type === 'receive'
                      ? (tx.meta?.toEmail || tx.meta?.fromEmail || tx.meta?.toUsername || tx.meta?.fromUsername || tx.type)
                      : tx.type.toUpperCase()}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-slate-500">{new Date(tx.createdAt || Date.now()).toLocaleString()}</p>
                    <span className="text-[10px] font-mono text-indigo-400 font-bold">{tx.referenceId || (tx.id || tx._id || 'UNKNOWN').slice(-8).toUpperCase()}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-black ${tx.type === 'deposit' || tx.type === 'receive' ? 'text-green-400' : 'text-white'
                  }`}>
                  {tx.type === 'deposit' || tx.type === 'receive' ? '+' : '-'} {tx.currency === 'Mallcoins' ? '' : 'KES '} {tx.amount.toLocaleString()} {tx.currency === 'Mallcoins' ? 'MLCNS' : ''}
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  <div className={`w-1 h-1 rounded-full ${tx.status === 'completed' || !tx.status ? 'bg-green-400' : tx.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`}></div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{tx.status || 'Completed'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

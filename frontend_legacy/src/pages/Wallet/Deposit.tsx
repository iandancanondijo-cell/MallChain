import { useState } from 'react';
import { deposit } from '../../api/wallet.api';
import { Smartphone, CreditCard, Loader2, CheckCircle2 } from 'lucide-react';

export default function Deposit() {
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<'mpesa' | 'card'>('mpesa');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) {
      setError("Please enter an amount");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await deposit({
        amount: Number(amount),
        phone: method === 'mpesa' ? phone : undefined,
        method
      });
      setStatus('process_wait'); // Wait for callback
      setTimeout(() => setStatus('success'), 2000);
    } catch (err: any) {
      setError(err.message || "Deposit failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-fade-in">
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(34,197,94,0.4)]">
          <CheckCircle2 className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-3xl font-black text-white mb-2">Deposit Initiated!</h2>
        <p className="text-slate-400 font-medium">Please check your phone to complete the transaction.</p>
        <button
          onClick={() => setStatus('idle')}
          className="mt-8 px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
        >
          Make Another Deposit
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Deposit Funds</h1>
        <p className="text-slate-500 mt-1 font-medium">Load your wallet instantly.</p>
      </div>

      <form onSubmit={handleDeposit} className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-8">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold">
            {error}
          </div>
        )}

        {/* Amount Input */}
        <div className="relative group">
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4 text-center">Amount to Deposit</label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent py-4 text-center text-5xl font-black text-white placeholder-slate-800 outline-none"
              placeholder="0"
              min="1"
              autoFocus
            />
            <span className="absolute top-1/2 left-1/2 -translate-x-[60px] -translate-y-1/2 text-slate-700 text-2xl font-bold pointer-events-none transition-all group-focus-within:text-green-500/50">
              KES
            </span>
          </div>
        </div>

        {/* Method Selection */}
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setMethod('mpesa')}
            className={`p-6 rounded-[1.5rem] border transition-all flex flex-col items-center gap-3 group ${method === 'mpesa'
                ? 'bg-green-500/10 border-green-500 text-green-400 shadow-[0_0_30px_rgba(34,197,94,0.2)]'
                : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10 hover:text-white'
              }`}
          >
            <Smartphone className="w-8 h-8" />
            <span className="font-bold text-sm tracking-wide">M-Pesa</span>
          </button>

          <button
            type="button"
            onClick={() => setMethod('card')}
            className={`p-6 rounded-[1.5rem] border transition-all flex flex-col items-center gap-3 group ${method === 'card'
                ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.2)]'
                : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10 hover:text-white'
              }`}
          >
            <CreditCard className="w-8 h-8" />
            <span className="font-bold text-sm tracking-wide">Card</span>
          </button>
        </div>

        {/* Phone (if M-PESA) */}
        {method === 'mpesa' && (
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-transparent text-xl font-bold text-white placeholder-slate-700 outline-none"
              placeholder="07..."
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-5 rounded-2xl text-white font-black transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg hover:scale-[1.02] active:scale-[0.98] ${method === 'mpesa' ? 'bg-green-500 hover:bg-green-600 shadow-green-500/20' : 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20'
            }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              PROCESSING...
            </>
          ) : (
            'DEPOSIT FUNDS'
          )}
        </button>
      </form>
    </div>
  );
}

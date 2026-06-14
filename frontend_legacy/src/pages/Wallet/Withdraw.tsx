import { useState } from 'react';
import { withdraw } from '../../api/wallet.api';
import { ArrowDownRight, Smartphone, Building2, Loader2, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Withdraw() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'mpesa' | 'bank'>('mpesa');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !pin || (method === 'mpesa' && !phone)) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await withdraw({
        amount: Number(amount),
        method,
        phone,
        pin
      });
      setSuccess(true);
      setTimeout(() => navigate('/wallet'), 2000);
    } catch (err: any) {
      setError(err.message || "Withdrawal failed. Check PIN and balance.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-fade-in">
        <div className="w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(249,115,22,0.4)]">
          <CheckCircle2 className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-3xl font-black text-white mb-2">Withdrawal Successful!</h2>
        <p className="text-slate-400 font-medium">Funds are on the way.</p>
        <p className="text-xs font-black text-slate-600 mt-12 uppercase tracking-widest">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Withdraw Funds</h1>
        <p className="text-slate-500 mt-1 font-medium">Cash out securely to your account.</p>
      </div>

      <form onSubmit={handleWithdraw} className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-8">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold">
            {error}
          </div>
        )}

        {/* Amount Input */}
        <div className="relative group">
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4 text-center">Amount to Withdraw</label>
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
            <span className="absolute top-1/2 left-1/2 -translate-x-[60px] -translate-y-1/2 text-slate-700 text-2xl font-bold pointer-events-none transition-all group-focus-within:text-orange-500/50">
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
            onClick={() => setMethod('bank')}
            className={`p-6 rounded-[1.5rem] border transition-all flex flex-col items-center gap-3 group ${method === 'bank'
                ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.2)]'
                : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10 hover:text-white'
              }`}
          >
            <Building2 className="w-8 h-8" />
            <span className="font-bold text-sm tracking-wide">Bank</span>
          </button>
        </div>

        {/* Phone / Account */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
            {method === 'mpesa' ? 'Phone Number' : 'Account Number'}
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-transparent text-xl font-bold text-white placeholder-slate-700 outline-none"
            placeholder={method === 'mpesa' ? "07..." : "Account Number"}
          />
        </div>

        {/* PIN */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3 text-center">Security PIN</label>
          <div className="flex justify-center">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-40 bg-white/5 border border-white/10 rounded-2xl py-3 text-center text-white text-2xl tracking-[0.5em] font-black focus:border-indigo-500/50 outline-none transition-all placeholder-slate-700"
              placeholder="••••"
              maxLength={4}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-5 rounded-2xl bg-orange-500 text-white font-black hover:bg-orange-600 shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>PROCESSING...</span>
            </>
          ) : (
            <>
              <ArrowDownRight className="w-5 h-5" />
              <span>WITHDRAW NOW</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

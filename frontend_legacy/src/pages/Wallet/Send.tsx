import { useState } from 'react';
import { sendMoney } from '../../api/wallet.api';
import { User, Send as SendIcon, Loader2, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Send() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !recipient || !pin) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await sendMoney({
        toUsername: recipient,
        amount: Number(amount),
        pin
      });
      setSuccess(true);
      setTimeout(() => navigate('/wallet'), 2000);
    } catch (err: any) {
      setError(err.message || "Failed to send money. Check balance and PIN.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-fade-in">
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(34,197,94,0.4)]">
          <CheckCircle2 className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-3xl font-black text-white mb-2">Sent Successfully!</h2>
        <p className="text-slate-400 font-medium text-lg">KES {amount} has been sent to {recipient.includes('@') ? recipient : `@${recipient}`}</p>
        <p className="text-xs font-black text-slate-600 mt-12 uppercase tracking-widest">Redirecting to wallet...</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Send Money</h1>
        <p className="text-slate-500 mt-1 font-medium">Transfer funds instantly to any user.</p>
      </div>

      <form onSubmit={handleSend} className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-8">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            {error}
          </div>
        )}

        {/* Amount Input - Big & Bold */}
        <div className="relative group">
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4 text-center">Enter Amount</label>
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
            <span className="absolute top-1/2 left-1/2 -translate-x-[60px] -translate-y-1/2 text-slate-700 text-2xl font-bold pointer-events-none transition-all group-focus-within:text-indigo-500/50">
              KES
            </span>
          </div>
        </div>

        {/* Recipient */}
        <div className="bg-white/5 rounded-2xl p-2 border border-white/5 focus-within:border-indigo-500/50 transition-colors">
          <div className="flex items-center gap-4 px-4 py-2">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center overflow-hidden">
              <User className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">To Recipient</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full bg-transparent text-white font-bold placeholder-slate-600 outline-none"
                placeholder="Email or Username"
              />
            </div>
          </div>
        </div>

        {/* PIN */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3 text-center">Confirm with PIN</label>
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
          className="w-full py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-indigo-500/20"
        >
          {loading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>SENDING...</span>
            </>
          ) : (
            <>
              <SendIcon className="w-5 h-5" />
              <span>SEND MONEY</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

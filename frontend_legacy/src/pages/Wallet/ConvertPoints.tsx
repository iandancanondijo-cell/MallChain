import { useState, useEffect } from 'react';
import { getWallet, convertPoints, getConversionRate } from '../../api/wallet.api';
import { RefreshCw, Coins, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

export default function ConvertPoints() {
  const [points, setPoints] = useState(0);
  const [amountToConvert, setAmountToConvert] = useState('');
  const [rate, setRate] = useState(2); // 1 point = 2 KES
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [w, r] = await Promise.all([
        getWallet(),
        getConversionRate()
      ]);
      setPoints(w.mallpoints || 0);
      setRate(r || 2);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleConvert() {
    if (!amountToConvert) return;
    setLoading(true);
    try {
      await convertPoints(Number(amountToConvert));
      setSuccess(true);
      await loadData();
      setAmountToConvert('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      alert(e.message || "Conversion failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Convert Points</h1>
        <p className="text-slate-500 mt-1 font-black uppercase tracking-widest text-[10px]">One MallPoint is 2 KES</p>
      </div>

      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-8 relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2"></div>

        {/* Points Display */}
        <div className="relative z-10 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-white/5 to-transparent rounded-[2rem] border border-white/5 shadow-inner">
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
            <Coins className="w-8 h-8 text-indigo-400" />
          </div>
          <span className="text-sm font-black text-indigo-400 uppercase tracking-widest mb-1">Available Balance</span>
          <h2 className="text-5xl font-black text-white tracking-tight">{points.toLocaleString()} <span className="text-2xl text-slate-500">PTS</span></h2>
        </div>

        {/* Visual Flow */}
        <div className="flex items-center justify-between px-4">
          {/* Input Side */}
          <div className="flex-1">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Points</label>
            <input
              type="number"
              value={amountToConvert}
              onChange={(e) => setAmountToConvert(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-center text-white text-xl font-black focus:border-indigo-500/50 outline-none transition-all placeholder-slate-700"
              placeholder="0"
              max={points}
            />
          </div>

          {/* Arrow */}
          <div className="px-4 flex flex-col items-center justify-center text-slate-600">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <ArrowRight className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold mt-2">1:{rate}</span>
          </div>

          {/* Output Side */}
          <div className="flex-1">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">You Get</label>
            <div className="w-full bg-green-500/10 border border-green-500/20 rounded-2xl py-4 px-4 text-center">
              <span className="text-xl font-black text-green-400">
                KES {amountToConvert ? (Number(amountToConvert) * rate).toFixed(2) : '0.00'}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleConvert}
          disabled={loading || !amountToConvert || Number(amountToConvert) <= 0 || Number(amountToConvert) > points}
          className="w-full py-5 rounded-2xl bg-indigo-500 text-white font-black hover:bg-indigo-600 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 shadow-lg shadow-indigo-500/20 group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin relative z-10" />
          ) : success ? (
            <>
              <CheckCircle2 className="w-6 h-6 relative z-10" />
              <span className="relative z-10">CONVERTED!</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5 relative z-10 group-hover:rotate-180 transition-transform duration-500" />
              <span className="relative z-10">CONVERT POINTS</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

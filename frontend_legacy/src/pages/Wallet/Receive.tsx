import { useEffect, useState } from 'react';
import { createReceiveLink } from '../../api/wallet.api';
import { QrCode, Copy, Check, Share2, Wallet } from 'lucide-react';
import { getProfile } from '../../api/auth.api';

export default function Receive() {
  const [qrData, setQrData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    loadUserAndQr();
  }, []);

  async function loadUserAndQr() {
    try {
      const u = await getProfile();
      setUser(u);
      generateQr(u._id); // Pass ID to ensure generation is tied
    } catch (e) {
      console.error("Failed to load user", e);
    }
  }

  async function generateQr(userId?: string) {
    setLoading(true);
    try {
      // Backend automatically uses req.user._id but we trigger it here
      const result = await createReceiveLink(amount ? Number(amount) : undefined);
      setQrData(result.qrDataUrl || null);
    } catch (e) {
      console.error("Failed to generate QR", e);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!qrData || !user) return;
    const payload = btoa(JSON.stringify({
      toUserId: user._id,
      toUsername: user.username,
      amount: amount || undefined,
      ts: Date.now()
    }));
    navigator.clipboard.writeText(`https://avas.app/pay?data=${payload}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Receive Money</h1>
        <p className="text-slate-500 mt-1">Accept payments securely via your unique QR.</p>
      </div>

      <div className="glass-dark p-1 rounded-[3rem] border border-white/10 relative overflow-hidden bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent">
        <div className="absolute inset-0 bg-noise opacity-[0.03]"></div>

        <div className="bg-[#0a0a0a]/80 backdrop-blur-xl p-8 rounded-[2.5rem] flex flex-col items-center relative z-10">

          {/* User Info Badge */}
          <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full mb-8 border border-white/5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
              <span className="font-black text-xs text-white">{user?.username?.slice(0, 2).toUpperCase() || 'ME'}</span>
            </div>
            <span className="text-sm font-bold text-slate-300">@{user?.username || 'user'}</span>
          </div>

          {/* QR Container with Neon Glow */}
          <div className="relative group cursor-pointer" onClick={handleCopy}>
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2rem] blur opacity-40 group-hover:opacity-60 transition-opacity duration-1000"></div>
            <div className="relative w-72 h-72 bg-white rounded-[1.75rem] flex items-center justify-center p-6 shadow-2xl">
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-indigo-600"></div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Generating...</span>
                </div>
              ) : qrData ? (
                <img src={qrData} alt="Payment QR" className="w-full h-full object-contain mix-blend-multiply opacity-90" />
              ) : (
                <QrCode className="w-32 h-32 text-slate-200" />
              )}

              {/* Logo Overlay */}
              {!loading && qrData && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-12 h-12 bg-white rounded-xl shadow-lg flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-slate-500 text-xs font-medium mt-6 text-center max-w-xs leading-relaxed uppercase tracking-widest">
            Scan to pay <span className="text-white font-bold">@{user?.username}</span>
          </p>

          {/* Amount Input */}
          <div className="w-full mt-8 relative group">
            <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent group-focus-within:via-indigo-500 transition-all duration-500"></div>
            <input
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); generateQr(); }}
              className="w-full bg-transparent py-4 text-center text-3xl font-black text-white placeholder-slate-700 outline-none"
              placeholder="0.00"
            />
            <span className="absolute top-1/2 left-1/2 -translate-x-[40px] -translate-y-1/2 text-slate-700 text-lg font-bold pointer-events-none transition-all group-focus-within:text-indigo-500/50">
              KES
            </span>
          </div>

        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={handleCopy}
          className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex flex-col items-center gap-2 group"
        >
          {copied ? <Check className="w-6 h-6 text-green-400" /> : <Copy className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />}
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{copied ? 'COPIED' : 'COPY LINK'}</span>
        </button>
        <button className="p-4 rounded-2xl bg-indigo-500 hover:bg-indigo-600 transition-all flex flex-col items-center gap-2 group shadow-[0_4px_20px_-5px_rgba(99,102,241,0.5)]">
          <Share2 className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
          <span className="text-xs font-black text-white/90 uppercase tracking-widest">SHARE DETAILS</span>
        </button>
      </div>
    </div>
  );
}

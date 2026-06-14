import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../../api/auth.api';
import { Mail, ArrowRight, AlertCircle, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [debugUrl, setDebugUrl] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const data = await forgotPassword(email);
            setSuccess(data.message);
            if (data.debugUrl) {
                setDebugUrl(data.debugUrl);
            }
        } catch (err: any) {
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#020617] px-4 py-12 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0">
                <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[20%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1.5s' }}></div>
            </div>

            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20"></div>

            <div className="w-full max-w-md relative z-10 animate-fade-in">
                {/* Brand Badge */}
                <div className="flex justify-center mb-8 animate-slide-up">
                    <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full glass border border-white/10 backdrop-blur-xl">
                        <ShieldCheck className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-black tracking-[0.2em] text-blue-100 uppercase">
                            Secure Recovery
                        </span>
                    </div>
                </div>

                {/* Premium Card */}
                <div className="glass-dark backdrop-blur-3xl rounded-[2.5rem] p-8 md:p-10 shadow-2xl border border-white/5">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <h2 className="text-3xl font-black text-white mb-3 tracking-tight">Forgot Password?</h2>
                        <p className="text-slate-400 text-sm font-medium">Enter your email and we'll send you a recovery link.</p>
                    </div>

                    {/* Content */}
                    {!success ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-shake">
                                    <div className="flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-red-500" />
                                        <p className="text-xs font-bold text-red-200">{error}</p>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 ml-1">
                                    Email Address
                                </label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-600 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                        placeholder="Enter your email"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="group w-full bg-white text-black py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-slate-100 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="flex items-center justify-center gap-3">
                                    {loading ? 'SENDING...' : 'SEND RECOVERY LINK'}
                                    {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                                </span>
                            </button>
                        </form>
                    ) : (
                        <div className="text-center space-y-6 animate-scale-in">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 mb-4">
                                <CheckCircle2 className="w-10 h-10 text-green-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white">Check Your Email</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">{success}</p>
                            </div>

                            {debugUrl && (
                                <div className="mt-6 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-left">
                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Dev Mode: Reset Link</p>
                                    <a href={debugUrl} className="text-xs text-blue-300 hover:underline break-all block font-mono">
                                        {debugUrl}
                                    </a>
                                </div>
                            )}

                            <Link
                                to="/login"
                                className="inline-block w-full py-4 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                            >
                                Return to Login
                            </Link>
                        </div>
                    )}

                    {!success && (
                        <div className="mt-8 text-center">
                            <Link
                                to="/login"
                                className="text-slate-500 text-sm font-medium hover:text-white transition-colors underline underline-offset-4 decoration-white/10"
                            >
                                Back to Sign In
                            </Link>
                        </div>
                    )}
                </div>

                {/* Platform Badge */}
                <div className="mt-8 flex justify-center items-center gap-4 text-slate-600">
                    <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-green-500/50" />
                        <span className="text-[9px] font-black tracking-widest uppercase">SSL Protected</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

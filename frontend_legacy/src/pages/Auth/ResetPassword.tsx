import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { resetPassword } from '../../api/auth.api';
import { Lock, ArrowRight, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function ResetPassword() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            await resetPassword(token || '', password);
            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            setError(err.message || 'Reset failed. The link may be invalid or expired.');
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
                        <Lock className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-black tracking-[0.2em] text-blue-100 uppercase">
                            Finalize Reset
                        </span>
                    </div>
                </div>

                {/* Premium Card */}
                <div className="glass-dark backdrop-blur-3xl rounded-[2.5rem] p-8 md:p-10 shadow-2xl border border-white/5">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <h2 className="text-3xl font-black text-white mb-3 tracking-tight">New Password</h2>
                        <p className="text-slate-400 text-sm font-medium">Create a strong password to secure your account.</p>
                    </div>

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

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 ml-1">
                                        New Password
                                    </label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-600 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                            placeholder="••••••••••••"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 ml-1">
                                        Confirm Password
                                    </label>
                                    <div className="relative group">
                                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                        <input
                                            type="password"
                                            required
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-600 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                            placeholder="••••••••••••"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="group w-full bg-white text-black py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-slate-100 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="flex items-center justify-center gap-3">
                                    {loading ? 'UPDATING...' : 'RESET PASSWORD'}
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
                                <h3 className="text-xl font-bold text-white">Password Updated</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    Your secure password has been successfully updated. Redirecting you to login...
                                </p>
                            </div>

                            <div className="w-full bg-white/5 rounded-full h-1 relative overflow-hidden">
                                <div className="absolute inset-0 bg-blue-500 animate-[progress_3s_linear]"></div>
                            </div>

                            <Link
                                to="/login"
                                className="inline-block py-2 text-sm font-bold text-blue-400 hover:text-white transition-colors"
                            >
                                Log in manually
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

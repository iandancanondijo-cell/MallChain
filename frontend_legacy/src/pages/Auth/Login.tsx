import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { login as loginApi } from '../../api/auth.api';
import { Mail, Lock, ArrowRight, AlertCircle, Sparkles, ShieldCheck } from 'lucide-react';

export default function Login() {
    const navigate = useNavigate();
    const login = useUserStore((state) => state.login);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const data = await loginApi({ email, password });
            console.log("Login API success:", data); // Debug log

            // Check if user object exists
            if (!data || !data.user) {
                console.error("Missing user data in login response");
                throw new Error("Invalid server response");
            }

            login(data.user, data.token, data.refreshToken);
            console.log("Store updated, role:", data.user.role); // Debug log

            if (data.user.role) {
                console.log("Navigating to:", `/${data.user.role}`); // Debug log
                navigate(`/${data.user.role}`);
            } else {
                console.log("Navigating to: /roles"); // Debug log
                navigate('/roles');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#020617] px-4 py-12 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20"></div>

            <div className="w-full max-w-md relative z-10 animate-fade-in">
                {/* Brand Logo/Badge */}
                <div className="flex justify-center mb-8 animate-slide-up">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-blue-500/20 hover-glow">
                        <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                </div>

                {/* Premium Card */}
                <div className="glass-dark backdrop-blur-3xl rounded-[2.5rem] p-8 md:p-10 shadow-2xl border border-white/5 hover:border-white/10 transition-colors duration-500">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <h2 className="text-4xl font-black text-white mb-3 tracking-tight">
                            Sign In
                        </h2>
                        <p className="text-slate-400 font-medium">Continue your digital journey</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-8 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm animate-shake">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <p className="text-sm font-bold text-red-200">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="block text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
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

                        <div className="space-y-2">
                            <div className="flex justify-between items-center ml-1">
                                <label className="block text-xs font-black uppercase tracking-widest text-slate-500">
                                    Password
                                </label>
                                <Link to="/forgot-password" title="Coming soon!" className="text-[10px] font-bold text-slate-600 hover:text-blue-400 transition-colors">
                                    FORGOT?
                                </Link>
                            </div>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-600 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="group w-full bg-white text-black py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-slate-100 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 mt-4"
                        >
                            <span className="flex items-center justify-center gap-2">
                                {loading ? 'AUTHENTICATING...' : 'ACCESS ACCOUNT'}
                                {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                            </span>
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-10 text-center">
                        <p className="text-slate-500 text-sm font-medium">
                            First time here?{' '}
                            <Link
                                to="/signup"
                                className="text-white font-bold hover:text-blue-400 transition-colors underline underline-offset-4 decoration-blue-500/30"
                            >
                                Register Now
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Platform Badge */}
                <div className="mt-8 flex justify-center items-center gap-4 text-slate-600 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                    <div className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span className="text-[10px] font-black tracking-widest uppercase">Verified Secure</span>
                    </div>
                    <div className="w-1 h-1 bg-slate-800 rounded-full"></div>
                    <div className="flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span className="text-[10px] font-black tracking-widest uppercase">SSL Protected</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { signup } from '../../api/auth.api';
import { Mail, Lock, User, ArrowRight, AlertCircle, Sparkles, Phone, ShieldCheck, Zap } from 'lucide-react';

export default function Signup() {
    const navigate = useNavigate();
    const login = useUserStore((state) => state.login);
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const data = await signup({ name, username, email, password, phone, countryCode: 'KE' });
            if (data.token) {
                login(data.user, data.token, data.refreshToken);
                navigate('/roles');
            } else {
                navigate('/login');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Registration failed.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#020617] px-4 py-20 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0">
                <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[20%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1.5s' }}></div>
            </div>

            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20"></div>

            <div className="w-full max-w-xl relative z-10 animate-fade-in">
                {/* Brand Badge */}
                <div className="flex justify-center mb-8 animate-slide-up">
                    <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full glass border border-white/10 backdrop-blur-xl">
                        <Zap className="w-4 h-4 text-blue-400 fill-blue-400" />
                        <span className="text-xs font-black tracking-[0.2em] text-blue-100 uppercase">
                            Join the Revolution
                        </span>
                    </div>
                </div>

                {/* Premium Card */}
                <div className="glass-dark backdrop-blur-3xl rounded-[3rem] p-8 md:p-12 shadow-2xl border border-white/5">
                    {/* Header */}
                    <div className="text-center mb-12">
                        <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter">
                            Create Account
                        </h2>
                        <p className="text-slate-400 font-medium">Start your journey in decentralized commerce</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-8 p-5 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm animate-shake">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <p className="text-sm font-bold text-red-200">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Name Field */}
                        <div className="space-y-2">
                            <label className="block text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
                                Full Name
                            </label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-600 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder="Full Name"
                                />
                            </div>
                        </div>

                        {/* Username Field */}
                        <div className="space-y-2">
                            <label className="block text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
                                Username
                            </label>
                            <div className="relative group">
                                <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="text"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                                    className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-600 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder="Username"
                                />
                            </div>
                        </div>

                        {/* Email Field */}
                        <div className="space-y-2">
                            <label className="block text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
                                Email
                            </label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-600 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder="Email Address"
                                />
                            </div>
                        </div>

                        {/* Phone Field */}
                        <div className="space-y-2">
                            <label className="block text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
                                Phone
                            </label>
                            <div className="relative group">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="tel"
                                    required
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-600 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder="+254..."
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="md:col-span-2 space-y-2">
                            <label className="block text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
                                Secure Password
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

                        {/* Submit Button */}
                        <div className="md:col-span-2 pt-6">
                            <button
                                type="submit"
                                disabled={loading}
                                className="group w-full bg-white text-black py-4 rounded-2xl font-black text-xl shadow-2xl hover:bg-slate-100 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="flex items-center justify-center gap-3">
                                    {loading ? 'INITIALIZING...' : 'CREATE ACCOUNT'}
                                    {!loading && <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />}
                                </span>
                            </button>
                        </div>
                    </form>

                    {/* Footer */}
                    <div className="mt-12 text-center">
                        <p className="text-slate-500 text-sm font-medium">
                            Already part of the network?{' '}
                            <Link
                                to="/login"
                                className="text-white font-bold hover:text-blue-400 transition-colors underline underline-offset-4 decoration-blue-500/30"
                            >
                                Log In
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Platform Badge */}
                <div className="mt-8 flex justify-center items-center gap-6 text-slate-600 animate-fade-in" style={{ animationDelay: '0.8s' }}>
                    <div className="flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                        <span className="text-[10px] font-black tracking-widest uppercase">Encryption Active</span>
                    </div>
                    <div className="w-1 h-1 bg-slate-800 rounded-full"></div>
                    <div className="flex items-center gap-1">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        <span className="text-[10px] font-black tracking-widest uppercase">Zero Gas Fees</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

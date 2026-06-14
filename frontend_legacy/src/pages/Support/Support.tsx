import { useState } from 'react';
import {
    MessageCircle,
    BookOpen,
    ShieldCheck,
    ChevronDown,
    Search,
    Zap,
    Cpu,
    Activity,
    Globe,
    Lock,
    Terminal,
    AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FAQItem {
    question: string;
    answer: string;
}

const faqs: FAQItem[] = [
    {
        question: "How do I deposit funds into my wallet?",
        answer: "You can deposit funds by navigating to 'My Wallet' and clicking the 'Deposit' button. We support M-Pesa STK Push and direct bank transfers."
    },
    {
        question: "How long do withdrawals take?",
        answer: "Most withdrawals are processed instantly. Large withdrawals or those requiring manual verification may take up to 24 hours."
    },
    {
        question: "Is my transaction PIN secure?",
        answer: "Yes, your PIN is hashed using industry-standard Bcrypt. Never share your PIN with anyone, including Avas staff."
    },
    {
        question: "What are MallCoins and MallPoints?",
        answer: "MallPoints are earned through platform activity and can be converted to MallCoins. MallCoins are our internal stable currency used for marketplace transactions."
    },
    {
        question: "How do I become a verified seller?",
        answer: "Go to your profile settings and click on 'Professional Verification'. You'll need to provide valid ID and business documentation."
    }
];

export default function Support() {
    const navigate = useNavigate();
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredFaqs = faqs.filter(faq =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="pb-20 animate-fade-in space-y-12">
            {/* Header / Hero Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-black text-white tracking-tight">Help & Support</h1>
                        <div className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase tracking-widest">
                            System Live
                        </div>
                    </div>
                    <p className="text-slate-400 font-medium">Access our knowledge base or connect with platform specialists.</p>
                </div>

                {/* Compact Stats Grid for Support */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                        { label: 'Uptime', value: '99.9%', icon: Activity, color: 'text-emerald-400' },
                        { label: 'Latency', value: '14ms', icon: Zap, color: 'text-indigo-400' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 min-w-[140px]">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-lg font-black text-white">{stat.value}</span>
                                <stat.icon className={`w-3 h-3 ${stat.color}`} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Access Search */}
            <div className="relative group max-w-2xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                <input
                    type="text"
                    placeholder="Search for articles, guides, or troubleshooting..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium focus:border-indigo-500/50 outline-none transition-all shadow-2xl"
                />
            </div>

            {/* Main Interactive Channels */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    {
                        title: 'Live Support',
                        desc: 'Direct line to our senior engineering team.',
                        icon: MessageCircle,
                        color: 'text-indigo-400',
                        bg: 'bg-indigo-500/10',
                        action: () => navigate('/chat'),
                        label: 'Initialize'
                    },
                    {
                        title: 'Knowledge Mesh',
                        desc: 'Platform schematics and user guides.',
                        icon: BookOpen,
                        color: 'text-teal-400',
                        bg: 'bg-teal-500/10',
                        label: 'Browse'
                    },
                    {
                        title: 'Encryption HQ',
                        desc: 'Manage your security and privacy nodes.',
                        icon: ShieldCheck,
                        color: 'text-emerald-400',
                        bg: 'bg-emerald-500/10',
                        label: 'Settings'
                    }
                ].map((channel, i) => (
                    <div key={i} className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-8 hover:border-indigo-500/30 transition-all group flex flex-col justify-between h-full">
                        <div className="space-y-6">
                            <div className={`w-12 h-12 rounded-xl ${channel.bg} flex items-center justify-center ${channel.color}`}>
                                <channel.icon className="w-6 h-6" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black text-white tracking-tight group-hover:text-indigo-400 transition-colors">{channel.title}</h3>
                                <p className="text-slate-500 text-sm font-medium leading-relaxed">{channel.desc}</p>
                            </div>
                        </div>
                        <button
                            onClick={channel.action}
                            className="mt-8 py-3 rounded-xl bg-white/5 hover:bg-white text-white hover:text-black text-[10px] font-black uppercase tracking-widest transition-all duration-300"
                        >
                            {channel.label}
                        </button>
                    </div>
                ))}
            </div>

            {/* FAQ Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="lg:col-span-4 space-y-4">
                    <h2 className="text-2xl font-black text-white tracking-tight">Intelligence Archives</h2>
                    <p className="text-slate-500 text-sm font-medium leading-relaxed">
                        Frequently accessed data fragments for immediate resolution.
                    </p>
                    <div className="pt-4 flex flex-col gap-3">
                        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-600">
                            <Lock className="w-4 h-4" /> Secured
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-600">
                            <Globe className="w-4 h-4" /> Global
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-8 space-y-3">
                    {filteredFaqs.map((faq, index) => (
                        <div
                            key={index}
                            className={`bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden transition-all duration-300 ${openFaq === index ? 'border-indigo-500/30 ring-1 ring-indigo-500/10' : 'hover:border-white/10'}`}
                        >
                            <button
                                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                                className="w-full p-6 flex items-center justify-between text-left"
                            >
                                <span className={`font-bold transition-colors ${openFaq === index ? 'text-white' : 'text-slate-400'}`}>
                                    {faq.question}
                                </span>
                                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${openFaq === index ? 'rotate-180 text-indigo-400' : 'text-slate-600'}`} />
                            </button>
                            {openFaq === index && (
                                <div className="px-6 pb-6 text-sm text-slate-500 font-medium leading-relaxed italic border-t border-white/[0.02] pt-4">
                                    {faq.answer}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Emergency / Critical Access */}
            <div className="bg-[#0a0a0b] border border-orange-500/20 rounded-[2.5rem] p-12 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-[100px] -mr-32 -mt-32" />
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="space-y-4 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black uppercase tracking-widest">
                            <AlertCircle className="w-3.5 h-3.5" /> High Priority
                        </div>
                        <h2 className="text-3xl font-black text-white tracking-tight italic">Technical Emergency?</h2>
                        <p className="text-slate-500 max-w-md text-sm font-medium">
                            If your operation is critically stalled, trigger an immediate manual override signal.
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <button className="px-8 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all shadow-xl">
                            Send Signal
                        </button>
                        <button className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                            Chat Core
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

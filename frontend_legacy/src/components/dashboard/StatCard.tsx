import { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    trend?: {
        value: string;
        isPositive: boolean;
    };
    color?: 'blue' | 'purple' | 'amber' | 'green' | 'red' | 'indigo' | 'yellow' | 'pink' | 'cyan';
}

const colorStyles = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    pink: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
};

const glowStyles = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    indigo: 'bg-indigo-500',
    yellow: 'bg-yellow-500',
    pink: 'bg-pink-500',
    cyan: 'bg-cyan-500'
};

export default function StatCard({ title, value, icon: Icon, trend, color = 'blue' }: StatCardProps) {
    return (
        <div className="glass-dark p-6 rounded-[2rem] border border-white/5 hover:border-white/10 transition-all duration-500 group relative overflow-hidden">
            {/* Background Glow */}
            <div className={`absolute -right-4 -top-4 w-24 h-24 blur-[60px] opacity-20 transition-opacity duration-500 group-hover:opacity-40 ${glowStyles[color]}`}></div>

            <div className="flex items-start justify-between relative z-10">
                <div className="space-y-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">{title}</span>
                        <h3 className="text-3xl font-black text-white tracking-tight group-hover:scale-[1.02] transition-transform origin-left duration-500">
                            {value}
                        </h3>
                    </div>

                    {trend && (
                        <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${trend.isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                {trend.isPositive ? '+' : '-'}{trend.value}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Since last month</span>
                        </div>
                    )}
                </div>

                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 ${colorStyles[color]}`}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>

            {/* Bottom Progress Bar Decoration */}
            <div className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-right from-transparent via-indigo-500/50 to-transparent w-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
        </div>
    );
}

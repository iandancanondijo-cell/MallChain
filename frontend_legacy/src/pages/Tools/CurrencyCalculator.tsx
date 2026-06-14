import { useState, useEffect, useMemo } from 'react';
import {
    Calculator,
    TrendingUp,
    Coins,
    Star,
    ArrowRightLeft,
    Info,
    RefreshCw,
    Loader2,
    DollarSign,
    Euro,
    Banknote,
    ChevronDown
} from 'lucide-react';
import { getBuyPrice, getConversionRate, getMarketRates } from '../../api/wallet.api';

interface CurrencyConfig {
    id: string;
    label: string;
    symbol: string;
    icon: any;
    color: string;
    precision: number;
    // Rate relative to KES (Base)
    // 1 unit of this currency = X KES
    toKes: number;
}

export default function CurrencyCalculator() {
    const [fromCurrency, setFromCurrency] = useState('kes');
    const [toCurrency, setToCurrency] = useState('mlc');
    const [inputValue, setInputValue] = useState<string>('');
    const [outputValue, setOutputValue] = useState<string>('0.00');

    const [rates, setRates] = useState({
        mlc: 0.62,
        mp: 2.0,
        usd: 0.0078,
        eur: 0.0072,
        gbp: 0.0062
    });
    const [loading, setLoading] = useState(true);

    // Dynamic configuration
    const currencies: CurrencyConfig[] = useMemo(() => [
        {
            id: 'kes',
            label: 'Kenyan Shillings',
            symbol: 'K/',
            icon: TrendingUp,
            color: 'emerald',
            precision: 2,
            toKes: 1
        },
        {
            id: 'mlc',
            label: 'MallCoins',
            symbol: 'MLC',
            icon: Coins,
            color: 'indigo',
            precision: 2,
            toKes: rates.mlc
        },
        {
            id: 'mp',
            label: 'Mall Points',
            symbol: 'P/',
            icon: Star,
            color: 'amber',
            precision: 0,
            toKes: rates.mp
        },
        {
            id: 'usd',
            label: 'US Dollar',
            symbol: '$',
            icon: DollarSign,
            color: 'blue',
            precision: 2,
            toKes: 1 / rates.usd
        },
        {
            id: 'eur',
            label: 'Euro',
            symbol: '€',
            icon: Euro,
            color: 'violet',
            precision: 2,
            toKes: 1 / rates.eur
        },
        {
            id: 'gbp',
            label: 'Pound Sterling',
            symbol: '£',
            icon: Banknote,
            color: 'rose',
            precision: 2,
            toKes: 1 / rates.gbp
        }
    ], [rates]);

    useEffect(() => {
        async function fetchRates() {
            try {
                const [mlcRate, mpRate, mktRates] = await Promise.all([
                    getBuyPrice(),
                    getConversionRate(),
                    getMarketRates()
                ]);
                setRates({
                    mlc: mlcRate,
                    mp: mpRate,
                    usd: mktRates.usd || 0.0078,
                    eur: mktRates.eur || 0.0072,
                    gbp: mktRates.gbp || 0.0062
                });
            } catch (error) {
                console.error("Failed to fetch rates, using fallbacks", error);
            } finally {
                setLoading(false);
            }
        }
        fetchRates();
    }, []);

    const calculateConversion = (val: string, fromId: string, toId: string) => {
        if (!val || isNaN(parseFloat(val))) {
            setOutputValue('0.00');
            return;
        }

        const from = currencies.find(c => c.id === fromId)!;
        const to = currencies.find(c => c.id === toId)!;

        const valueInKes = parseFloat(val) * from.toKes;
        const result = valueInKes / to.toKes;
        setOutputValue(result.toFixed(to.precision));
    };

    useEffect(() => {
        calculateConversion(inputValue, fromCurrency, toCurrency);
    }, [inputValue, fromCurrency, toCurrency, currencies]);

    const swapCurrencies = () => {
        const oldFrom = fromCurrency;
        setFromCurrency(toCurrency);
        setToCurrency(oldFrom);
        // If we have a value, recalculate but keep the current input as the new base
    };

    const reset = () => {
        setInputValue('');
        setOutputValue('0.00');
    };

    if (loading) {
        return (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Synchronizing world rates...</p>
            </div>
        );
    }

    const currentFrom = currencies.find(c => c.id === fromCurrency)!;
    const currentTo = currencies.find(c => c.id === toCurrency)!;

    return (
        <div className="pb-20 animate-fade-in space-y-12 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <Calculator className="w-6 h-6" />
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tight">Currency <span className="text-indigo-400 italic">Core</span></h1>
                    </div>
                    <p className="text-slate-400 font-medium italic">Pair-based conversion engine. Live Market & Protocol syncing.</p>
                </div>

                <button
                    onClick={reset}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-black hover:bg-white/10 transition-all uppercase tracking-widest group"
                >
                    <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                    Reset
                </button>
            </div>

            {/* Conversion Hub */}
            <div className="glass-dark rounded-[3rem] border border-white/5 p-8 md:p-12 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] rotate-12 pointer-events-none">
                    <ArrowRightLeft className="w-64 h-64 text-white" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] items-center gap-8 relative z-10">

                    {/* From Currency */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">From</label>
                            <span className={`text-[10px] font-black uppercase tracking-widest text-${currentFrom.color}-400`}>Source Node</span>
                        </div>
                        <div className="relative group">
                            <select
                                value={fromCurrency}
                                onChange={(e) => setFromCurrency(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-10 text-white font-bold appearance-none focus:border-indigo-500/50 outline-none transition-all cursor-pointer shadow-xl capitalize h-16"
                            >
                                {currencies.map(c => (
                                    <option key={c.id} value={c.id} className="bg-slate-900 text-white capitalize">{c.label}</option>
                                ))}
                            </select>
                            <div className={`absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-${currentFrom.color}-500/10 flex items-center justify-center text-${currentFrom.color}-400`}>
                                <currentFrom.icon className={`w-4 h-4 ${fromCurrency === 'mp' ? 'fill-current' : ''}`} />
                            </div>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        </div>
                        <div className="relative">
                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-600">{currentFrom.symbol}</span>
                            <input
                                type="number"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                className={`w-full bg-white/5 border border-white/10 rounded-3xl py-8 pl-16 pr-8 text-4xl font-black text-white focus:border-${currentFrom.color}-500/50 outline-none transition-all placeholder:text-slate-800`}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {/* Interaction Bridge */}
                    <div className="flex flex-col items-center gap-4">
                        <button
                            onClick={swapCurrencies}
                            className="w-16 h-16 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:scale-110 active:scale-95 transition-all group"
                        >
                            <ArrowRightLeft className="w-6 h-6 group-hover:rotate-180 transition-transform duration-500" />
                        </button>
                    </div>

                    {/* To Currency */}
                    <div className="space-y-4 text-right">
                        <div className="flex items-center justify-between px-2">
                            <span className={`text-[10px] font-black uppercase tracking-widest text-${currentTo.color}-400`}>Target Node</span>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">To</label>
                        </div>
                        <div className="relative group text-left">
                            <select
                                value={toCurrency}
                                onChange={(e) => setToCurrency(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-10 text-white font-bold appearance-none focus:border-indigo-500/50 outline-none transition-all cursor-pointer shadow-xl capitalize h-16"
                            >
                                {currencies.map(c => (
                                    <option key={c.id} value={c.id} className="bg-slate-900 text-white capitalize">{c.label}</option>
                                ))}
                            </select>
                            <div className={`absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-${currentTo.color}-500/10 flex items-center justify-center text-${currentTo.color}-400`}>
                                <currentTo.icon className={`w-4 h-4 ${toCurrency === 'mp' ? 'fill-current' : ''}`} />
                            </div>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        </div>
                        <div className="relative overflow-hidden bg-white/[0.03] border border-white/5 rounded-3xl p-8 flex items-center justify-center min-h-[104px]">
                            <div className={`absolute left-0 top-0 w-1 h-full bg-${currentTo.color}-500/50`}></div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-600">{currentTo.symbol}</span>
                                <span className="text-5xl font-black text-white tracking-tighter tabular-nums select-all">
                                    {outputValue}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Conversion Info */}
                <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-slate-500">
                        <Info className="w-4 h-4" />
                        <p className="text-xs font-medium">
                            1 {currentFrom.id.toUpperCase()} = {((1 * currentFrom.toKes) / currentTo.toKes).toFixed(currentTo.precision)} {currentTo.id.toUpperCase()}
                        </p>
                    </div>
                    <div className="px-4 py-2 rounded-lg bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Network Parity Optimal</span>
                    </div>
                </div>
            </div>

            {/* Live Rates Summary Footer */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'MallCoin (MLC)', value: `KES ${rates.mlc}`, icon: Coins, color: 'text-indigo-400' },
                    { label: 'Mall Point (MP)', value: `KES ${rates.mp}`, icon: Star, color: 'text-amber-400' },
                    { label: 'USD/KES', value: (1 / rates.usd).toFixed(2), icon: DollarSign, color: 'text-blue-400' },
                    { label: 'EUR/KES', value: (1 / rates.eur).toFixed(2), icon: Euro, color: 'text-violet-400' },
                ].map((rate, i) => (
                    <div key={i} className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-5 flex items-center justify-between">
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{rate.label}</p>
                            <p className="text-lg font-black text-white">{rate.value}</p>
                        </div>
                        <rate.icon className={`w-5 h-5 ${rate.color} ${rate.label.includes('Point') ? 'fill-current' : ''}`} />
                    </div>
                ))}
            </div>
        </div>
    );
}

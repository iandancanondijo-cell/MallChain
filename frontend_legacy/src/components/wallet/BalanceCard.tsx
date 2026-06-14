type BalanceCardProps = {
  title: string;
  amount: string;
  color?: 'green' | 'yellow' | 'blue' | 'red';
};

const colorClasses: Record<NonNullable<BalanceCardProps['color']>, string> = {
  green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  yellow: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  blue: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
  red: 'bg-rose-500/10 text-rose-300 border-rose-500/20'
};

export default function BalanceCard({ title, amount, color = 'green' }: BalanceCardProps) {
  return (
    <div className={`rounded-3xl border p-5 ${colorClasses[color]}`}>
      <p className="text-sm uppercase tracking-[0.3em] text-slate-400 mb-3">{title}</p>
      <p className="text-3xl font-black">{amount}</p>
    </div>
  );
}

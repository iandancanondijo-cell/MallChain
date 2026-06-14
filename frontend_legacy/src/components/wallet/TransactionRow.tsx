type TransactionRowProps = {
  type: 'income' | 'expense' | 'conversion';
  title: string;
  amount: string;
  meta: string;
};

const badgeClasses: Record<TransactionRowProps['type'], string> = {
  income: 'bg-emerald-500/10 text-emerald-300',
  expense: 'bg-rose-500/10 text-rose-300',
  conversion: 'bg-sky-500/10 text-sky-300'
};

export default function TransactionRow({ type, title, amount, meta }: TransactionRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 p-4">
      <div>
        <p className="text-sm text-slate-400 uppercase tracking-[0.2em]">{title}</p>
        <p className="text-sm text-slate-300">{meta}</p>
      </div>
      <div className={`rounded-full px-3 py-1 text-xs font-black ${badgeClasses[type]}`}>
        {amount}
      </div>
    </div>
  );
}

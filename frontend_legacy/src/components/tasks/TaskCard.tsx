type TaskCardProps = {
  platform: string;
  action: string;
  reward: string;
  onOpen?: () => void;
};

export default function TaskCard({ platform, action, reward, onOpen }: TaskCardProps) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-3xl border border-white/10 bg-white/5 p-4 hover:border-indigo-500/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{platform}</p>
          <p className="text-lg font-black text-white">{action}</p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">{reward}</span>
      </div>
    </button>
  );
}

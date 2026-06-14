type DiagnosticsModalProps = {
  isOpen?: boolean;
  onClose?: () => void;
  dbStatus?: string;
  bcSynced?: number;
  logs?: any[];
};

export default function DiagnosticsModal({ isOpen, onClose, dbStatus, bcSynced, logs = [] }: DiagnosticsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-3xl rounded-[2rem] bg-slate-950 p-8 border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-white">Diagnostics</h2>
            <p className="text-slate-400">Database and blockchain health snapshot.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">Close</button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <div className="rounded-3xl bg-white/5 p-5">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Database</p>
            <p className="text-lg font-black text-white">{dbStatus || 'Unknown'}</p>
          </div>
          <div className="rounded-3xl bg-white/5 p-5">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Blockchain Synced</p>
            <p className="text-lg font-black text-white">{bcSynced ?? 0}%</p>
          </div>
        </div>
        <div className="rounded-3xl bg-white/5 p-5">
          <h3 className="text-sm uppercase tracking-[0.2em] text-slate-500 mb-3">Recent Logs</h3>
          <div className="space-y-2 max-h-64 overflow-auto text-slate-300 text-sm">
            {logs.length > 0 ? logs.map((log, idx) => (
              <p key={idx}>{JSON.stringify(log)}</p>
            )) : <p className="text-slate-500">No diagnostics logs available.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

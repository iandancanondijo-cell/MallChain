type RatingFormProps = {
  taskId?: string;
  role?: string;
  onDone?: () => void;
};

export default function RatingForm({ taskId, role, onDone }: RatingFormProps) {
  return (
    <div className="rounded-3xl bg-slate-900 border border-white/10 p-6 space-y-4">
      <h3 className="text-xl font-black text-white">Rate Task Completion</h3>
      <p className="text-slate-400">Task ID: {taskId || 'unknown'}</p>
      <button
        onClick={onDone}
        className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-white font-bold"
      >
        Submit Rating
      </button>
    </div>
  );
}

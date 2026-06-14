type InventoryRowProps = {
  item: {
    title?: string;
    price?: number;
    stock?: number;
    _id?: string;
    id?: string;
  };
};

export default function InventoryRow({ item }: InventoryRowProps) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{item._id || item.id}</p>
        <p className="text-lg font-black text-white">{item.title || 'Unnamed item'}</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm text-slate-300">
        <span>Price: KES {(item.price ?? 0).toLocaleString()}</span>
        <span>Stock: {item.stock ?? 0}</span>
      </div>
    </div>
  );
}

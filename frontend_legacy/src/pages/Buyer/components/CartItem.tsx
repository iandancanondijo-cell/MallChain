interface CartProduct {
  _id?: string;
  id?: number | string;
  name: string;
  price: number;
  qty: number;
  [key: string]: any;
}

interface CartItemProps {
  item: CartProduct;
  onQty?: (id: string | number, newQty: number) => void;
  onRemove?: (id: string | number) => void;
}

export default function CartItem({ item, onQty, onRemove }: CartItemProps) {
  const it = {
    id: item.id || 1,
    name: item.name || "Sneakers",
    price: item.price || 2500,
    qty: item.qty || 1,
  };

  return (
    <div className="flex justify-between items-center border-b py-3">
      <div>
        <p className="font-medium">{it.name}</p>
        <p className="text-xs text-gray-500">KES {it.price.toLocaleString()}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onQty && onQty(it.id, Math.max(1, it.qty - 1))}
          className="px-2"
        >
          -
        </button>
        <span>{it.qty}</span>
        <button
          onClick={() => onQty && onQty(it.id, it.qty + 1)}
          className="px-2"
        >
          +
        </button>
        <button
          onClick={() => onRemove && onRemove(it.id)}
          className="ml-4 text-red-600 font-bold"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

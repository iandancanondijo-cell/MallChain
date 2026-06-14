export default function ProductCard({ product = {} }: { product?: any }) {
  const img = product.images && product.images[0];
  return (
    <div className="border rounded shadow hover:shadow-lg transition">
      {img ? (
        <img src={img} alt={product.name} className="h-40 w-full object-cover rounded-t" />
      ) : (
        <div className="h-40 w-full bg-gray-100 rounded-t flex items-center justify-center text-gray-500">No image</div>
      )}

      <div className="p-3">
        <p className="font-semibold">{product.name || 'Product'}</p>
        <p className="text-sm text-gray-500">{product.price ? `KES ${Number(product.price).toLocaleString()}` : '—'}</p>
        <p className="text-xs text-gray-400">{(product.condition || '') + (product.location ? ` • ${product.location}` : '')}</p>
      </div>
    </div>
  );
}

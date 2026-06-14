export default function ShopBadge() {
  return (
    <div className="flex items-center gap-3">
      <img src="/shop.png" alt="shop" className="w-10 h-10 rounded-full" />
      <div>
        <p className="font-semibold">Elena Fashion</p>
        <p className="text-xs text-gray-500">Westlands</p>
      </div>
    </div>
  );
}
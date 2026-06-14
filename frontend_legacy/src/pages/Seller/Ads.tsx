export default function Ads() {
  return (
    <div className="p-6 max-w-lg space-y-4">
      <h1 className="text-xl font-bold">Advertisements</h1>

      <input className="border p-2 w-full" placeholder="Product to Promote" />
      <input className="border p-2 w-full" placeholder="Budget (KES)" />

      <p className="text-sm text-gray-500">Cost: 13 KES / Week</p>

      <button className="bg-black text-white px-4 py-2 rounded">Launch Ad</button>
    </div>
  );
}


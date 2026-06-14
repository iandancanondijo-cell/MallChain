export default function ShopSetup(){
  return (
    <div className="p-6 space-y-4 max-w-xl">
      <h1 className="text-xl font-bold">Shop Setup</h1>

      <input className="border p-2 w-full" placeholder="Shop Name" />
      <input className="border p-2 w-full" placeholder="Shop Location" />

      <input type="file" className="w-full" />
      <p className="text-sm text-gray-500">Upload shop front photo (used by delivery & buyers)</p>

      <button className="bg-black text-white px-4 py-2 rounded">Save Shop</button>
    </div>
  );
}

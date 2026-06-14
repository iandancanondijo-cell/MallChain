export default function AddProduct() {
  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold mb-4">Add New Product</h2>

      <div className="space-y-3">
        <input className="border p-2 w-full" placeholder="Product Name" />
        <textarea className="border p-2 w-full" placeholder="Description" />

        <select className="border p-2 w-full">
          <option>Condition</option>
          <option>New</option>
          <option>Pre-Owned</option>
        </select>

        <input type="number" className="border p-2 w-full" placeholder="Price (KES)" />
        <input type="number" className="border p-2 w-full" placeholder="Total Units" />

        <input type="file" multiple />
        <p className="text-xs text-red-600">Minimum 3 images required</p>

        <button className="bg-black text-white px-4 py-2 rounded">
          Publish Product
        </button>
      </div>
    </div>
  );
}

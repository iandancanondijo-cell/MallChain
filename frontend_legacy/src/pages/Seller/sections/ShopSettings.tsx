export default function ShopSettings() {
  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-xl font-bold">Shop Settings</h2>

      <input type="file" />
      <input type="file" />
      <p className="text-xs">Upload shop front & KYC documents</p>

      <button className="bg-black text-white px-4 py-2 rounded">
        Save Changes
      </button>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-xl font-bold">Settings</h2>

      <input type="file" className="block" />
      <input type="file" className="block" />
      <button className="bg-black text-white px-4 py-2 rounded">
        Upload KYC
      </button>
    </div>
  );
}

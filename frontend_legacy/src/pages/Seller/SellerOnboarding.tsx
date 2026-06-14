import { useNavigate } from "react-router-dom";

export default function SellerOnboarding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-2xl font-bold mb-4">Create Your Shop</h1>

      <div className="space-y-4 max-w-md">
        <input className="border p-2 w-full" placeholder="Shop Name" />
        <input type="file" multiple />
        <textarea className="border p-2 w-full" placeholder="Shop Description" />

        <label className="flex gap-2 items-center">
          <input type="checkbox" />
          <span>I agree to marketplace policies</span>
        </label>

        <button
          onClick={() => navigate("/seller/dashboard")}
          className="bg-black text-white px-4 py-2 rounded"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export default function SellerRegister(){
  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Register as Seller</h1>

      <input className="w-full p-2 border rounded" placeholder="First Name" />
      <input className="w-full p-2 border rounded" placeholder="Last Name" />
      <input className="w-full p-2 border rounded" placeholder="Phone Number" />
      <input className="w-full p-2 border rounded" placeholder="Email" />

      <label className="flex gap-2 text-sm">
        <input type="checkbox" />
        I agree to marketplace policies
      </label>

      <button className="w-full bg-black text-white py-2 rounded">Continue</button>
    </div>
  );
}

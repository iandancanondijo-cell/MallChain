

export default function DeliveryRegister() {
  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Register as Delivery Personnel</h1>

      <input className="w-full p-2 border rounded" placeholder="Full Name" />
      <input className="w-full p-2 border rounded" placeholder="Phone Number" />
      <input className="w-full p-2 border rounded" placeholder="National ID" />

      <input type="file" className="w-full" />
      <p className="text-sm text-gray-500">Upload ID & profile photo</p>

      <button className="w-full bg-black text-white py-2 rounded">Complete Registration</button>
    </div>
  );
}

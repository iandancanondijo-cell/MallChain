export default function Shops() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">My Shops</h2>

      <div className="bg-white p-4 rounded shadow mb-4">
        <p>Elena Fashion</p>
        <p>Rent: KES 150 / month</p>
        <p>Status: Active</p>
      </div>

      <button className="bg-black text-white px-4 py-2 rounded">
        Create New Shop
      </button>
    </div>
  );
}

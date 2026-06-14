export default function Inventory() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Inventory</h2>

      <table className="w-full bg-white rounded shadow">
        <thead>
          <tr className="border-b">
            <th className="p-2">Product</th>
            <th>Initial</th>
            <th>Remaining</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-center">
            <td className="p-2">Shoes</td>
            <td>100</td>
            <td>45</td>
            <td className="text-green-600">Active</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

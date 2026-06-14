import InventoryRow from '../../components/seller/InventoryRow';

export default function Inventory() {
  const items: any[] = [];
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Inventory</h1>
      {items.length === 0 ? (
        <div className="text-gray-500">No inventory items</div>
      ) : items.map(it => <InventoryRow key={it._id || it.id} item={it} />)}
    </div>
  );
}

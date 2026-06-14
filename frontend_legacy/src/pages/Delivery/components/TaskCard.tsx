import type { DeliveryTask } from "../../../types";

export default function TaskCard({ task, onOpen }: { task: DeliveryTask; onOpen?: any }) {
  return (
    <div className="bg-white p-4 rounded shadow mb-3 border-l-4 border-black">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-lg">Order #{task.orderId?.slice(-6) || 'Unknown'}</p>
          <p className="text-sm text-gray-500 mb-2">Earnings: KES {task.fee || 0}</p>
        </div>
        <span className={`px-2 py-1 text-xs rounded ${task.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
          {task.status}
        </span>
      </div>

      <p>Pickup: <span className="font-medium">{task.pickupLocation?.address || 'Unknown'}</span></p>
      <p>Drop-off: <span className="font-medium">{task.dropoffLocation?.address || task.deliveryLocation?.address || 'Unknown'}</span></p>

      <div className="flex gap-2 mt-3 block">
        <button className="bg-black text-white px-3 py-1 rounded w-full" onClick={() => onOpen(task)}>
          View Details
        </button>
      </div>
    </div>
  );
}

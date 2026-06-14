export default function TaskDetail({ task, onPickup, onComplete }: { task: any, onPickup: any, onComplete: any }) {
  if (!task) return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Delivery Task</h2>
      <div className="p-4 text-sm text-gray-500">No task data available.</div>
      <div className="h-64 bg-gray-100 flex items-center justify-center rounded">Map integration not enabled</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Delivery Task</h2>

      <div className="bg-white p-4 rounded shadow space-y-2">
        <p><strong>Pickup:</strong> {task.pickup || '—'}</p>
        <p><strong>Buyer:</strong> {task.buyerName || task.customer || '—'}</p>
        <p><strong>Distance:</strong> {task.distance || '—'}</p>
        <p><strong>Expected Time:</strong> {task.eta || task.estimated || '—'}</p>
      </div>

      <div className="h-64 bg-gray-100 flex items-center justify-center rounded">Map integration not enabled</div>

      <div className="flex gap-4">
        <button onClick={() => onPickup && onPickup(task)} className="bg-yellow-500 text-white px-4 py-2 rounded">Picked Up</button>
        <button onClick={() => onComplete && onComplete(task)} className="bg-green-600 text-white px-4 py-2 rounded">Complete Delivery</button>
      </div>
    </div>
  );
}

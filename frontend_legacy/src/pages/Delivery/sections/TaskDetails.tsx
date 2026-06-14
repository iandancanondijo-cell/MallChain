export default function TaskDetails({ task }: { task: any }) {
  if (!task) return (
    <div>
      <h2 className="text-xl font-bold mb-4">Task Details</h2>
      <div className="p-4 text-sm text-gray-500">Task details are not loaded.</div>
      <div className="h-64 bg-gray-100 rounded" />
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Task Details</h2>

      <div className="bg-white p-4 rounded shadow">
        <p>Order #{task.orderId || task.id || '—'}</p>
        <p>Pickup: {task.pickup || '—'}</p>
        <p>Drop-off: {task.dropoff || '—'}</p>
        <p>Estimated: {task.eta || '—'}</p>
      </div>

      <div className="h-64 bg-gray-100 rounded" />
    </div>
  );
}

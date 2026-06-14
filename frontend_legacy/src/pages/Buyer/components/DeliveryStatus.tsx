type OrderStatus = "Pending" | "On the way" | "Delivered" | "Cancelled";

interface DeliveryStatusProps {
  order?: string;
  status?: OrderStatus;
}

export default function DeliveryStatus({
  order = "#0000",
  status = "Pending",
}: DeliveryStatusProps) {
  return (
    <div className="border p-4 rounded bg-white">
      <p className="font-semibold">Order {order}</p>
      <p className="text-sm text-gray-700">Status: {status}</p>
    </div>
  );
}

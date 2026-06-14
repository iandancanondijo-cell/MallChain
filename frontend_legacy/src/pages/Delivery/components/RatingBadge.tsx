export default function RatingBadge({ rating = 5 }) {
  return (
    <div className="inline-flex items-center gap-2 bg-white px-2 py-1 rounded shadow-sm">
      <span className="font-semibold">{rating}</span>
      <span className="text-yellow-500">★</span>
    </div>
  );
}

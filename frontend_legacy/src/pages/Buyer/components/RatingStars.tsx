export default function RatingStars({ rating = 5 }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <div className="flex items-center gap-1 text-yellow-500">
      {Array.from({length: full}).map((_,i)=>(<span key={i}>★</span>))}
      {half && <span>☆</span>}
      <span className="text-sm text-gray-600 ml-2">{rating}</span>
    </div>
  );
}
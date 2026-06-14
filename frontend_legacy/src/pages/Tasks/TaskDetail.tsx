export default function TaskDetail() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Task Details</h1>

      <p>Platform: TikTok</p>
      <p>Action: View Video</p>
      <p>Reward: 0.08 MallPoints</p>

      <a href="#" className="text-blue-600 underline" target="_blank">Open Task Link</a>

      <button className="bg-black text-white w-full py-2 rounded">Submit Proof</button>
    </div>
  );
}

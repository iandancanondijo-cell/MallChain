export default function BuyerHeader() {
  return (
    <header className="bg-white shadow p-4 flex justify-between items-center">
      <h1 className="font-semibold">Welcome back 👋 Ready to shop?</h1>

      <div className="text-sm font-bold">
        MallCoin: <span className="text-green-600">KES 0.62</span>
      </div>
    </header>
  );
}

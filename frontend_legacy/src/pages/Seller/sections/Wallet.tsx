export default function Wallet() {
  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-xl font-bold">Wallet</h2>

      <div className="bg-white p-4 rounded shadow">
        <p>MallMoney: KES 88,300</p>
        <p>MallCoins: 1.42</p>
      </div>

      <div className="flex gap-2">
        <button className="bg-black text-white px-4 py-2 rounded">
          Deposit
        </button>
        <button className="bg-gray-800 text-white px-4 py-2 rounded">
          Withdraw
        </button>
        <button className="bg-yellow-500 px-4 py-2 rounded">
          Buy MallCoins
        </button>
      </div>
    </div>
  );
}

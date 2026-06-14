
import { useState } from "react";
import Overview from "./sections/Overview";
import Deposit from "./sections/Deposit";
import Withdraw from "./sections/Withdraw";
import Transfer from "./sections/Transfer";
import BuyMallCoins from "./sections/BuyMallCoins";
import Convert from "./sections/Convert";
import Transactions from "./sections/Transactions";

export default function WalletDashboard() {
  const [active, setActive] = useState("overview");

  const render = () => {
    switch (active) {
      case "deposit": return <Deposit />;
      case "withdraw": return <Withdraw />;
      case "transfer": return <Transfer />;
      case "buy": return <BuyMallCoins />;
      case "convert": return <Convert />;
      case "transactions": return <Transactions />;
      default: return <Overview />;
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <nav className="flex gap-3 mb-6 flex-wrap">
        {["overview", "deposit", "withdraw", "transfer", "buy", "convert", "transactions"].map(i => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`px-4 py-2 rounded ${active === i ? "bg-black text-white" : "bg-gray-200"}`}
          >
            {i.toUpperCase()}
          </button>
        ))}
      </nav>

      {render()}
    </div>
  );
}
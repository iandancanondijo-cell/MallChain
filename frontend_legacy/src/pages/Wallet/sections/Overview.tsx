import BalanceCard from "@/components/wallet/BalanceCard";
import { useState } from "react";
import QRCodeScanner from "@/components/QRCodeScanner";

export default function Overview() {
  const [scannerOpen, setScannerOpen] = useState(false);

  function handleScan(data: string | null) {
    setScannerOpen(false);
    if (!data) return;
    try { navigator.clipboard.writeText(data); alert('Scanned data copied to clipboard'); } catch (e: any) { alert('Scanned: ' + data); }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setScannerOpen(true)} className="px-3 py-2 bg-gray-200 rounded">Scan QR</button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <BalanceCard title="KES Balance" amount="KES 54,300" color="green" />
        <BalanceCard title="MallCoins" amount="1.240 MLCN" color="yellow" />
        <BalanceCard title="Grow Wallet" amount="KES 12,000" color="blue" />
      </div>

      {scannerOpen && <QRCodeScanner onResult={handleScan} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}
import { useState } from "react";
import { buyMallCoins, downloadReceipt } from "../../../api";
import type { ApiError } from '../../../types';

export default function BuyMallCoins() {
  const [kes, setKes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleBuy() {
    if (!kes || Number(kes) <= 0) return alert('Enter KES amount');
    setLoading(true);
    try {
      const result = await buyMallCoins({ amountKES: Number(kes) });
      alert(result.message || 'Purchase initiated');
      // if backend returned transaction id, offer to download receipt
      if (result.txId) {
        const dl = confirm('Download receipt?');
        if (dl) {
          // Use API to download receipt securely
          const blob = await downloadReceipt(result.txId);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `receipt-${result.txId}.pdf`;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      const error = err as ApiError;
      alert(error.message || 'Buy failed');
    }
    setLoading(false);
  }

  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-xl font-bold">Buy MallCoins</h2>

      <p>Live Price: 1 MLCN = KES 32</p>

      <input value={kes} onChange={e => setKes(e.target.value)} placeholder="KES Amount" className="w-full p-2 border rounded" />

      <button className="w-full bg-black text-white py-2 rounded" onClick={handleBuy} disabled={loading}>{loading ? 'Processing...' : 'Buy MallCoins'}</button>
    </div>
  );
}
import { useState } from "react";
import QRCodeScanner from "../../../../src/components/QRCodeScanner";
import { sendMoney } from "../../../api";
import type { ApiError } from '../../../types';

export default function Transfer() {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("MallMoney");
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-xl font-bold">Send Money</h2>
      <input value={to} onChange={e => setTo(e.target.value)} placeholder="Username / Phone" className="w-full p-2 border rounded" />
      <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" className="w-full p-2 border rounded" />

      <select value={type} onChange={e => setType(e.target.value)} className="w-full p-2 border rounded">
        <option>KES Balance</option>
        <option>MallCoins</option>
      </select>

      <div className="flex gap-2">
        <button type="button" onClick={() => setScannerOpen(true)} className="px-3 py-2 bg-gray-200 rounded">Scan QR</button>
        <button className="flex-1 bg-black text-white py-2 rounded" onClick={async () => {
          if (!to || !amount) return alert('Recipient and amount required');
          if (Number(amount) <= 0) return alert('Amount must be greater than zero');
          try {
            await sendMoney({ toUserId: to, amount: Number(amount), type: type.toLowerCase() as 'mallmoney' | 'mallcoins' });
            alert('Transfer sent');
          } catch (e) {
            const err = e as ApiError;
            alert(err.message || 'Transfer failed');
          }
        }}>Send</button>
      </div>

      {scannerOpen && (
        <QRCodeScanner onResult={(data: string | null) => { setScannerOpen(false); if (data) setTo(data); }} onClose={() => setScannerOpen(false)} />
      )}
    </div>
  );
}
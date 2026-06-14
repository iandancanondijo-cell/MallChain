import { useState } from "react";
import { deposit } from "../../../api";
import type { ApiError } from '../../../types';

export default function Deposit() {
  const [amount, setAmount] = useState("");
  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-xl font-bold">Deposit Funds</h2>

      <input
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="Amount"
        className="w-full p-2 border rounded"
        type="number"
        min="1"
      />

      <select className="w-full p-2 border rounded">
        <option>M-Pesa</option>
        <option>Card</option>
        <option>Bank</option>
      </select>

      <button className="w-full bg-black text-white py-2 rounded" onClick={async () => {
        if (!amount || Number(amount) <= 0) return alert('Enter a valid amount');
        try {
          await deposit({ amount: Number(amount) });
          alert('Deposit initiated');
        } catch (e) {
          const err = e as ApiError;
          alert(err.message || 'Deposit failed');
        }
      }}>
        Deposit
      </button>
    </div>
  );
}
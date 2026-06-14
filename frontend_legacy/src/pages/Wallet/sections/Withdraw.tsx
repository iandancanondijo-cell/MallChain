import { useState } from "react";
import { withdraw } from "../../../api";
import type { ApiError } from '../../../types';

export default function Withdraw() {
  const [amount, setAmount] = useState("");
  const [dest, setDest] = useState("");
  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-xl font-bold">Withdraw</h2>

      <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" className="w-full p-2 border rounded" type="number" min="1" />
      <input value={dest} onChange={e => setDest(e.target.value)} placeholder="Phone / Bank" className="w-full p-2 border rounded" />

      <button className="w-full bg-black text-white py-2 rounded" onClick={async () => {
        if (!amount || Number(amount) <= 0) return alert('Enter a valid amount');
        if (!dest) return alert('Enter a destination phone or bank');
        try {
          await withdraw({ amount: Number(amount), dest } as any); // Type definition might need checking for optional dest
          alert('Withdraw initiated');
        } catch (e: any) {
          const err = e as ApiError;
          alert(err.message || 'Withdraw failed');
        }
      }}>
        Withdraw
      </button>
    </div>
  );
}
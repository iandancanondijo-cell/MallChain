import { useState } from "react";
import { convert } from "../../../api";
import type { ApiError } from '../../../types';

type ConvertMsg = { error?: string; ok?: string } | null;

export default function Convert() {
  const [mode, setMode] = useState("toCoins");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<ConvertMsg>(null);

  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-xl font-bold">Convert</h2>

      <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full p-2 border rounded">
        <option value="toCoins">KES Balance → MallCoins</option>
        <option value="toFiat">MallCoins → KES Balance</option>
      </select>

      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-full p-2 border rounded" />

      <button className="w-full bg-black text-white py-2 rounded" onClick={async () => {
        setMsg(null);
        try {
          const apiMode = mode === 'toCoins' ? 'points-to-coins' : 'coins-to-money';
          await convert({ mode: apiMode, amount: Number(amount) });
          setMsg({ ok: 'Convert request submitted' });
        } catch (e) {
          const err = e as ApiError;
          setMsg({ error: err.message || 'Convert failed' });
        }
      }}>
        Convert
      </button>
      {msg && <div className="text-sm mt-2">{msg.error ? <span className="text-red-600">{msg.error}</span> : <span className="text-green-600">{msg.ok}</span>}</div>}
    </div>
  );
}
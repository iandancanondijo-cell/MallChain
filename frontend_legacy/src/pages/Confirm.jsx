import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { walletFromMnemonic } from "../crypto/wallet";

export default function Confirm() {
  const loc = useLocation();
  const nav = useNavigate();
  const mnemonic = (loc.state && loc.state.mnemonic) || "";
  const [input, setInput] = useState("");

  async function finish() {
    if (!mnemonic) return alert("No mnemonic provided");
    if (input.trim() !== mnemonic.trim()) return alert("Phrases do not match. Paste exact phrase.");
    try {
      const wallet = await walletFromMnemonic(mnemonic);
      sessionStorage.setItem("wallet", JSON.stringify(wallet));
      nav("/dashboard");
    } catch (err) {
      console.error(err);
      alert("Failed to create wallet");
    }
  }

  return (
    <div className="app-center">
      <div className="card">
        <div className="left">
          <h2>Confirm Recovery Phrase</h2>
          <p className="sub">Paste the full recovery phrase to confirm you saved it.</p>

          <textarea value={input} onChange={(e) => setInput(e.target.value)} />

          <button className="primary" onClick={finish}>Confirm & Continue</button>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { useState } from "react";
import { walletFromMnemonic } from "../crypto/wallet";
import { useNavigate } from "react-router-dom";

export default function RestoreWallet() {
  const [mnemonic, setMnemonic] = useState("");
  const nav = useNavigate();

  async function restore() {
    try {
      const wallet = await walletFromMnemonic(mnemonic);
      sessionStorage.setItem("wallet", JSON.stringify(wallet));
      nav("/dashboard");
    } catch (err) {
      console.error(err);
      alert("Failed to restore wallet. Check your mnemonic.");
    }
  }

  return (
    <div className="app-center">
      <div className="card">

        <div className="left">
          <h2>Restore Wallet</h2>
          <p className="sub">Paste your recovery phrase</p>

          <textarea onChange={(e) => setMnemonic(e.target.value)} />

          <button className="primary" onClick={restore}>
            Restore
          </button>
        </div>

      </div>
    </div>
  );
}

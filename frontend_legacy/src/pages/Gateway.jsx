import React from "react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Gateway() {
  const [mode, setMode] = useState("create");
  const nav = useNavigate();

  return (
    <div className="app-center">
      <div className="card">

        <div className="left">
          <h2>Access Your Mallchain Wallet</h2>
          <p className="sub">Create or restore your decentralized wallet</p>

          <select onChange={(e) => setMode(e.target.value)}>
            <option value="create">Create New Wallet</option>
            <option value="restore">Restore Wallet</option>
          </select>

          <button
            className="primary"
            onClick={() => nav(mode === "create" ? "/create" : "/restore")}
          >
            Continue →
          </button>

          <div className="footer-link">What is a recovery phrase?</div>
        </div>

        <div>
          <div className="social">Hardware Wallet (Coming Soon)</div>
          <div className="social">Import Private Key</div>
          <div className="social">Advanced</div>
        </div>

      </div>
    </div>
  );
}

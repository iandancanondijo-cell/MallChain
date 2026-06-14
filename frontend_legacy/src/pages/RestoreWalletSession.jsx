import React, { useState } from "react";
import { importFromMnemonic } from "../mallwallet";
import { useNavigate } from "react-router-dom";

export default function RestoreWalletSession() {
  const [mnemonic, setMnemonic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nav = useNavigate();

  async function handleRestore() {
    if (!mnemonic.trim()) {
      setError("Please enter a mnemonic phrase");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const address = await importFromMnemonic(mnemonic.trim(), "", "mall");
      if (address) {
        console.log(`✅ Wallet restored: ${address}`);
        nav("/dashboard");
      } else {
        setError("Invalid mnemonic. Please check and try again.");
      }
    } catch (err) {
      console.error("Restore error:", err);
      setError("Failed to restore wallet. Check your recovery phrase.");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg, rgb(16, 21, 28) 60%, rgb(35, 43, 56) 100%)', padding: 0 }}>
      <div style={{ maxWidth: 480, margin: '64px auto', fontFamily: 'Inter, system-ui', padding: 32, background: 'rgb(16, 21, 28)', borderRadius: 18, boxShadow: 'rgba(0, 0, 0, 0.133) 0px 2px 16px' }}>
        <h2 style={{ marginBottom: 10, fontWeight: 700, fontSize: 26, color: 'rgb(163, 230, 53)', letterSpacing: '-1px' }}>Restore Wallet</h2>
        <p style={{ color: 'rgb(255, 255, 255)', opacity: 0.8, marginBottom: 18, fontSize: 16 }}>Enter your 12 or 24-word recovery phrase to restore your wallet.</p>
        <textarea 
          value={mnemonic} 
          onChange={e => {
            setMnemonic(e.target.value);
            setError("");
          }} 
          placeholder="Enter your recovery phrase (space or line separated)" 
          style={{ width: '100%', minHeight: 100, padding: '12px 14px', borderRadius: 10, border: '1.5px solid ' + (error ? '#f87171' : 'rgb(35, 43, 56)'), background: 'rgb(24, 31, 41)', color: 'rgb(255, 255, 255)', fontSize: 14, marginBottom: 18, fontFamily: 'monospace', resize: 'vertical' }} 
        />
        {error && (
          <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '12px 14px', borderRadius: 10, marginBottom: 18, fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}
        <button 
          onClick={handleRestore}
          disabled={loading}
          style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: loading ? '#888' : 'linear-gradient(90deg, rgb(163, 230, 53), rgb(101, 163, 13))', color: 'rgb(24, 31, 41)', fontWeight: 700, fontSize: 17, marginBottom: 18, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Restoring...' : 'Restore Wallet'}
        </button>
        <p style={{ marginTop: 10, fontSize: 12, color: '#888', textAlign: 'center' }}>
          💡 Tip: Enter words separated by spaces or line breaks
        </p>
      </div>
    </div>
  );
}

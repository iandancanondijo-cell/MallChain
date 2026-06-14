import React, { useState } from "react";
import { generateMnemonic, walletFromMnemonic } from "../crypto/wallet";
import { useNavigate } from "react-router-dom";

export default function CreateWalletSession() {
  const [mnemonic, setMnemonic] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const nav = useNavigate();

  function handleGenerate() {
    generateMnemonic().then(setMnemonic);
    setConfirmed(false);
  }

  async function handleCreate() {
    if (!mnemonic) return alert("Generate a recovery phrase first.");
    if (input.trim() !== mnemonic.trim()) return alert("Phrases do not match. Paste exact phrase.");
    try {
      const wallet = await walletFromMnemonic(mnemonic);
      sessionStorage.setItem("wallet", JSON.stringify(wallet));
      nav("/dashboard");
    } catch (err) {
      alert("Failed to create wallet.");
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg, rgb(16, 21, 28) 60%, rgb(35, 43, 56) 100%)', padding: 0 }}>
      <div style={{ maxWidth: 480, margin: '64px auto', fontFamily: 'Inter, system-ui', padding: 32, background: 'rgb(16, 21, 28)', borderRadius: 18, boxShadow: 'rgba(0, 0, 0, 0.133) 0px 2px 16px' }}>
        <h2 style={{ marginBottom: 10, fontWeight: 700, fontSize: 26, color: 'rgb(163, 230, 53)', letterSpacing: '-1px' }}>Create New Wallet</h2>
        <p style={{ color: 'rgb(255, 255, 255)', opacity: 0.8, marginBottom: 18, fontSize: 16 }}>Generate and confirm your recovery phrase to create your wallet.</p>
        <button onClick={handleGenerate} style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(90deg, rgb(163, 230, 53), rgb(101, 163, 13))', color: 'rgb(24, 31, 41)', fontWeight: 700, fontSize: 17, marginBottom: 18, cursor: 'pointer' }}>Generate Recovery Phrase</button>
        {mnemonic && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              marginBottom: '18px',
            }}>
              {mnemonic.split(' ').map((word, idx) => (
                <div key={idx} style={{
                  background: 'rgb(24, 31, 41)',
                  color: 'rgb(255, 255, 255)',
                  borderRadius: '8px',
                  border: '1.5px solid rgb(35, 43, 56)',
                  fontSize: '16px',
                  fontFamily: 'Inter, system-ui',
                  padding: '8px 10px',
                  textAlign: 'center',
                  fontWeight: 600,
                }}>
                  <span style={{ color: 'rgb(163, 230, 53)', fontWeight: 700, marginRight: 4 }}>{idx + 1}.</span> {word}
                </div>
              ))}
            </div>
            <div style={{ color: 'rgb(163, 230, 53)', fontWeight: 600, fontSize: 15, marginBottom: 18 }}>Click below to confirm you have saved your recovery phrase.</div>
            <button
              onClick={() => nav('/confirm', { state: { mnemonic } })}
              style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(90deg, rgb(163, 230, 53), rgb(101, 163, 13))', color: 'rgb(24, 31, 41)', fontWeight: 700, fontSize: 17, marginBottom: 18, cursor: 'pointer' }}
            >
              I have saved my recovery phrase
            </button>
          </>
        )}
      </div>
    </div>
  );
}

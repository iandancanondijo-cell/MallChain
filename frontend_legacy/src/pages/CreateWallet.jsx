import React from "react";
import { useEffect, useState } from "react";
import { generateMnemonic } from "../crypto/wallet";
import { useNavigate } from "react-router-dom";

export default function CreateWallet() {
  const [mnemonic, setMnemonic] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function gen() {
    setLoading(true);
    try {
      const m = await generateMnemonic();
      setMnemonic(m);
    } catch (err) {
      console.error(err);
      alert("Failed to generate mnemonic: " + (err && err.message));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    gen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-center">
      <div className="card">

        <div className="left">
          <h2>Save Your Recovery Phrase</h2>
          <p className="sub">Write these 24 words down safely</p>

          {loading ? (
            <div style={{ marginTop: 18 }}>Generating recovery phrase…</div>
          ) : mnemonic ? (
            <div className="mnemonic">
              {mnemonic.split(" ").map((w, i) => (
                <div key={i} className="word">{i + 1}. {w}</div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 18 }}>
              <button className="primary" onClick={gen}>Generate</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            <button
              className="primary"
              disabled={!mnemonic}
              onClick={() => nav("/confirm", { state: { mnemonic } })}
            >
              I Saved It
            </button>

            <button
              onClick={() => {
                if (!mnemonic) return;
                try { navigator.clipboard && navigator.clipboard.writeText(mnemonic); alert('Mnemonic copied'); }
                catch (e) { console.error(e); }
              }}
              disabled={!mnemonic}
              style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)', background: '#061018', color: '#9fe' }}
            >
              Copy
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

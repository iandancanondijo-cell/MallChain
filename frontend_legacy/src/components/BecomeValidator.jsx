import React, { useState } from 'react';
import axios from 'axios';

export default function BecomeValidator({ address, onAction }) {
  const [pubkey, setPubkey] = useState('');
  const [amount, setAmount] = useState('');
  const [denom, setDenom] = useState('mlc');
  const [moniker, setMoniker] = useState('');
  const [website, setWebsite] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleCreateValidator() {
    setLoading(true);
    setResult(null);
    try {
      const res = await axios.post('/api/validators/create', {
        delegator: address,
        pubkey,
        amount,
        denom,
        moniker,
        website,
        details
      }, { headers: { Authorization: 'Bearer ' + (localStorage.getItem('jwt') || 'testtoken') } });
      setResult(res.data);
      if (onAction) onAction();
    } catch (e) {
      setResult({ error: e.response?.data?.error || e.message });
    }
    setLoading(false);
  }

  return (
    <div style={{ marginTop: 24, background: '#232b38', borderRadius: 14, padding: 22, boxShadow: '0 2px 12px #0003' }}>
      <div style={{ color: '#a3e635', fontWeight: 700, fontSize: 18, marginBottom: 10 }}>Become a Validator</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <input value={pubkey} onChange={e => setPubkey(e.target.value)} placeholder="Validator public key" style={{ flex: 2 }} />
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Self-delegation amount" style={{ flex: 1 }} />
        <input value={denom} onChange={e => setDenom(e.target.value)} placeholder="Denom" style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <input value={moniker} onChange={e => setMoniker(e.target.value)} placeholder="Moniker (name)" style={{ flex: 1 }} />
        <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="Website (optional)" style={{ flex: 1 }} />
      </div>
      <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Details (optional)" style={{ width: '100%', marginBottom: 8 }} />
      <button onClick={handleCreateValidator} disabled={loading} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#a3e635,#65a30d)', color: '#181f29', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Create Validator</button>
      {loading && <div style={{ color: '#a3e635', marginTop: 8 }}>Processing...</div>}
      {result && <div style={{ color: result.error ? 'red' : '#a3e635', marginTop: 8, fontSize: 14 }}>{result.error ? result.error : 'Success!'}</div>}
    </div>
  );
}

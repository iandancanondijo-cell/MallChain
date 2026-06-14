import React, { useState } from 'react';
import axios from 'axios';

export default function RewardsActions({ address, onAction }) {
  const [validator, setValidator] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const commonHeaders = { Authorization: 'Bearer ' + (localStorage.getItem('jwt') || 'testtoken') };

  function validate() {
    if (!address) return 'Connect a wallet first.';
    if (!validator.trim()) return 'Validator address is required.';
    return '';
  }

  async function handleClaim() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await axios.post('/api/rewards/claim', {
        delegator: address,
        validator: validator.trim()
      }, { headers: commonHeaders });
      setResult(res.data);
      if (onAction) onAction();
    } catch (e) {
      setResult({ error: e.response?.data?.error || e.message });
    }
    setLoading(false);
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <input value={validator} onChange={e => setValidator(e.target.value)} placeholder="Validator address" style={{ flex: 2, padding: '10px 12px', borderRadius: 8, border: '1px solid #1f2a38', background: '#0f1624', color: '#e5f4ff' }} />
      </div>
      <button onClick={handleClaim} disabled={loading} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#a3e635,#65a30d)', color: '#181f29', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 2px 8px #a3e63544' }}>
        {loading ? 'Processing…' : 'Claim Rewards'}
      </button>
      {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>}
      {result && <div style={{ color: result.error ? '#f87171' : '#c7f36b', fontSize: 13 }}>{result.error ? result.error : 'Success!'}</div>}
    </div>
  );
}

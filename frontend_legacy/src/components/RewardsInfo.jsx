import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function RewardsInfo({ address }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    setError('');
    axios.get(`${base}/api/rewards/info/${address}`)
      .then(res => setInfo(res.data || null))
      .catch(err => {
        console.error('Rewards info fetch error:', err.message);
        setInfo(null);
        setError('Unable to load rewards right now.');
      })
      .finally(() => setLoading(false));
  }, [address, base]);

  if (!address) return <div style={{ color: '#9ba7bc', fontSize: 13 }}>Connect a wallet to view rewards.</div>;

  if (loading) {
    return <div style={{ color: '#a3e635', fontSize: 14 }}>Loading rewards…</div>;
  }

  if (error) {
    return <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>;
  }

  if (!info) {
    return <div style={{ color: '#fff', opacity: 0.7, fontSize: 14 }}>No rewards available.</div>;
  }

  const totalRewards = Array.isArray(info.total) ? info.total : [];
  const totalAmount = totalRewards.reduce((sum, r) => {
    const amt = Number(r?.amount || 0);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);

  return (
    <div style={{ color: '#fff', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#101620', border: '1px solid #1f2a38', borderRadius: 10, padding: '10px 12px' }}>
        <div>
          <div style={{ color: '#8fb3ff', fontSize: 12, fontWeight: 600 }}>Reward Entries</div>
          <div style={{ fontWeight: 700 }}>{(info.rewards || []).length}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#8fb3ff', fontSize: 12, fontWeight: 600 }}>Total (raw)</div>
          <div style={{ fontWeight: 700 }}>{totalAmount}</div>
        </div>
      </div>
      <div style={{ background: '#181f29', borderRadius: 10, padding: 10, border: '1px solid #1f2a38', maxHeight: 220, overflow: 'auto' }}>
        <pre style={{ margin: 0, color: '#c7f36b', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(info, null, 2)}</pre>
      </div>
    </div>
  );
}

import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

export default function InviteClaim() {
  const nav = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteId = params.get('inviteId');
    if (!inviteId) return nav('/');
    // Claim invite in backend
    axios.post('/api/invite/claim', { inviteId })
      .then(() => {
        // Redirect to wallet creation
        setTimeout(() => nav('/create'), 1000);
      })
      .catch(() => {
        setTimeout(() => nav('/'), 1500);
      });
  }, [location, nav]);

  // Enhanced UI
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg,#10151c 60%,#232b38 100%)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ maxWidth: 420, margin: 'auto', fontFamily: 'Inter, system-ui', padding: 32, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002', textAlign:'center' }}>
        <h2 style={{ marginBottom: 10, fontWeight: 700, fontSize: 26, color: '#a3e635', letterSpacing: -1 }}>Claiming Invite…</h2>
        <div style={{ marginTop: 16, color:'#fff', fontSize:16, opacity:0.8 }}>You are being redirected to wallet creation.</div>
      </div>
    </div>
  );
}

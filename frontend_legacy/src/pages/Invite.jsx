import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import axios from 'axios';

export default function Invite() {
  const nav = useNavigate();
  const location = useLocation();
  const [inviteId, setInviteId] = useState('');
  const [address, setAddress] = useState('');
  const [expired, setExpired] = useState(false);
  const [rewarded, setRewarded] = useState(false);
  const [created, setCreated] = useState(false);
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  useEffect(() => {
    // Parse inviteId and address from query params
    const params = new URLSearchParams(location.search);
    const id = params.get('inviteId');
    const addr = params.get('address');
    setInviteId(id);
    setAddress(addr);
    if (!id || !addr) nav('/wallet');

    // Create invite in backend (idempotent)
    axios.post(`${base}/api/invite/create`, { inviteId: id, inviter: addr })
      .then(() => setCreated(true))
      .catch(() => setCreated(true));

    // Poll backend to check if invite is claimed
    const poll = setInterval(async () => {
      try {
        const res = await axios.get(`${base}/api/invite/status/${id}`);
        if (res.data && res.data.claimed) {
          setRewarded(true);
          setTimeout(() => nav('/wallet'), 2000);
        }
        if (res.data && res.data.expired) {
          setExpired(true);
          setTimeout(() => nav('/wallet'), 2000);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(poll);
  }, [location, nav]);

  if (!created) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg,#10151c 60%,#232b38 100%)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ maxWidth: 420, margin: 'auto', fontFamily: 'Inter, system-ui', padding: 32, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002', textAlign:'center', color:'#a3e635', fontWeight:600, fontSize:20 }}>Preparing invite…</div>
    </div>
  );
  if (expired) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg,#10151c 60%,#232b38 100%)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ maxWidth: 420, margin: 'auto', fontFamily: 'Inter, system-ui', padding: 32, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002', textAlign:'center', color:'#f87171', fontWeight:600, fontSize:20 }}>This invite has expired.</div>
    </div>
  );
  if (rewarded) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg,#10151c 60%,#232b38 100%)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ maxWidth: 420, margin: 'auto', fontFamily: 'Inter, system-ui', padding: 32, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002', textAlign:'center', color:'#a3e635', fontWeight:600, fontSize:20 }}>Invite claimed! You have been rewarded.<br/>Returning to wallet…</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(120deg,#10151c 60%,#232b38 100%)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ maxWidth: 420, margin: 'auto', fontFamily: 'Inter, system-ui', padding: 32, background: '#10151c', borderRadius: 18, boxShadow: '0 2px 16px #0002', textAlign:'center' }}>
        <h2 style={{ marginBottom: 10, fontWeight: 700, fontSize: 26, color: '#a3e635', letterSpacing: -1 }}>Invite a Friend</h2>
        <p style={{ color: '#fff', opacity: 0.8, marginBottom: 18, fontSize: 16 }}>Tell your friend who is not using this wallet to scan using their scanner, and get yourself some Mallcoins!</p>
        <div style={{ margin:'24px auto', display:'flex', justifyContent:'center' }}>
          <QRCode value={window.location.origin + `/invite/claim?inviteId=${inviteId}`} size={180} style={{ boxShadow:'0 2px 8px #a3e63544', borderRadius:12, background:'#181f29', padding:12 }} />
        </div>
        <div style={{ fontSize:14, color:'#a3e635', marginTop:18 }}>This invite will expire after it is claimed.</div>
      </div>
    </div>
  );
}

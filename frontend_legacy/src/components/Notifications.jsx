import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function Notifications({ address }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    axios.get(`/api/notifications/${address}`)
      .then(res => setNotifications(res.data.notifications || []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [address]);

  if (!address) return null;
  if (loading) return <div style={{ color: '#a3e635' }}>Loading notifications…</div>;
  if (!notifications.length) return <div style={{ color: '#fff', opacity: 0.7 }}>No notifications.</div>;

  return (
    <div style={{ color: '#fff', fontSize: 15 }}>
      <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
        {notifications.map(n => (
          <li key={n.id} style={{ marginBottom: 10, background: '#232b38', borderRadius: 8, padding: 10 }}>
            <span style={{ color: '#a3e635', fontWeight: 600 }}>{n.title || 'Notification'}:</span> {n.message || JSON.stringify(n)}
          </li>
        ))}
      </ul>
    </div>
  );
}

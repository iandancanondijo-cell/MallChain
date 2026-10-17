import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export interface PublicStatus {
  locked: boolean;
  reason?: string;
  banner?: { title: string; message: string; level?: 'info' | 'warning' | 'critical' } | null;
  tasks?: unknown[]; // active mining tasks the admin published
}

const tone: Record<string, CSSProperties> = {
  info: { background: '#161E2B', color: '#EAEDF3' },
  warning: { background: '#F6B21B', color: '#1a1203' },
  critical: { background: '#FF7A70', color: '#1a0604' },
};

/**
 * Wrap your user-facing app with this. It polls the backend's public status
 * (GET {apiUrl}/api/public/status -> { locked, reason, banner, tasks }) and:
 *   - shows the admin's broadcast banner at the top of every page,
 *   - replaces the whole app with a maintenance screen while the system lock is on.
 * Your backend must also refuse API requests while locked. This component only displays the state.
 */
export default function PlatformGate({
  apiUrl, children, pollMs = 15000, onStatus,
}: { apiUrl: string; children: ReactNode; pollMs?: number; onStatus?: (s: PublicStatus) => void }) {
  const [status, setStatus] = useState<PublicStatus>({ locked: false });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${apiUrl}/api/public/status`, { cache: 'no-store' });
        if (!r.ok) return;
        const s = (await r.json()) as PublicStatus;
        if (alive) { setStatus(s); onStatus?.(s); }
      } catch { /* keep the last known state if the request fails */ }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => { alive = false; clearInterval(id); };
  }, [apiUrl, pollMs, onStatus]);

  if (status.locked) {
    return (
      <div role="alert" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#07090F', color: '#EAEDF3', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ margin: '0 0 12px', fontSize: 30 }}>Mallchain is offline for now</h1>
          <p style={{ margin: 0, color: '#8D97A9' }}>
            {status.reason || 'We are carrying out an urgent check. Your funds are safe. Please come back shortly.'}
          </p>
        </div>
      </div>
    );
  }

  const b = status.banner;
  return (
    <>
      {b && (
        <div role="status" style={{ padding: '10px 16px', textAlign: 'center', fontFamily: 'system-ui, sans-serif', ...(tone[b.level || 'info'] ?? tone.info) }}>
          <b>{b.title}.</b> {b.message}
        </div>
      )}
      {children}
    </>
  );
}

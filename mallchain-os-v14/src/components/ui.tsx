/**
 * Shared UI primitives: Modal, Toast system, StatusChip, ScoreRing,
 * Chart (bar/line), Stepper, EmptyState, Spinner button helper.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { store } from '../store/store';

/* ---------------- Modal ---------------- */
export function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <span className="modal-close" onClick={onClose}>✕</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Toast system ---------------- */
export interface ToastItem { id: number; text: string; ok?: boolean }
export const toastBus = {
  listeners: new Set<(t: ToastItem) => void>(),
  emit(t: ToastItem) { this.listeners.forEach((fn) => fn(t)); },
};
let toastSeq = 1;
export function toast(text: string, ok = true) {
  toastBus.emit({ id: toastSeq++, text, ok });
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const fn = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4200);
    };
    toastBus.listeners.add(fn);
    return () => { toastBus.listeners.delete(fn); };
  }, []);
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div key={t.id} className={'toast' + (t.ok ? ' ok' : ' err')}>
          <span>{t.ok ? '✓' : '✕'}</span>
          <span>{t.text}</span>
          <span className="t-close" onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))}>✕</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- StatusChip ---------------- */
export function StatusChip({ status }: { status: string }) {
  const cls = (s: string) =>
    s === 'approved' || s === 'confirmed' || s === 'delivered' || s === 'passed' ? 'b-approved'
    : s === 'rejected' || s === 'failed' || s === 'defeated' || s === 'cancelled' ? 'b-rejected'
    : s === 'active' || s === 'voting' || s === 'pending' || s === 'transit' ? 'b-pending'
    : 'b-live';
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, ' ');
  return <span className={'mc-badge ' + cls(status)}>{label}</span>;
}

/* ---------------- ScoreRing ---------------- */
export function ScoreRing({ pct, size = 72, label }: { pct: number; size?: number; label?: string }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="score-ring" style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gold)" strokeWidth={5} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 50 50)" />
      </svg>
      <div className="ring-txt">{pct}%</div>
    </div>
  );
}

/* ---------------- BarChart ---------------- */
export function BarChart({ data, labels, height = 150, color }: { data: number[]; labels?: string[]; height?: number; color?: string }) {
  const max = Math.max(...data, 1);
  const bars = data.map((v, i) => (
    <div key={i} className="chart-bar" style={{ height: `${(v / max) * 100}%`, background: color ? `linear-gradient(180deg, ${color}, ${color}44)` : undefined }}>
      <span className="tip">{labels?.[i] ?? ''} — {v}</span>
    </div>
  ));
  return (
    <div className="chart-wrap">
      <div className="chart-bars" style={{ height }}>{bars}</div>
      {labels && <div className="chart-x">{labels.map((l, i) => <span key={i}>{l}</span>)}</div>}
    </div>
  );
}

/* ---------------- LineChart (SVG polyline) ---------------- */
export function LineChart({ data, height = 150, color = 'var(--gold)' }: { data: number[]; height?: number; color?: string }) {
  const w = 300;
  const h = height;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - ((v - min) / Math.max(max - min, 1)) * (h - 20) - 10;
    return `${x},${y}`;
  }).join(' ');
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity={0.08} />
      </svg>
    </div>
  );
}

/* ---------------- Stepper ---------------- */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <span key={i} className={'step' + (i < current ? ' done' : i === current ? ' active' : '')}>
          <span className="dot">{i < current ? '✓' : i + 1}</span>
          {s}
        </span>
      ))}
    </div>
  );
}

/* ---------------- EmptyState ---------------- */
export function EmptyState({ icon = '🛰️', title, message, cta }: { icon?: string; title: string; message: string; cta?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="es-ico">{icon}</div>
      <div className="es-t">{title}</div>
      <div className="es-m">{message}</div>
      {cta}
    </div>
  );
}

/* ---------------- hooks ---------------- */
export function useStoreVersion() {
  const [, setV] = useState(0);
  useEffect(() => {
    return store.subscribe(() => setV((v) => v + 1));
  }, []);
}

export function fmtNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n * 100) / 100);
}

export function fmtMoney(n: number, currency = 'USD'): string {
  const sym: Record<string, string> = { USD: '$', KES: 'KSh ', EUR: '€', GBP: '£' };
  return sym[currency] + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

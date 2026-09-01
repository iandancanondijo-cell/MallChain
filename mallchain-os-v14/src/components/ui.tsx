/**
 * Shared UI primitives: Modal, Toast system, StatusChip, ScoreRing,
 * Chart (bar/line), Stepper, EmptyState, Spinner button helper.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck } from 'lucide-react';
import { store } from '../store/store';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ---------------- Modal ---------------- */
export function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus was somewhere in the page (whatever triggered this modal) —
    // restore it there on close instead of leaving focus on <body>/wherever
    // the modal's own last-focused element happened to be, which is what a
    // keyboard/screen-reader user would otherwise be silently dropped into.
    const trigger = document.activeElement as HTMLElement | null;

    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first || dialogRef.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      // Cycle focus within the dialog — without this a Tab/Shift+Tab
      // eventually lands back on the sidebar/topbar/background route while
      // the modal is still open and visually blocking it.
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className={'modal' + (wide ? ' wide' : '')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Toast system ---------------- */
export interface ToastAction { label: string; onClick: () => void }
export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export interface ToastItem { id: number; text: string; ok?: boolean; kind?: ToastKind; action?: ToastAction; durationMs?: number }
export const toastBus = {
  listeners: new Set<(t: ToastItem) => void>(),
  emit(t: ToastItem) { this.listeners.forEach((fn) => fn(t)); },
};
let toastSeq = 1;

/** Plain success/error toast — kept boolean for the ~50 existing call sites. Use toastKind() for info/warning. */
export function toast(text: string, ok = true) {
  toastBus.emit({ id: toastSeq++, text, ok, kind: ok ? 'success' : 'error' });
}

/**
 * A toast for states that are neither success nor failure — "info" for
 * neutral/expected notices (e.g. a feature window opening), "warning" for
 * something the user should act on but that isn't itself an error (e.g. a
 * pending security migration). Previously every non-success toast (this
 * included) rendered as a red error toast, which is what "PIN migration
 * required" — a routine one-time prompt, not a failure — looked like.
 */
export function toastKind(text: string, kind: 'info' | 'warning', durationMs?: number) {
  toastBus.emit({ id: toastSeq++, text, ok: kind !== 'warning', kind, durationMs });
}

/** A toast with an action button (e.g. "Undo"), shown longer than a plain toast so there's time to act on it. */
export function toastAction(text: string, action: ToastAction, ok = true, durationMs = 6000) {
  toastBus.emit({ id: toastSeq++, text, ok, kind: ok ? 'success' : 'error', action, durationMs });
}

/**
 * Gmail-style undo: `doAction` is delayed by `windowMs` instead of running
 * immediately, with an "Undo" toast offering to cancel it before it fires.
 * For actions cheap/safe to reverse (badge grant, void issuance, KYC
 * decision) rather than truly irreversible ones (ban/delete), which use a
 * confirm modal instead.
 */
export function scheduleUndoable(doAction: () => void | Promise<void>, message: string, windowMs = 5000) {
  let cancelled = false;
  const timer = setTimeout(() => { if (!cancelled) doAction(); }, windowMs);
  toastAction(message, {
    label: 'Undo',
    onClick: () => {
      cancelled = true;
      clearTimeout(timer);
      toast('Undone', true);
    },
  }, true, windowMs + 1000);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const fn = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.durationMs ?? 4200);
    };
    toastBus.listeners.add(fn);
    return () => { toastBus.listeners.delete(fn); };
  }, []);
  const iconFor = (kind: ToastKind): string =>
    kind === 'error' ? '✕' : kind === 'warning' ? '⚠' : kind === 'info' ? 'ℹ' : '✓';

  return (
    <div className="toast-wrap" aria-live="polite" role="status">
      {items.map((t) => {
        const kind = t.kind ?? (t.ok ? 'success' : 'error');
        return (
        <div key={t.id} className={`toast ${kind}`}>
          <span aria-hidden="true">{iconFor(kind)}</span>
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="link-btn"
              style={{ marginLeft: 8, color: 'inherit', fontWeight: 700 }}
              onClick={() => { t.action!.onClick(); setItems((p) => p.filter((x) => x.id !== t.id)); }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="t-close" aria-label="Dismiss" onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))}>✕</button>
        </div>
        );
      })}
    </div>
  );
}

/* ---------------- StatusChip ---------------- */
export function StatusChip({ status }: { status: string | null | undefined }) {
  const cls = (s: string) =>
    s === 'approved' || s === 'confirmed' || s === 'delivered' || s === 'passed' || s === 'success' || s === 'resolved' || s === 'completed' ? 'b-approved'
    : s === 'rejected' || s === 'failed' || s === 'defeated' || s === 'cancelled' ? 'b-rejected'
    : s === 'active' || s === 'voting' || s === 'pending' || s === 'transit' || s === 'pending_review' || s === 'payout_initiated' || s === 'detected' || s === 'compensating' || s === 'pending_manual' ? 'b-pending'
    : 'b-live';
  const icon = (s: string) => {
    switch (s) {
      case 'approved': case 'confirmed': case 'delivered': case 'passed': case 'success': case 'resolved': case 'completed': return '✓ ';
      case 'rejected': case 'failed': case 'defeated': case 'cancelled': return '✕ ';
      case 'active': case 'voting': case 'pending': case 'transit': case 'pending_review': case 'payout_initiated': case 'detected': case 'compensating': case 'pending_manual': return '⏳ ';
      default: return '• ';
    }
  };
  // Data from the backend isn't always guaranteed to have this field set
  // (e.g. a document written before a schema default existed) — a missing
  // status shouldn't crash the whole page over a single badge.
  const safeStatus = status || 'unknown';
  const label = safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1).replace(/-/g, ' ');
  return <span className={'mc-badge ' + cls(safeStatus)} aria-label={label} role="status">{icon(safeStatus)}{label}</span>;
}

/* ---------------- BadgeCheckmark ---------------- */
/** Gold checkmark shown next to a username — earned via the 7-day activity streak or bought for KSh 17. */
export function BadgeCheckmark({ size = 14 }: { size?: number }) {
  return (
    <span
      style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 4, lineHeight: 0 }}
      title="Mallchain badge — earned via a 7-day activity streak or purchase"
    >
      <BadgeCheck size={size} color="var(--gold)" />
    </span>
  );
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

/**
 * Formats a real amount in any real ISO 4217 currency, using the browser's
 * own currency-formatting data instead of a hand-maintained symbol table.
 * Formats using the browser's OWN locale (not a hardcoded 'en-US') so a
 * Kenyan user sees "Ksh 1,234.50" rather than the bare "KES 1,234.50" code
 * — Intl only resolves the natural local symbol when the locale matches
 * the currency's home region.
 */
export function fmtMoney(n: number, currency = 'USD'): string {
  try {
    const locale = navigator.language || 'en-US';
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    // Intl doesn't recognize the code (shouldn't happen for a real ISO 4217 currency) — fall back to a plain code prefix rather than crashing.
    return `${currency} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
}

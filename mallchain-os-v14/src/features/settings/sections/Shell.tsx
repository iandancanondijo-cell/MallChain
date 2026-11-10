import React from 'react';

/**
 * The three primitives every block on Profile & Settings is built from.
 *
 * The page used to be one file of hand-placed cards whose order reflected what
 * had been added when, so two cards could report the same fact in different
 * words ("Verification status" and "Account"), and a card that had no data
 * simply vanished — which a person reads as "turned off". These three make the
 * two things that were missing structural: an explicit order, and a card that
 * can say it has nothing to show.
 */

export interface StepProps {
  /** 1-based position in the page. Rendered as the card's badge and matched by the nav. */
  index: number;
  /** Stable id, also the nav target. */
  id: string;
  /** Shown as the accessible name of the region. */
  label: string;
  children: React.ReactNode;
}

export function Step({ index, id, label, children }: StepProps) {
  return (
    <div
      className="ps-step"
      id={id}
      data-index={index}
      role="group"
      aria-label={`${index}. ${label}`}
    >
      {children}
    </div>
  );
}

export interface CardProps {
  title: string;
  /** One line saying what deciding here actually changes. */
  hint?: string;
  /** Right-aligned status chip — server truth, never a guess. */
  state?: React.ReactNode;
  /** Actions that belong to the header rather than the body. */
  actions?: React.ReactNode;
  /**
   * Set this when the data behind the card could not be read. The card then
   * renders one honest sentence instead of dashes, zeroes or defaults that look
   * like answers.
   */
  missing?: string;
  onRetry?: () => void;
  busy?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Card({ title, hint, state, actions, missing, onRetry, busy, children, footer }: CardProps) {
  return (
    <div className="card card-glow bg-gradient-card ps-card">
      <div className="sec-title">
        <h2>{title}</h2>
        {state}
        {actions && <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>{actions}</div>}
      </div>
      {hint && <p className="ps-hint">{hint}</p>}

      {missing ? (
        <div className="ps-missing" role="status">
          <span>
            Not loaded: {missing} Nothing here is filled in from an assumption —
            the card stays empty until that read succeeds.
          </span>
          {onRetry && (
            <button className="btn btn-ghost btn-sm" onClick={onRetry} disabled={busy}>
              {busy ? 'Retrying…' : 'Try again'}
            </button>
          )}
        </div>
      ) : (
        <>
          {children}
          {footer && <div className="ps-footer">{footer}</div>}
        </>
      )}
    </div>
  );
}

/** One fact per row, with the value on the right. `state` colours it. */
export function InfoRow({ label, note, value, tone = 'default' }: {
  label: string;
  note?: string;
  value: React.ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'bad' | 'muted';
}) {
  const color = tone === 'ok' ? 'var(--green)' : tone === 'bad' ? 'var(--red)' : tone === 'warn' ? 'var(--warning)' : tone === 'muted' ? 'var(--txt-3)' : undefined;
  return (
    <div className="flag-row">
      <div className="desc">
        <div className="t">{label}</div>
        {note && <div className="m">{note}</div>}
      </div>
      {typeof value === 'string' || typeof value === 'number' ? (
        <span className="chip" style={color ? { color, borderColor: color } : undefined}>{value}</span>
      ) : (
        value
      )}
    </div>
  );
}

/**
 * A switch whose position is not the answer. The parent owns the write, so the
 * row can show the server's reply instead of leaving the click on screen.
 */
export function ToggleRow({ label, note, checked, onChange, disabled }: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flag-row">
      <div className="desc">
        <div className="t">{label}</div>
        {note && <div className="m">{note}</div>}
      </div>
      <label className="switch">
        <input
          type="checkbox"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="track" /><span className="knob" />
      </label>
    </div>
  );
}

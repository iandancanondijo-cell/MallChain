import { useId, useState, type ReactNode, type KeyboardEvent } from 'react';

interface TooltipProps {
  text: string;
  children?: ReactNode;
}

/**
 * Lightweight accessible tooltip. Wraps `children` (making them focusable)
 * if given, otherwise renders a standalone "ⓘ" info trigger. Shows on
 * hover/focus, dismisses on blur/mouseleave/Escape.
 */
export function Tooltip({ text, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const close = () => setOpen(false);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  return (
    <span className="tooltip-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={close}>
      {children ? (
        <span
          tabIndex={0}
          className="tooltip-target"
          aria-describedby={id}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
        >
          {children}
        </span>
      ) : (
        <button
          type="button"
          className="tooltip-trigger"
          aria-describedby={id}
          aria-label={`More info: ${text}`}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
        >
          ⓘ
        </button>
      )}
      <span role="tooltip" id={id} className={`tooltip-bubble${open ? ' open' : ''}`}>
        {text}
      </span>
    </span>
  );
}
